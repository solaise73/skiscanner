/**
 * Module dependencies
 */

var common        = require('../common');
var request       = require('request');
var cheerio       = require('cheerio');
var firebase      = require("firebase");
var q             = require('q');
var slug          = require("slug");
var referenceData = require("./data/reference.json");
var cache         = require('Simple-Cache').SimpleCache("tmp/websites/snowrental", console.log);

module.exports = {
  fetchResort: fetchResort,
  setUp: setUp
}

function setUp(){
  [{'andorra':'3'},{'france':'1'}].forEach(setUpCountry)
}

function setUpCountry(filterOn) {
  var defer = q.defer();
  var promises = [];
  var ourCountryId = Object.keys(filterOn)[0];
  var theirCountryId = filterOn[ourCountryId];
  Object.keys(referenceData.country).forEach(function(country){
    var supplierCountryId = referenceData.country[country];
    if (supplierCountryId==theirCountryId){
      // firebase.database().ref().child('raw').child('www_snowrental_co_uk/ajaxmotor/getresorts').child(path).set(response)

      console.log('[snowrental] Getting resorts for country', country, supplierCountryId)
      resortRequest = {
        uri: 'http://www.snowrental.com/ajaxmotor/getresorts/ncr/2/country/'+ supplierCountryId,
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        }
      }

      request(resortRequest, function(err, res, body){
        var countryId = slug(country, {'lower': true});
        var extra = {'country_id': countryId};
        firebase.database().ref().child('countries/'+countryId).child('alias/snowrental').update({'country_id': supplierCountryId})
        saveResponse(err, res, body, extra)
        .then(function(data){
          data.response.list.forEach(function(resort){
            var params = {
              us: {
                'country_id': countryId,
                'resort_id': slug(resort.value, {lower: true})
              },
              them: {
                'country_id': supplierCountryId,
                'resort_id': resort.key,
                'resort_name': resort.value,
                'supplier': 'snowrental'
              }
            }
            console.log('[snowrental] setup', resort.value)
            promises.push(common.geoCodeResort(params));
          })
        })
      })
      q.all(promises).then(function(){
        defer.resolve('[snowrental] All resorts mapped')
      })
    }

  })
  return defer.promise;
}

// function getShopsForResort(resort) {
//   var uri = 'http://www.snowrental.com/ajaxmotor/getshops/ncr/2/resort/'+ resort.key;
//   shopsRequest = {
//     uri: uri,
//     headers: {
//       "X-Requested-With": "XMLHttpRequest"
//     }
//   }
//   request(shopsRequest, function(err, res, body){
//     var extra = {'shop_id': slug(resort.value, {'lower': true})}
//     saveResponse(err, res, body, extra)
//   })
// }


function fetchResort(paramsIn) {
  var defer = q.defer();
  var promises = [];
  var params = mapParams(paramsIn)
  .then(function(params){
    var uri = 'http://www.snowrental.com/ajaxmotor/getshops/ncr/2/resort/'+ params.them.resort_id;
    cache.get(uri, function(callback){
      shopsRequest = { uri: uri, headers: { "X-Requested-With": "XMLHttpRequest" } }
      request(shopsRequest, function(err, res, body){
        var data = JSON.parse(body);
        callback(data.response.list)
      })
    }).fulfilled(function(shops) {
      shops.forEach(function(shop){
        promises.push(fetchShop(shop, params));
      });
      defer.resolve( q.all(promises) );
    })
  })

  return defer.promise;
}

function fetchShop(shop, paramsIn){
  var defer = q.defer();
  var params = JSON.parse(JSON.stringify(paramsIn));
  var promises = [];
  params.them.shop_id = shop.key;
  params.them.shop_name = shop.value;
  console.log('[snowrental] fetchShop', shop.value, params.them.resort_name)
  common.findShop(params).then(function(shop){
    params.us.shop_id = shop.place_id;
    console.log('[snowrental] fetchResort found shop', params.us.shop_id)
    promises.push(scrapeShopPrices(params));
  })
  defer.resolve( q.all(promises) );
  return defer.promise;
}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var priceRequest = {
    uri: 'http://www.snowrental.com/',
    method: 'POST',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    form: {
      country_id: params.them.country_id,
      resort_id: params.them.resort_id,
      shop_id: params.them.shop_id,
      duration: params.them.duration,
      first_day: params.them.first_day,
      pjs: 'Sam. 17 Déc. 2016'
    }
  }
  var key = JSON.stringify(priceRequest.form);

  cache.get(key, function(callback){
    request(priceRequest, function(err, res, body){
      var data = extractDataAndSave(err, res, body, params)
      console.log('[snowrental] Saving price data', params.them.shop_id)
      callback(data);
    });
  }).fulfilled(function(data) {
    console.log('[snowrental] scrapeShopPrices', params.us.shop_id);
    processShopOffers(params, data.offers)
  })

  return defer.promise;
}

