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


module.exports = {
  processResort: processResort,
  processShop: processShop,
  mapParams: mapParams
}

function processResort(paramsIn) {
  var defer = q.defer();
  var promises = [];
  mapParams(paramsIn)
  .then(function(mappedParams){
    console.log('skiset:: processResort started', mappedParams.us.resort_id);
    firebase.database().ref().child('raw/www_skiset_co_uk/ajaxmotor/getshops/ncr/2/resort/').child(mappedParams.them.resort_id).child('response/list').once('value')
    .then(function(snap){
      if (snap.exists()){
        console.log('skiset:: processResort shops found', snap.val().length);
        snap.forEach(function(shopSnap){
          var shop = shopSnap.val();
          mappedParams.them.shop_id = shop.key;
          mappedParams.them.name = shop.value;
          mappedParams.us.shop_id = slug(shop.value).toLowerCase();
          console.log('skiset:: processResort shop', mappedParams.us.shop_id);
          promises.push(processShop(mappedParams));
        })
        defer.resolve(q.all(promises));
      } else {
        // err handle
        defer.reject('skiset:: Error');
      }
    })
  })
  return defer.promise;
}

function processShop(params) {
  console.log('skiset:: Process Shop', params.us.shop_id);
  return q.all([
    processShopPrices(params),
    processShopDiscounts(params)
  ])
}


function processShopPrices(params){
  var defer = q.defer();
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  var rawUrl = 'raw/www_skiset_co_uk/booking/catalog/'+ params.them.resort_id +'/'+ params.them.shop_id +'/'+ params.them.first_day +'/'+ params.them.duration + '/offers'
  return firebase.database().ref(rawUrl).once('value')
  .then(function(snap){
    console.log('skiset:: Looking up Shop Prices', rawUrl, snap.exists());
    if (snap.exists()){
      snap.forEach(function(offerSnap){
        var offer = offerSnap.val();
        console.log('skiset:: Looking up productDetails', offer.offertype, params.us.duration);
        var productDetails = getProductDetails(offer, params.us.duration);

        if(productDetails){
          var catId = productDetails.productData.category;
          var levelId = productDetails.productData.level?productDetails.productData.level:0;
          // var productKey = productDetails.productData.category + (productDetails.productData.level?productDetails.productData.level:'');
          // firebase.database().ref(dataProductUrl).child(productKey).update(productDetails.productData);
          // firebase.database().ref(dataProductUrl).child(productKey).child('prices').update(productDetails.productPrices);
          // firebase.database().ref(dataDiscountUrl).child(productKey).update(productDetails.discountData);

          console.log('skiset:: Process Shop Prices', productDetails.name, catId, levelId );

          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skiset/price').set(productDetails.price);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skiset/name').set(productDetails.name);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skiset/discount').set(productDetails.discount);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skiset/full_price').set(productDetails.full_price);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skiset/options').set(productDetails.options);

          // productList = productList.concat(productDetails);
        }
      })
      defer.resolve(productList);
    } else {
      defer.reject('skiset:: Couldnt find shop data')
    }
  })
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


function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var paramsOut = {
    us: params,
    them: {}
  };
  // lookup the resort id
  firebase.database().ref().child('resorts').child(params.resort_id).child('alias/skiset').once("value")
  .then(function(resortSnap){
    if (resortSnap.exists()) {
      paramsOut.them = resortSnap.val();
      paramsOut.them.first_day =  params.start;
      paramsOut.them.duration =  params.duration;
      paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start);  // using lastSaturday
      paramsOut.them.datestamp =  common.getLastSaturdayString(params.start);  // using lastSaturday
      paramsOut.us.datestamp = common.getTodayString();

      console.log('skiset:: mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
      defer.resolve(paramsOut);
    } else {
      console.log('skiset:: Unknown resort_id passed in to Skiset');
      defer.reject('Unknown resort_id passed in to Skiset')
    }
  })

  return defer.promise;
}

// example of sks parameters
// {
//   resort_id: 105,
//   country_id: 3,
//   first_day: "2016-12-24",
//   timestamp: 1482577200,
//   duration: 6,
// };


/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???
/// OLD BELOW HERE???




// function processResortRequest(err, res, body) {
//     var country = res.request.data;
//     var resortsInCountry = JSON.parse(body).response.list;
//     Object.keys(resortsInCountry).forEach(function(i){
//       var resort = resortsInCountry[i];
//       var name = resort.value;
//       var supplierId = resort.key;
//       var id = slug(name, {lower: true});
//       var resortData = {
//         "name": name,
//         "id": id,
//         "country_id": country.country_id
//       }

