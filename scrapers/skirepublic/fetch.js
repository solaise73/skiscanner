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
var striptags     = require('striptags');
var cache         = require('Simple-Cache').SimpleCache("tmp/websites/skirepublic", console.log);
// var referenceData = require("./data/reference.json");
// var resorts = require("./data/resorts.json");


module.exports = {
  fetchResort: fetchResort,
  setUp: setUp
}

function setUp(){
  [{'andorra':'AD'},{'france':'FR'}].forEach(setUpCountry)
}

function setUpCountry(filterOn) {
  var defer = q.defer();
  var ourCountryId = Object.keys(filterOn)[0];
  var theirCountryId = filterOn[ourCountryId];
  var resorts = referenceData.resorts[theirCountryId];
  var promises = [];
  Object.keys(resorts).forEach(function(resortKey){
    var resort = resorts[resortKey];
    var supplierCountryId = resort[0].country;
    var supplierResortId = resort[0].resort_id;
    var supplierResortSlug = resort[0].resort_slug;
    var supplierResortName = resort[0].name.split(' - ')[0];
    var params = {
      us: {
        'country_id': ourCountryId
      },
      them: {
        'country_id': supplierCountryId,
        'resort_id': supplierResortId,
        'resort_name': supplierResortName,
        'resort_slug': supplierResortSlug,
        'supplier': 'skirepublic'
      }
    }
    promises.push(common.geoCodeResort(params));

  })
  q.all(promises).then(function(){
    defer.resolve('[skirepublic] All resorts mapped')
  })

  return defer.promise;
}

function fetchResort(paramsIn) {
  var defer = q.defer();
  console.log('[skirepublic] Scrape started')
  mapParams(paramsIn)
  .then(function(params){
    var shops = referenceData.resorts[params.them.country_id]['_'+params.them.resort_id];
    shops.forEach(function(shop){
      shop = guessShopName(shop);
      params.them.shop_id = shop.id;
      params.them.shop_slug = shop.slug;
      params.them.shop_name = shop.tidyName;
      params.make_owner = shop.make_owner;
      common.findShop(params).then(function(shop){
        params.us.shop_id = shop.place_id;
        console.log('[skirepublic] scrape shop', params.them.shop_id, shop.name)
        scrapeShopPrices(params).then(function(products){
          params.them.products = products;
          return scrapeShopDiscounts(params);
        })
      // .then(function(discounts){
        //   params.them.discounts = discounts;
        //   processShop(params)
        // })

      })
      

    })
  })
  return defer.promise;
}

function guessShopName(shop){
  var address = striptags(shop.address);
  if (address.toLowerCase().indexOf('ski republic')>-1){
    shop.tidyName = 'Ski Republic';
    shop.make_owner = true;
  } else if (address.toLowerCase().indexOf('magasin')>-1){
    shop.tidyName = address.split(',')[0].replace('Magasin','');
  } else {
    shop.tidyName = shop.name;
  }
  return shop;
}

function processShop(params){
  var dataUrl = '/compare/'+ params.us.place_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('[skirepublic] processShop', dataUrl)
  params.them.products.forEach(function(product){
    console.log('[skirepublic] trying a product', product.name, product.definition_id)
    if (['86','90','95'].indexOf(product.definition_id)<0){ // exclude womens for now
      var p = getProductDetails(product, params.them.discounts, params.us.duration);
      var categoryId = p.category;
      var levelId = p.level ? p.level : '0';
      delete p.category;
      delete p.level;
      console.log('[skirepublic] saving a product', categoryId, levelId, params.us.shop_id)
      firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skirepublic').set(p);
    } else {
      console.log('[skirepublic] ignoring a womens variation')
    }
  })
}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var uri = 'http://www.ski-republic.com/order-processing/equipment/'+ params.them.shop_slug;
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
  var step1Request = {
    uri: 'http://www.ski-republic.com/',
    jar: true,
    method: 'GET'
  }

  cache.get(uri, function(callback){
    request(step1Request, function(err, res, body){
      scrapy.scrape(uri, model, function(err, data) {
        if (err) return console.error(err);
        console.log('[skirepublic] got data back from', uri)
        callback(data)
      });
    });
  }).fulfilled(function(data) {
    console.log('[skirepublic] scrapeShopPrices resolved')
    defer.resolve(data)
  })
  return defer.promise;
}

function scrapeShopDiscounts(params) {
  var defer = q.defer();
  var uri = 'https://www.skirepublic.com/en/service/ski-rental/shops/'+ params.them.shop_id +'/priceinfo';
  cache.get(uri, function(callback){
    var step1Request = {
      uri: 'https://www.skirepublic.com/en/templates/ski-rental/update-shop-booking-parameter-form',
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
    console.log('[skirepublic]requesting', step1Request.uri);
    request(step1Request, function(err, res, body){
      request(discountRequest, function(err, res, body){
        var data = JSON.parse(body);
        var key = Object.keys(data)[0];
        callback(data[key].discounts)
      })
    });
  }).fulfilled(function(discounts) {
    console.log('[skirepublic] scrapeShopDiscounts resolved')
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
    console.log('[skirepublic] Got product', product.name, product.category, product.level);
  return product;
}

function extractData(err, res, body){
  var jsonString;
  if (typeof body == 'string') {
    // WHOA THERE!!!!
    jsonString = /(?:document.town_shop_data = )(.*)/.exec(body);
    try {
      data = eval(jsonString[1]);
      console.log('[skirepublic] extractData VALID JSON');
    } catch (e) {
      console.log('[skirepublic] extractData NOT JSON');
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
  var key = 'resorts/'+ params.place_id +'/alias/skirepublic';
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
        console.log('[skirepublic] Unknown resort_id passed in to Skiset');
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.them.supplier =  'skirepublic';
    paramsOut.them.start = params.start;
    paramsOut.them.end =  common.getEndDate(params.start, params.duration);
    paramsOut.them.duration =  params.duration;
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.us.datestamp = common.getTodayString();
    console.log('[skirepublic] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  return defer.promise;
}




