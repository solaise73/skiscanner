/**
 * Module dependencies
 */

var common        = require('../common');
var request       = require('request');
var cheerio       = require('cheerio');
var firebase      = require("firebase");
var scrapy        = require("node-scrapy");
var q             = require('q');
var slug          = require("slug");
var qs            = require('querystring');
var referenceData = require("./data/reference.json");
var cache         = require('Simple-Cache').SimpleCache("tmp/websites/snowell", console.log);
// var referenceData = require("./data/reference.json");
// var resorts = require("./data/resorts.json");


module.exports = {
  fetchResort: fetchResort,
  setUp: setUp
}

function setUp(){
  [{'andorra':'andorra'},{'france':'france'}].forEach(setUpCountry)
}

function setUpCountry(filterOn) {
  var defer = q.defer();
  var promises = [];
  var ourCountryId = Object.keys(filterOn)[0];
  var theirCountryId = filterOn[ourCountryId];
  var url = 'https://www.snowell.com/en/ski-rental/'+ theirCountryId;
  var model = {
    'resort': {
      selector: '.selecttowns li a',
      get: 'href'
    }
  }
  console.log('[snowell]setup requesting', url)
  scrapy.scrape(url, model, function(err, data) {
      if (err) return console.error(err);
      var path = url.split('https://')[1].split('.').join('_');

      data.resort.forEach(function(url){
        path = url.split('/')
        console.log('[snowell] got data back from', path[4], path[5])
        if (path[3] && path[4] && path[5]){
          var countryId = path[3];
          var regionId = path[4];
          var resortId = path[5];
          var params = {
            us: {
              'country_id': ourCountryId
            },
            them: {
              'country_id': countryId,
              'resort_id': resortId,
              'resort_name': resortId,
              'resort_slug': resortId,
              'region_id': regionId,
              'supplier': 'snowell'
            }
          }
          console.log('[snowell] setup', resortId)
          promises.push(common.geoCodeResort(params))
        }
      })

      q.all(promises).then(function(){
        defer.resolve('[snowell] All resorts mapped')
      })
  });

  return defer.promise;
}

function fetchResort(paramsIn) {
  var defer = q.defer();
  console.log('[snowell] Scrape started')
  mapParams(paramsIn)
  .then(function(params){
    var uri = 'https://www.snowell.com/en/ski-rental/'+ params.them.country_id +'/'+ params.them.region_id +'/'+ params.them.resort_id;
    cache.get(uri, function(callback){
      shopsRequest = {
        uri: uri,
        headers: {}
      }
      console.log('[snowell] fetchResort from ', shopsRequest.uri)
      request(shopsRequest, function(err, res, body){
        var data = extractData(err, res, body, params);
        callback(data);
      });
    }).fulfilled(function(shops) {
      shops.forEach(function(shop){
        if (shop.inTown) {
          var p1 = JSON.parse(JSON.stringify(params));
          p1.them.shop_id = shop.id;
          p1.them.shop_name = shop.name;
          common.findShop(p1).then(function(shop){
            var p2 = JSON.parse(JSON.stringify(p1));
            p2.us.shop_id = shop.place_id;
            console.log('[snowell] fetchResort scrape shop', p2.us.shop_id, p2.them.shop_id)
            scrapeShopPrices(p2).then(function(products){
              var p3 = JSON.parse(JSON.stringify(p2));
              p3.them.products = products;
              scrapeShopDiscounts(p3).then(function(discounts){
                var p4 = JSON.parse(JSON.stringify(p3));
                p4.them.discounts = discounts;
                processShop(p4)
              })
            })
          })
        } else {
          console.log('[snowell] ignoring shop', shop.name, 'as not in resort', params.us.resort_id)
        }
      });
    })
  })
  return defer.promise;
}

