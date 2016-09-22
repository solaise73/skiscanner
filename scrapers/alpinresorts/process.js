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
// var resorts       = require("./data/resorts.json");


module.exports = {
  processResort: processResort,
  processShop: processShop,
  mapParams: mapParams
}


function processResort(paramsIn) {
  mapParams(paramsIn)
  .then(function(params){
    var rawUrl = 'raw/www_alpinresorts_com/en/ski-rental' +'/'+ params.them.country_id +'/'+ params.them.region_id +'/'+ params.them.resort_slug;
    console.log('alpinresorts:: rawUrl', rawUrl);
    firebase.database().ref().child(rawUrl).once('value')
    .then(function(snap){
      if (snap.exists()){
        snap.forEach(function(shopSnap){
          var shop = shopSnap.val();
          if (shop.inTown) {
            console.log('alpinresorts:: ', shop.name, 'IS in', params.us.resort_id)
            params.us.shop_id = slug(shop.name).toLowerCase();
            params.them.shop_id = shop.id;
            params.them.name = shop.name;
            saveShopDetails(shop, params);
            processShop(params);
          } else {
            console.log('alpinresorts:: ', shop.name, 'is NOT in', params.us.resort_id)
          }

        })
      } else {
        // err handle
        console.log('alpinresorts:: Error');
      }
    })
  })
}

function processShop(params) {
  var defer = q.defer();
  var productUrl = 'raw/www_alpinresorts_com/en/service/static/ski-rental/shops/'+ params.them.shop_id +'/products';
  var discountUrl = 'raw/www_alpinresorts_com/en/service/ski-rental/shops/'+ params.them.shop_id +'/priceinfo/'+ params.us.start +'/'+ params.them.end;
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('alpinresorts:: processShopPrices', params.them.shop_id);
  q.all([
    firebase.database().ref(productUrl).once('value'),
    firebase.database().ref(discountUrl).once('value')
  ])

  .then(function(snaps){
    var productsSnap = snaps[0];
    var discountsSnap = snaps[1];
    if (productsSnap.exists() && discountsSnap.exists()){
      var discountsData = discountsSnap.val();
      var discountsDataKey = Object.keys(discountsSnap.val())[0];
      var discountData = discountsData[discountsDataKey].discounts;
      productsSnap.forEach(function(categorySnap){
        categorySnap.child('products').forEach(function(productSnap){
          var productData = productSnap.val();
          if (['86','90','95'].indexOf(productData.definition_id)<0){ // exclude womens for now
            var p = getProductDetails(productData, discountData, params.us.duration);
            var categoryId = p.category;
            var levelId = p.level ? p.level : '0';
            delete p.category;
            delete p.level;
            console.log('alpinresorts:: saving a product', categoryId, levelId, params.us.shop_id)
            firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/alpinresorts').set(p);
          } else {
            console.log('alpinresorts:: ignoring a womens variation')
          }
        })
      })
      console.log('alpinresorts:: All products saved')
      defer.resolve( 'alpinresorts:: Price data processed for '+ params.us.shop_id +' '+ params.them.shop_id );
    }  else {
      console.log('alpinresorts:: No price data for', productUrl, productsSnap.exists(), discountUrl, discountsSnap.exists());
      defer.reject('alpinresorts:: No price data for '+ params.us.shop_id);
    }
  })

  return defer.promise;
}

function getProductDetails(productIn, discountData, duration){
  var id = productIn.id;
  var products = [];
  var product = {};
  var alpproduct;
  var categoryId = referenceData.categories[productIn.productCategoryId];
  var levelId = referenceData.levels[productIn.qualityCategoryId];
  var discount = discountData[productIn.productCategoryId][productIn.qualityCategoryId]*100;
  var full_price = productIn.priceRaw/100;
  var price = (full_price * (1-discount/100)).toFixed(2);
  var product = {
      name: productIn.name,
      category: categoryId,
      level: levelId,
      full_price: full_price,
      discount: discount,
      price: price
    }
    console.log('alpinresorts:: Got product', product.name, product.category, product.level);
  return product;
}

function saveShopDetails(shop, params){
  // save some shop details
  console.log('alpinresorts:: saveShopDetails', shop.name)
  firebase.database().ref().child('shops/'+ params.us.shop_id).update({
    'name': shop.name,
    'resort_id': params.us.resort_id,
    'image': 'https://www.alpinresorts.com'+ shop.imagePath,
    'phone': shop.phone,
    'email': shop.email,
    'address': shop.address,
    'latitude': shop.location ? shop.location.latitude: null,
    'longitude': shop.location ? shop.location.longitude : null
  });
}

function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var paramsOut = {
    us: params,
    them: {}
  };
  // map the param values
  firebase.database().ref().child('resorts').child(params.resort_id).child('alias/alpinresorts').once("value")
  .then(function(resortSnap){
    if (resortSnap.exists()) {
      // var duration = parseInt(params.duration)
      // var start = new Date(params.start);
      // var end = new Date(new Date(params.start).setDate(start.getDate() + duration));
      // var endStamp = end.toISOString().split('T')[0];

      paramsOut.them = resortSnap.val();
      paramsOut.them.start = params.start;
      paramsOut.them.end =  common.getEndDate(params.start, params.duration);
      paramsOut.them.duration =  params.duration;
      paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
      paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
      paramsOut.us.datestamp = common.getTodayString();

      console.log('alpinresorts:: mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
      defer.resolve(paramsOut);
    } else {
      console.log('alpinresorts::Unknown resort_id passed in to alpinresorts', params.resort_id)
      defer.reject('Unknown resort_id passed in to alpinresorts')
    }
  })
  return defer.promise;

}

// var alpmappedParams = {
//   us: params,
//   them : {
//     resort_id: 'soldeu',
//     region_id: "gran-valira",
//     country_id: "andorra",
//     first_day: "2016-12-24",
//     end: "2016-12-29",
//     timestamp: 1482577200,
//     duration: 6
//   }
// }