//       firebase.database().ref().child('resorts').child(id).update(resortData).then(function(){
//         var alias = {"skiset": {"resort_id": supplierId, "country_id": country.alias}};
//         firebase.database().ref().child('resorts').child(id).child('alias').set(alias).then(function(){
//           resortData.alias = alias;
//           getShopsForResort(resortData);
//         });
//       });

//     })
//   }


// function processShopsRequest(err, res, body) {
//   var resortData = res.request.data;
//   var shopsInResort = JSON.parse(body).response.list;
//   Object.keys(shopsInResort).forEach(function(i){
//     var shop = shopsInResort[i];
//     var name = shop.value;
//     var supplierId = shop.key;
//     var shopAlias = resortData.alias;
//     shopAlias.skiset.shop_id = supplierId;
//     var id = resortData.id +'-'+ slug(name, {lower: true});
//     firebase.database().ref().child('shops').child(id).update({
//       "name": name,
//       "id": id,
//       "resort_id": resortData.id
//     }).then(function(){
//       firebase.database().ref().child('shops').child(id).child('suppliers').set(shopAlias);
//     });
//   })
// }

// function scrapeShopPrices(params) {
//   var defer = q.defer();
//   var requestDate = new Date(params.first_day);
//   var dateKey = new Date(requestDate.setDate(requestDate.getDate() - requestDate.getDay()-1)).getTime()/1000;
//   var rawUrl = '/raw/skiset/countries/'+ params.country_id +'/resorts/'+ params.resort_id +'/shops/'+ params.shop_id +'/products';
//   var dataProductUrl = '/suppliers/skiset/'+ params.shop_id +'/products';
//   var dataDiscountUrl = '/suppliers/skiset/'+ params.shop_id +'/discounts/'+ dateKey;
//   var compareProductUrl = '/compare/'+ params.paramsIn.resort_id +'/'+ dateKey+'/'+ params.paramsIn.duration;

//   var priceRequest = {
//     uri: 'http://www.skiset.co.uk/',
//     method: 'POST',
//     followRedirect: true,
//     followAllRedirects: true,
//     jar: true,
//     form: {
//       country_id: params.country_id,
//       resort_id: params.resort_id,
//       shop_id: params.shop_id,
//       duration: params.duration,
//       first_day: params.first_day
//     },
//     data: params
//   }

//   firebase.database().ref(rawUrl).once('value').then(function(snap){
//     console.log('skiset:: Looking for', rawUrl)
//     if (snap.exists()){
//       console.log('skiset:: Using cached PRICE data')
//       processPriceRequest(null, null, snap.val());
//     } else {
//       console.log('skiset:: NEW priceRequest')
//       request(priceRequest, processPriceRequest);
//     }
//   })

//   request(priceRequest, processPriceRequest);

//   return defer.promise;


//   function processPriceRequest(err, res, body) {
//     if (err) defer.reject(err);
//     var data;
//     var params = res.request.data;
//     var productList = [];
//     // assuming that SKS discounts are valid for whole week running SAT-FRI
//     if (typeof body == 'string') {
//       // WHOA THERE!!!!
//       var jsonString = /(?:initCatalog)(.*)/.exec(body);
//       data = eval(jsonString[1]);
//     } else {
//       data = body;
//     }

//     var offers = data.offers;

//     firebase.database().ref(rawUrl).set(data);

//     Object.keys(offers).forEach(function(key){
//       var productIn = offers[key];
//       var productDetails = getProductDetails(productIn, params.duration);
//       if(productDetails){
//         var catId = productDetails.productData.category;
//         var levelId = productDetails.productData.level?productDetails.productData.level:0;
//         var productKey = productDetails.productData.category + (productDetails.productData.level?productDetails.productData.level:'');
//         firebase.database().ref(dataProductUrl).child(productKey).update(productDetails.productData);
//         firebase.database().ref(dataProductUrl).child(productKey).child('prices').update(productDetails.productPrices);
//         firebase.database().ref(dataDiscountUrl).child(productKey).update(productDetails.discountData);

//         firebase.database().ref(compareProductUrl).child(catId).child(levelId).child('shops/skiset/price').set(productDetails.price);
//         firebase.database().ref(compareProductUrl).child(catId).child(levelId).child('shops/skiset/discount').set(productDetails.discount);
//         firebase.database().ref(compareProductUrl).child(catId).child(levelId).child('shops/skiset/full_price').set(productDetails.full_price);

//         productList = productList.concat(productDetails);
//       }
//     })

//     // firebase.database().ref(dataProductUrl).set(prices);

//     defer.resolve(productList)
//   }
// }



// function getOptionPrices(packs, duration) {
//   if (!packs.length || packs.length<2) return null
//   var out = {};
//   out.category = "B";
//   out.name = "Boots";
//   out.prices = {};
//   out.prices["days_"+ duration] = packs[1].full_price - packs[0].full_price;
//   return out;
// }