function processShop(params){
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('[snowell] processShop', dataUrl)
  params.them.products.forEach(function(product){
    if (['86','90','95'].indexOf(product.definition_id)<0){ // exclude womens for now
      var p = getProductDetails(product, params.them.discounts, params.us.duration);
      var categoryId = p.category;
      var levelId = p.level ? p.level : '0';
      delete p.category;
      delete p.level;
      console.log('[snowell] saving a product', categoryId, levelId, params.us.shop_id, product)
      firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/snowell').set(p);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowell').child(categoryId).child(levelId).set(p);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/snowell/best_discount').set(p.discount);
    } else {
      console.log('[snowell] ignoring a womens variation')
    }
  })
}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var uri = 'https://www.snowell.com/en/service/static/ski-rental/shops/'+ params.them.shop_id +'/products?age_category=1&currency=EUR&duration=6';

  cache.get(uri, function(callback){
    var priceRequest = {
      uri: uri,
      method: 'GET',
      followRedirect: true,
      followAllRedirects: true,
      jar: true,
      data: params
    }
    request(priceRequest, function(err, res, body){
      var data = JSON.parse(body);
      callback(data['1'].products)
    });
  }).fulfilled(function(data) {
    console.log('[snowell] scrapeShopPrices resolved', params.them.shop_id)
    defer.resolve(data)
  })
  return defer.promise;
}

function scrapeShopDiscounts(params) {
  var defer = q.defer();
  var uri = 'https://www.snowell.com/en/service/ski-rental/shops/'+ params.them.shop_id +'/priceinfo';
  cache.get(uri, function(callback){
    var step1Request = {
      uri: 'https://www.snowell.com/en/templates/ski-rental/update-shop-booking-parameter-form',
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      },
      jar: true,
      method: 'POST',
      body: JSON.stringify({
        "data":{
          "shopId": parseInt(params.them.shop_id),
          "startDate": params.them.start,
          "endDate": params.them.end,
          "numberOfPeople": 1
        }
      })
    }

    var discountRequest = {
      uri: uri,
      method: 'GET',
      followRedirect: true,
      followAllRedirects: true,
      jar: true,
      data: params
    }
    console.log('[snowell]requesting', step1Request.uri);
    request(step1Request, function(err, res, body){
      request(discountRequest, function(err, res, body){
        var data = JSON.parse(body);
        var key = Object.keys(data)[0];
        callback(data[key].discounts)
      })
    });
  }).fulfilled(function(discounts) {
    console.log('[snowell] scrapeShopDiscounts resolved', params.them.shop_id)
    defer.resolve(discounts)
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
  var discount = parseInt(discountData[productIn.productCategoryId][productIn.qualityCategoryId]*100);
  var full_price = parseFloat(productIn.priceRaw/100);
  var price = parseFloat((full_price * (1-discount/100)));
  var product = {
      name: productIn.name,
      category: categoryId,
      level: levelId,
      full_price: full_price,
      discount: discount,
      price: price
    }
    console.log('[snowell] Got product', product.name, product.category, product.level, productIn.qualityCategoryId);
  return product;
}

function extractData(err, res, body){
  var jsonString;
  if (typeof body == 'string') {
    // WHOA THERE!!!!
    jsonString = /(?:document.town_shop_data = )(.*)/.exec(body);
    try {
      data = eval(jsonString[1]);
      console.log('[snowell] extractData VALID JSON');
    } catch (e) {
      console.log('[snowell] extractData NOT JSON');
      data = body;
    }
  } else {
    data = body;
  }
  return data;
}

function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var key = 'resorts/'+ params.resort_id +'/alias/snowell';
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
        console.log('[snowell] Unknown resort_id passed in', key);
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.them.supplier =  'snowell';
    paramsOut.them.start = params.start;
    paramsOut.them.end =  common.getEndDate(params.start, params.duration);
    paramsOut.them.duration =  params.duration;
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.us.datestamp = common.getTodayString();
    console.log('[snowell] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  return defer.promise;
}




