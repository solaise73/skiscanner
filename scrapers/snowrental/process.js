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
    console.log('snowrental:: processResort started', mappedParams.us.resort_id);
    firebase.database().ref().child('raw/www_snowrental_com/ajaxmotor/getshops/ncr/2/resort/').child(mappedParams.them.resort_id).child('response/list').once('value')
    .then(function(snap){
      if (snap.exists()){
        console.log('snowrental:: processResort shops found', snap.val().length);
        snap.forEach(function(shopSnap){
          var shop = shopSnap.val();
          mappedParams.them.shop_id = shop.key;
          mappedParams.them.name = shop.value;
          mappedParams.us.shop_id = slug(shop.value).toLowerCase();
          console.log('snowrental:: processResort shop', mappedParams.us.shop_id);
          promises.push(processShop(mappedParams));
        })
        q.all(promises).then(function(){
          defer.resolve('snowrental:: Done');
        })
      } else {
        // err handle
        defer.reject('snowrental:: Error');
      }
    })
  })
  return defer.promise;
}


function processShop(params){
  var defer = q.defer();
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration + '/'+ params.us.datestamp;
  var rawUrl = 'raw/www_snowrental_com/booking/catalog/'+ params.them.resort_id +'/'+ params.them.shop_id +'/'+ params.them.first_day +'/'+ params.them.duration + '/offers'
  return firebase.database().ref(rawUrl).once('value')
  .then(function(snap){
    console.log('snowrental:: Looking up Shop Prices', rawUrl, snap.exists());
    if (snap.exists()){
      snap.forEach(function(offerSnap){
        var offer = offerSnap.val();
        console.log('snowrental:: Looking up productDetails', offer.offertype, params.us.duration);
        var productDetails = getProductDetails(offer, params.us.duration);

        if(productDetails){
          var catId = productDetails.productData.category;
          var levelId = productDetails.productData.level?productDetails.productData.level:0;
          // var productKey = productDetails.productData.category + (productDetails.productData.level?productDetails.productData.level:'');
          // firebase.database().ref(dataProductUrl).child(productKey).update(productDetails.productData);
          // firebase.database().ref(dataProductUrl).child(productKey).child('prices').update(productDetails.productPrices);
          // firebase.database().ref(dataDiscountUrl).child(productKey).update(productDetails.discountData);

          console.log('snowrental:: Process Shop Prices', productDetails.name, catId, levelId );

          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/price').set(productDetails.price);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/name').set(productDetails.name);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/discount').set(productDetails.discount);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/full_price').set(productDetails.full_price);
          firebase.database().ref(dataUrl).child(catId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowrental/options').set(productDetails.options);

        }
      })
      console.log('snowrental:: Finished processShopPrices');
      defer.resolve('snowrental:: Finished processShopPrices');
    } else {
      defer.reject('snowrental:: Couldnt find shop data')
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
  if (params.us && params.them){
    console.log('snowrental:: params already mapped', params.us.resort_id, params.them.resort_id);
    defer.resolve(params);
    return defer.promise;
  }
  console.log('snowrental:: mapping params', params.resort_id);
  // lookup the resort id
  firebase.database().ref().child('resorts').child(params.resort_id).child('alias/skiset').once("value") // use same mappings as skiset
  .then(function(resortSnap){
    if (resortSnap.exists()) {
      paramsOut.them = resortSnap.val();
      paramsOut.them.first_day =  params.start;
      paramsOut.them.duration =  params.duration;
      paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
      paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
      paramsOut.us.datestamp = common.getTodayString();

      console.log('snowrental:: mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
      defer.resolve(paramsOut);
    } else {
      defer.reject('Unknown resort_id passed in to snowrental')
    }
    console.log('snowrental::mapped resort', paramsOut.us.resort_id, paramsOut.them.resort_id)
  })

  return defer.promise;
}


