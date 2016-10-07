/**
 * Module dependencies
 */

var request       = require('request');
var cheerio       = require('cheerio');
var firebase      = require("firebase");
var q             = require('q');
var slug          = require("slug");
var common        = require("../common");
var referenceData = require("./data/reference.json");
var resorts       = require("./data/resorts.json");
var cache         = require('Simple-Cache').SimpleCache("tmp/websites/sport2000fr", console.log);

module.exports = {
  fetchResort: fetchResort,
  setUp: setUp
}


//var rawUrl = 'raw/location-ski_sport2000_fr/json/shops/resort/'+ params.them.resort_id
function setUp(){
  [{'andorra':'ANDORRE'},{'france':'FRANCE'}].forEach(setUpCountry)
}

function setUpCountry(filterOn) {
  var defer = q.defer();
  var promises = [];
  var ourCountryId = Object.keys(filterOn)[0];
  var theirCountryId = filterOn[ourCountryId];
  resorts.forEach(function(resort){
    var supplierCountryId = resort.country.name;
    var countryId = referenceData.countries[resort.country.name];
    var resortSlug = resort.slug;
    var supplierResortId = resort.id;
    if (resort.type=='station' && supplierCountryId==theirCountryId){
      console.log('[sport2000fr] Saving resort for country', ourCountryId, supplierCountryId, resortSlug, supplierResortId);

      var params = {
        us: {
          'country_id': ourCountryId
        },
        them: {
          'country_id': supplierCountryId,
          'resort_id': supplierResortId,
          'resort_name': resort.name,
          'supplier': 'sport2000fr'
        }
      }
      console.log('[sport2000fr] setup', resort.name)
      promises.push(common.geoCodeResort(params));
    }

  })
  q.all(promises).then(function(){
    defer.resolve('[sport2000fr] All resorts mapped')
  })
  return defer.promise;
}

function fetchResort(paramsIn) {
  var defer = q.defer();
  mapParams(paramsIn)
  .then(function(params){
    var uri = 'https://location-ski.sport2000.fr/json/shops/resort/'+ params.them.resort_id;
    console.log('[sport2000fr] fetchResort', uri)
    cache.get(uri, function(callback){
      shopsRequest = {
        uri: uri,
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        }
      }
      request(shopsRequest, function(err, res, body){
        var response = JSON.parse(body);
        callback(response);
      })
    }).fulfilled(function(data) {
      var shops = data[0].shops;
      var promises = [];
      shops.forEach(function(shop){
        var p = JSON.parse(JSON.stringify(params));
        p.them.shop_id = shop.id;
        p.them.shop_name = shop.name;
        console.log('[sport2000fr] scrape shop', shop.name)
        promises.push(
          common.findShop(p)
          .then(function(shop){
            p.us.shop_id = shop.place_id;
            return scrapeShopPrices(p)
          })
          .then(function(products){
            p.them.products = products;
            return scrapeShopDiscounts(p)
          })
          .then(function(discounts){
            p.them.discounts = discounts;
            return processShop(p)
          })
        )
      });
    })
  });
  return defer.promise;
}

function processShop(params){
  var defer = q.defer();
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  var products = params.them.products;
      console.log('[sport2000fr] Got', Object.keys(products).length , 'products');
  Object.keys(products).forEach(function(key){
    var product = products[key];
    var details = getProductDetails(product, params.them.discounts[product.id].discounts['value'+params.us.duration], params.us.duration);
    if (details){
      details.forEach(function(p){
        var catId = p.category;
        var levelId = p.level ? p.level : '0';
        console.log('[sport2000fr] Got price products', p.name, p.category, p.level);
        delete p.category;
        delete p.level;
        firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/sport2000fr').set(p);
        firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/sport2000fr').child(catId).child(levelId).set(p);

        firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/sport2000fr/best_discount').set(p.discount);
      })
    } else {
      console.log('[sport2000fr] NO price products', product.id);
    }
  })
  defer.resolve('All done')

  // // productsSnap.forEach(function(categorySnap){
  // //   var priceData = categorySnap.val();
  // //   var productId = priceData.id;
  //   var products = getProductDetails(params.them.prices, params.them.discounts[productId].discounts['value'+params.us.duration], params.us.duration);
  //   if (products.length > 0) {
  //     products.forEach(function(p){
  //       var catId = p.category;
  //       var levelId = p.level ? p.level : '0';
  //       console.log('[sport2000fr] Got price products111111111', p.name, p.category, p.level);
  //       delete p.category;
  //       delete p.level;
  //       firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/sport2000fr').set(p);
  //     })
  //     defer.resolve('All done')
  //     // productList = productList.concat(products);
  //   }
  // // })
  return defer.promise;
}


