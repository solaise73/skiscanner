/**
 * Module dependencies
 */
var common        = require('../common');
var request       = require('request');
var firebase      = require("firebase");
var q             = require('q');
var referenceData = require("./data/reference.json");
var scrapy        = require('node-scrapy');
var cache         = require('Simple-Cache').SimpleCache("tmp/websites/skidiscount", console.log);


module.exports = {
  fetchResort: fetchResort,
  setUp: setUp
}

function setUp(){
  [{'andorra':'AD'},{'france':'FR'}].forEach(setUpCountry)
}

function setUpCountry(filterOn) {
  var defer = q.defer();
  var promises = [];
  var ourCountryId = Object.keys(filterOn)[0];
  var theirCountryId = filterOn[ourCountryId];
  var uri = 'http://www.skidiscount.co.uk/scripts/resort.ajx.php?resort-action=list-resort-by-country&country-id='+ theirCountryId;
  shopsRequest = {
    uri: uri,
    headers: {
      "X-Requested-With": "XMLHttpRequest"
    }
  }
  console.log('[skidiscount] requesting', uri)
  request(shopsRequest, function(err, res, body){
    var data = JSON.parse(body);
    data.list.forEach(function(resort){
      if (resort.name && resort.resort_id){
        var supplierCountryId = resort.country_id;
        var supplierCountryName = resort.country_name;
        var supplierResortName = resort.name;
        var supplierResortId = resort.resort_id;
        var params = {
          us: {
            'country_id': ourCountryId
          },
          them: {
            'country_id': resort.country_id,
            'resort_id': resort.resort_id,
            'resort_name': resort.name,
            'supplier': 'skidiscount'
          }
        }
        console.log('[skidiscount] setup', resort.name);
        promises.push(common.geoCodeResort(params));

      }
    })
    q.all(promises).then(function(){
      defer.resolve('[skidiscount] All resorts mapped')
    })
  })
  return defer.promise;
}




function fetchResort(paramsIn) {
  var defer = q.defer();
  var promises = [];
  mapParams(paramsIn)
  .then(function(params){
    var url = 'http://www.skidiscount.co.uk/scripts/resort.ajx.php?resort-action=list-resort-provider&resort-id='+ params.them.resort_id;
    cache.get(url, function(callback){
      console.log('[skidiscount] requesting', url  )
      request(url, function(err, res, body){
        if (err) defer.reject(err);
        var response = JSON.parse(body);
        callback(response);
      })
    }).fulfilled(function(data) {
      var shops = data.list;
      shops.forEach(function(shop){
        if (shop.resort_provider_id && shop.resort_id && shop.resort_provider_id!='' && shop.resort_id!=''){
          params.them.shop_id = shop.resort_provider_id;
          params.them.shop_name = shop.name;
          console.log('[skidiscount] Adding scrapeShop', params.them.shop_name )
          promises.push(scrapeShop(params))
        }
      })
      q.all(promises).then(function(){
        console.log('[skidiscount] All shops scraped');
        defer.resolve('[skidiscount] All shops scraped')
      })
    })
  })
  .catch(function(err){
    console.log('[skidiscount] Couldnt map params', err);
    defer.resolve('[skidiscount] Couldnt map params'+ err)
  });

  return defer.promise;
}

function scrapeShop(params) {
  var defer = q.defer();
  common.findShop(params)
  .then(function(shop){
    params.us.shop_id = shop.place_id;
    var url = 'http://www.skidiscount.co.uk/catalog/'+ params.them.country_id +'/'+ params.them.resort_id +'/'+ params.them.shop_id +'/'+ params.them.start +'/'+ params.them.end;
    var model = {
      'name': "div.product_form.front div.product_title"  ,
      'full_price': {
        selector: "[id^='product_price_copy'][data-main_price]"
      },
      'price': {
        selector: "[id^='product_price_copy'][data-main_price]",
        get: 'data-main_price'
      }
    }

    cache.get(url, function(callback){
      console.log('[skidiscount] requesting', url)
      scrapy.scrape(url, model, function(err, data) {
        if (err) return console.error(err);
        console.log('[skidiscount] got data back from', url)
        callback(data)
      });
    }).fulfilled(function(data) {
      getProducts(params, data)
      .then(function(){
        console.log('[skidiscount] scrapeShop done', params.them.shop_name)
        defer.resolve('[skidiscount] scrapeShop done!')
      })
    })
  })
  return defer.promise;
}

function getProducts(params, data){
  var defer = q.defer();
  var promises = [];
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  if (data.name && data.full_price && data.price) {
    for(var i = 1; i < data.name.length; i+=2) {
      var name = data.name[i];
      var price = parseFloat(data.price[i]);
      var full_price = parseFloat(data.full_price[i]);
      var discount = parseInt((1-price/full_price)*100);
      var levelId = referenceData.lookup.level[name.toLowerCase()];
      var categoryId = 'S';
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
      console.log('[skidiscount] getProducts', i, name, price, full_price, discount, levelId, params.us.shop_id, dataUrl);
      promises.push(firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skidiscount').set(product));
      promises.push(firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/skidiscount').child(categoryId).child(levelId).set(product));
      promises.push(firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/skidiscount/best_discount').set(product.discount));
    }
    q.all(promises).then(function(){
      defer.resolve('[skidiscount] getProducts done for '+ params.us.shop_id)
    })
  } else {
    console.log('[skidiscount] getProducts ERR no data for shop '+ params.us.shop_id )
    defer.resolve('[skidiscount] getProducts ERR no data for shop '+ params.us.shop_id )
  }
  return defer.promise;;
}


function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var key = 'resorts/'+ params.resort_id +'/alias/skidiscount';
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
        console.log('[skidiscount] Unknown resort_id passed in', key);
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.them.supplier =  'skidiscount';
    paramsOut.them.start =  params.start;
    paramsOut.them.end =  common.getEndDate(params.start, params.duration);
    paramsOut.them.duration =  params.duration;
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.us.datestamp = common.getTodayString();
    console.log('[skidiscount] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  return defer.promise;
}