function processShopOffers(params, offers){
  var defer = q.defer();
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('[snowrental] processShopOffers', params.us.shop_id)

  Object.keys(offers).forEach(function(key){
    var offer = offers[key];
    var productDetails = getProductDetails(offer, params.us.duration);

    if(productDetails){
      var catId = productDetails.productData.category;
      var levelId = productDetails.productData.level?productDetails.productData.level:'0';
      console.log('[snowrental] Process Shop Prices', productDetails.name, catId, levelId, dataUrl, params.us.shop_id );

      firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/price').set(productDetails.price);
      firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/name').set(productDetails.name);
      firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/discount').set(productDetails.discount);
      firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/full_price').set(productDetails.full_price);
      firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/options').set(productDetails.options);

      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowrental').child(catId).child(levelId).child('price').set(productDetails.price);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowrental').child(catId).child(levelId).child('name').set(productDetails.name);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowrental').child(catId).child(levelId).child('discount').set(productDetails.discount);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowrental').child(catId).child(levelId).child('full_price').set(productDetails.full_price);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowrental').child(catId).child(levelId).child('options').set(productDetails.options);

      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowrental/best_discount').set(productDetails.discount);
      console.log('[snowrental] Process Shop Prices DONE', productDetails.name, catId, levelId, dataUrl, params.us.shop_id );

      // productList = productList.concat(productDetails);
    } else {
      console.log('[snowrental] processShopOffers no productDetails', offer.offertype );
    }
  })
  defer.resolve('All products recorded');
  return defer.promise;
}


function getProductDetails(productIn, duration){
  // for now we are only interested in adult skis/boards
  if (['men'].indexOf(productIn.agegender)<0)
    return null

  var lookup = referenceData.lookup;
  var productDetails = {
    productData: {
      name: productIn.offertype || null,
      category: lookup.category[productIn.equipment] || null,
      gender: lookup.gender[productIn.gender] || null,
      level: lookup.level[productIn.class] || null,
      options: {
        0: getOptionPrices(productIn.packs, duration)
      }
    },
    productPrices: {},
    discountData: {
      days: {},
      options: {
        "B": {"days":{}}
      }
    }
  }

  // Assuming that discount is the same for all day spans for sks for now
  for (var i=1; i<14; i++){
    productDetails.discountData.days["days_"+ i] = productIn.discounts.total;
    productDetails.discountData.options.B.days["days_"+ i] = productIn.discounts.total;
  }
  productDetails.productPrices["days_"+ duration] = productIn.packs[0].full_price;

  // details specific to the request
  productDetails.name = productIn.offer;
  productDetails.full_price = parseFloat(productIn.packs[0].full_price);
  productDetails.discount = parseFloat(productIn.discounts.total);
  productDetails.price = parseFloat((productDetails.full_price * (1-productDetails.discount/100)).toFixed(2));

  // calc the difference in price rather than absolute price
  var catId = referenceData.packLookups[productIn.packs[1].type] ? referenceData.packLookups[productIn.packs[1].type] : productIn.packs[1].type;
  productDetails.options = {};
  productDetails.options[catId] = {
    category: catId,
    full_price: (productIn.packs[1].full_price - productIn.packs[0].full_price),
    discount: productDetails.discount,
    price: parseFloat(((productIn.packs[1].full_price - productIn.packs[0].full_price) * (1-productDetails.discount/100)).toFixed(2))
  }

  if (productIn['helmet_pack']){
    productDetails.options['H'] = {
      category: 'H',
      full_price: productIn['helmet_pack'].full_price,
      discount: productDetails.discount,
      price: parseFloat((productIn['helmet_pack'].full_price * (1-productDetails.discount/100)).toFixed(2))
    }
  }
  return productDetails
}

function getOptionPrices(packs, duration) {
  if (!packs.length || packs.length<2) return null
  var out = {};
  out.category = "B";
  out.name = "Boots";
  out.prices = {};
  out.prices["days_"+ duration] = packs[1].full_price - packs[0].full_price;
  return out;
}

function extractDataAndSave(err, res, body, params){
  var jsonString;
  if (typeof body == 'string') {
    // WHOA THERE!!!!
    jsonString = /(?:initCatalog)(.*)/.exec(body);
    try {
      data = eval(jsonString[1]);
      console.log('[snowrental] extractDataAndSave VALID JSON');
    } catch (e) {
      console.log('[snowrental] extractDataAndSave NOT JSON');
      data = body;
    }
  } else {
    data = body;
  }
  // res.request.uri.pathname = res.request.uri.pathname + params.them.resort_id +'/'+ params.them.shop_id +'/'+ params.them.first_day+'/'+ params.them.duration;
  return data //saveResponse(err, res, JSON.stringify(data));
}

function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var key = 'resorts/'+ params.resort_id +'/alias/snowrental';
  var paramsOut = {
    us: params,
    them: {}
  };
  cache.get(key, function(callback){
    firebase.database().ref().child(key).once("value")
    .then(function(resortSnap){
      if (resortSnap.exists()) {
        callback(resortSnap.val())
      } else {
        console.log('[snowrental] Unknown resort_id passed in', key);
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.them.supplier =  'snowrental';
    paramsOut.them.first_day =  params.start;
    paramsOut.them.duration =  params.duration;
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.us.datestamp = common.getTodayString();
    console.log('[snowrental] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  return defer.promise;
}


