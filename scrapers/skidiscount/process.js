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
  .then(function(params){
    console.log('skidiscount:: processResort started', params.us.resort_id, params.them.resort_id);
    return firebase.database().ref().child('raw/www_skidiscount_co_uk/scripts/resort_ajx_php/resort-action/list-resort-provider/resort-id').child(params.them.resort_id).child('list').once('value')
    .then(function(snap){
      if (snap.exists()){
        console.log('skidiscount:: processResort shops found', snap.val().length);
        snap.forEach(function(shopSnap){
          var shop = shopSnap.val();
          params.them.shop_id = shop.resort_provider_id;
          params.them.name = shop.name;
          params.us.shop_id = slug(shop.name).toLowerCase();
          console.log('skidiscount:: processResort shop', params.us.shop_id);
          promises.push(processShop(params));
        })
        q.all(promises).then(function(){
          defer.resolve('skidiscount:: processResort resolved');
        })
      } else {
        // err handle
        console.log('skidiscount:: No prices found for shop', params.us.resort_id);
        defer.reject('skidiscount:: No prices found for shop');
      }
    })
  })
  return defer.promise;
}

function processShop(params){
  var defer = q.defer();
  var rawUrl = 'raw/www_skidiscount_co_uk/catalog/'+ params.them.country_id +'/'+ params.them.resort_id +'/'+ params.them.shop_id +'/'+ params.them.start +'/'+ params.them.end;
  return firebase.database().ref(rawUrl).once('value')
  .then(function(snap){
    console.log('skidiscount:: Looking up Shop Prices', rawUrl, snap.exists());
    if (snap.exists()){
      var offer = snap.val();
      var data = {};
      var productList = [];
      snap.forEach(function(dataSnap){
        var values = dataSnap.val();
        var key = dataSnap.key;
        data[key] = values;
      })

      getProducts(params, data)

      defer.resolve('skidiscount:: Done');
    } else {
      defer.reject('skidiscount:: Couldnt find shop data')
    }
  })
  return defer.promise;
}

function getProducts(params, data){
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  for(var i = 1; i < data.name.length; i+=2) {
    var name = data.name[i];
    var price = data.price[i];
    var full_price = data.full_price[i];
    var discount = parseInt((1-price/full_price)*100);
    var levelId = referenceData.lookup.level[name.toLowerCase()];
    var categoryId = 'S';
    console.log('skidiscount:: getProducts', name, price, full_price, discount, levelId)
    var product = {
      name: data.name[i],
      price: price,
      full_price: full_price,
      discount: discount,
      options: {
        "B": {
          price: data.price[i-1],
          full_price: data.full_price[i-1]
        }
      }
    }
    firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skidiscount').set(product);
  }
  return;
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
  console.log('skidiscount:: mapping params', params.resort_id);
  // lookup the resort id
  firebase.database().ref().child('resorts').child(params.resort_id).child('alias/skidiscount').once("value") // use same mappings as skiset
  .then(function(resortSnap){
    if (resortSnap.exists()) {

      paramsOut.them = resortSnap.val();
      paramsOut.them.start =  params.start;
      paramsOut.them.end =  common.getEndDate(params.start, params.duration);
      paramsOut.them.duration =  params.duration;
      paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
      paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
      paramsOut.us.datestamp = common.getTodayString();
      console.log('skidiscount:: mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id, paramsOut.them.timestamp);
      defer.resolve(paramsOut);
    } else {
      defer.reject('Unknown resort_id passed in to skidiscount')
    }
    console.log('skidiscount:: mapped resort', paramsOut.them.resort_id)
  })

  return defer.promise;
}


