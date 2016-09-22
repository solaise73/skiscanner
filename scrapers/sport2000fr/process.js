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
var resorts       = require("./data/resorts.json");


module.exports = {
  processResort: processResort,
  processShop: processShop,
  mapParams: mapParams
}

function processResorts() { 
  resorts.forEach(function(resort){
    if (resort.type == 'station' && resort.country.iso == 'AD'){ ///TEMP!!!!!!!
      var id = resort.slug;
      var resortData = {
        "name": resort.name.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();}),
        "id": id,
        "country_id": resort.country.iso.toLowerCase()
      }

      firebase.database().ref().child('resorts').child(id).update(resortData).then(function(){
        var alias = {"resort_id": resort.id};
        firebase.database().ref().child('resorts').child(id).child('alias').child('sport2000fr').set(alias).then(function(){
          resortData.alias = alias;
          getShopsForResort(resortData);
        });
      });
    }
  })
}

function processResort(paramsIn) {
  var defer = q.defer();
  var promises = [];
  mapParams(paramsIn)
  .then(function(params){
    console.log('sport2000fr:: params', params.us.resort_id, params.them.resort_id);
    firebase.database().ref().child('raw/location-ski_sport2000_fr/json/shops/resort').child(params.them.resort_id).once('value')
    .then(function(snap){
      if (snap.exists()){
        var resort = snap.val();
        var shops = resort[0].shops;
        shops.forEach(function(shop){
          params.them.shop_id = shop.id;
          params.us.shop_id = slug(shop.name).toLowerCase();
          params.us.name = shop.name;
          promises.push(processShop(params))
        })
        q.all(promises).then(function(data){
          console.log('sport2000fr:: All shops resolved');
          defer.resolve('sport2000fr:: All shops resolved')
        })
      } else {
        // err handle
        console.log('sport2000fr:: Error');
        defer.reject('sport2000fr:: Error')
      }
    })
  })
  return defer.promise;
}

function processShop(params) {
  var defer = q.defer();
  console.log('sport2000fr:: Process Shop', params.us.shop_id);
  var shopUrl = '/shops/'+ params.us.shop_id;
  q.all([
    processShopPrices(params),
    // firebase.database().ref(shopUrl).update({ resort_id: params.us.resort_id,  name: params.us.name }),
    // firebase.database().ref(shopUrl).child('/suppliers/sport2000fr').update({ resort_id: params.them.resort_id,  shop_id: params.them.supplier_shop_id })
  ]).then(function(values){
    console.log('sport2000fr:: processShop resolved');
    defer.resolve(values)
  })
  return defer.promise;
}

function processShopPrices(params) {
  var defer = q.defer();
  var productUrl = '/raw/location-ski_sport2000_fr/json/product/price/'+ params.them.shop_id ;
  var discountUrl = '/raw/location-ski_sport2000_fr/json/product/discount/'+ params.them.shop_id +'/'+ params.them.timestamp/1000 ;
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('sport2000fr:: processShopPrices', productUrl);
  console.log('sport2000fr:: processShopPrices', discountUrl);
  // firebase.database().ref(productUrl).once('value')
  return q.all([
    firebase.database().ref(productUrl).once('value'),
    firebase.database().ref(discountUrl).once('value')
  ])
  .then(function(snaps){
    var productsSnap = snaps[0];
    var discountsSnap = snaps[1];
    console.log('sport2000fr:: Got price and discount snaps', productsSnap.exists() && discountsSnap.exists())
    if (productsSnap.exists() && discountsSnap.exists()){
      var discountsData = discountsSnap.val();
      productsSnap.forEach(function(categorySnap){
        var priceData = categorySnap.val();
        var productId = priceData.id;
        var products = getProductDetails(priceData, discountsData[productId].discounts['value'+params.us.duration], params.us.duration);
        if (products.length > 0) {
          products.forEach(function(p){
            var catId = p.category;
            var levelId = p.level ? p.level : '0';
            console.log('sport2000fr:: Got price products', p.name, p.category, p.level);
            delete p.category;
            delete p.level;
            firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/sport2000fr').set(p);
          })
          // productList = productList.concat(products);
        }
      })
      console.log('sport2000fr:: Price data processed')
      defer.resolve( 'sport2000fr:: Price data processed for '+ params.us.shop_id );
    } else {
      defer.reject('sport2000fr:: No price data for '+ params.us.shop_id);
    }
  })

  return defer.promise;
}

function getProductDetails(productIn, discount, duration){
  var id = productIn.id;
  var products = [];
  var product = {};
  var s2kproduct;

  // lookup details of productId
  Object.keys(referenceData.products).forEach(function(key){
    s2kproduct = referenceData.products[key].id == id ? referenceData.products[key] : s2kproduct;
  });

  // level
  if (s2kproduct.level_ski)
    var level = s2kproduct.level_ski.reference;

  // create a product per category
  if (s2kproduct.category_ids) {
    s2kproduct.category_ids.forEach(function(category_id){
      var lookup = referenceData.categories[category_id];

      // for now we are only interested in adult and child skis/boards
      if ([1].indexOf(lookup.parent_id)<0)
        return null
      var full_price = parseFloat(productIn.prices['value'+duration]);
      var price = (full_price * (1-discount/100)).toFixed(2);
      var product = {
        name: s2kproduct.reference || null,
        category: lookup.category || null,
        level: level || null,
        discount: discount,
        full_price: full_price,
        price: price,
        option_as_pack: productIn.option_as_pack || null
      }


      var option;
      // if (productIn.options){
      //   // recurse the same for options
      //   Object.keys(productIn.options).forEach(function(key){
      //     option = getProductDetails(productIn.options[key], duration);
      //     console.log("sport2000fr:: getting option", option)
      //     if (option) {
      //       if (!product.options) product.options = {};
      //       product.options[option[0].category] = option[0];
      //     }
      //   })
      // }
      // console.log(option)
      products.push( product );

    })
  } else {
    return s2kproduct;
  }


  return products;
}

function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var paramsOut = {
    us: params,
    them: {}
  };
  // map the param values
  firebase.database().ref().child('resorts').child(params.resort_id).child('alias/sport2000fr').once('value')
  .then(function(resortSnap){
    if (resortSnap.exists()) {
      paramsOut.them = resortSnap.val();
      paramsOut.them.first_day =  params.start;
      paramsOut.them.duration =  params.duration;
      paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
      paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start);
      paramsOut.us.datestamp = common.getTodayString();
      paramsOut.refresh = params.refresh;

      console.log('sport2000fr:: mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
      defer.resolve(paramsOut);
    } else {
      console.log('sport2000fr::Unknown resort_id passed in to sport2000fr')
      defer.reject('Unknown resort_id passed in to sport2000fr')
    }
  })
  return defer.promise;

}


  // them: {
  //   shop_id: 242,
  //   resort_id: 480,
  //   first_day: "2016-12-24",
  //   duration: 6
  // }