function scrapeShopDiscounts(params) {
  var defer = q.defer();
  var uri = 'https://location-ski.sport2000.fr/json/product/discount/'+ params.them.shop_id +'/'+ params.them.timestamp/1000;
  var discountRequest = {
    uri: uri,
    method: 'GET',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    data: defer
  }
  cache.get(uri, function(callback){
    console.log('[sport2000fr] requesting', uri);
    request(discountRequest, function(err, res, body){
      var response = JSON.parse(body);
      callback(response);
    });
  }).fulfilled(function(data) {
    console.log('[sport2000fr] scrapeShopDiscounts resolved');
    defer.resolve(data);
  })

  return defer.promise;

}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var uri = 'https://location-ski.sport2000.fr/json/product/price/'+ params.them.shop_id;
  var priceRequest = {
    uri: uri,
    method: 'GET',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    data: params
  }
  cache.get(uri, function(callback){
    console.log('[sport2000fr] requesting', priceRequest.uri);
    request(priceRequest, function(err, res, body){
      var response = JSON.parse(body);
      callback(response);
    });
  }).fulfilled(function(data) {
    console.log('[sport2000fr] scrapeShopPrices resolved');
    defer.resolve(data);
  })

  return defer.promise;
}


function getProductDetails(productIn, discount, duration){
  var id = productIn.id;
  var products = [];
  var product = {};
  var s2kproduct;
  var level;

  // lookup details of productId
  Object.keys(referenceData.products).forEach(function(key){
    s2kproduct = referenceData.products[key].id == id ? referenceData.products[key] : s2kproduct;
  });

  // create a product per category
  if (s2kproduct && s2kproduct.level_ski && s2kproduct.category_ids) {
    s2kproduct.category_ids.forEach(function(category_id){
      if (category_id==3) {
        var lookup = referenceData.categories[category_id];
        var level = "L"+ s2kproduct.level_ski.reference;
        var full_price = parseFloat(productIn.prices['value'+duration]);
        var price = (full_price * (1-discount/100)).toFixed(2);
        if (!isNaN(full_price)){
          var product = {
            name: s2kproduct.reference || null,
            category: lookup.category || null,
            level: level || null,
            discount: parseInt(discount),
            full_price: (isNaN(full_price) ? null : parseFloat(full_price)),
            price: (isNaN(full_price) ? null : parseFloat(price)),
            option_as_pack: productIn.option_as_pack || null
          }
          console.log('[sport2000fr] getProductDetails', product.name)
          products.push( product );
        }
      }
    })
  } else {
    return null;
  }


  return products;
}


function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var key = 'resorts/'+ params.resort_id +'/alias/sport2000fr';
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
        console.log('[sport2000fr] Unknown resort_id passed in', key);
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.make_owner = true;
    paramsOut.them.supplier =  'sport2000fr';
    paramsOut.them.first_day =  params.start;
    paramsOut.them.duration =  params.duration;
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start);
    paramsOut.us.datestamp = common.getTodayString();
    paramsOut.refresh = params.refresh;
    console.log('[sport2000fr] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  return defer.promise;
}




