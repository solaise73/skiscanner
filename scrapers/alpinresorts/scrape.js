/**
 * Module dependencies
 */

var request       = require('request');
var cheerio       = require('cheerio');
var firebase      = require("firebase");
var scrapy        = require("node-scrapy");
var q             = require('q');
var slug          = require("slug");
var qs            = require('querystring');
var process       = require("./process.js");
// var referenceData = require("./data/reference.json");
// var resorts = require("./data/resorts.json");


module.exports = {
  scrapeResort: scrapeResort,
  setUp: setUp
}

function setUp(){
  var defer = q.defer();
  var url = 'https://www.alpinresorts.com/en/ski-rental/andorra';
  var model = {
    'resort': {
      selector: '.selecttowns li a',
      get: 'href'
    }
  }
  console.log('alpinresorts::setup requesting', url)
  scrapy.scrape(url, model, function(err, data) {
      if (err) return console.error(err);
      var path = url.split('https://')[1].split('.').join('_');
      
      data.resort.forEach(function(url){
        path = url.split('/')
        console.log('alpinresorts:: got data back from', path[4], path[5])
        if (path[3] && path[4] && path[5]){
          var countryId = path[3];
          var regionId = path[4];
          var resortId = path[5];
          firebase.database().ref().child('resorts').child(resortId).child('alias/alpinresorts').update({
            'country_id': countryId,
            'region_id': regionId,
            'resort_slug': resortId
          });
        }
      })
      
      defer.resolve(data)
  });

  return defer.promise;
}

function scrapeResort(paramsIn) {
  var defer = q.defer();
  console.log('alpinresorts::scrape started')
  process.mapParams(paramsIn)
  .then(function(params){
    shopsRequest = {
      uri: 'https://www.alpinresorts.com/en/ski-rental/'+ params.them.country_id +'/'+ params.them.region_id +'/'+ params.us.resort_id,
      headers: {

      }
    }
    console.log('alpinresorts::scrape shopId ', shopsRequest.uri)
    request(shopsRequest, function(err, res, body){
      extractDataAndSave(err, res, body, params)
      .then(function(data){
        data.forEach(function(shop){
          if (shop.inTown) {
            params.them.shop_id = shop.id;
            console.log('alpinresorts::scrape shop', params.them.shop_id)
            defer.resolve( q.all([
              scrapeShopPrices(params),
              scrapeShopDiscounts(params)
            ]));
          } else {
            console.log('alpinresorts::ignoring shop', params.them.shop_id, 'as not in resort', params.us.resort_id)
          }
        });

        defer.resolve('Shops saved for alpinresorts resort '+ params.us.resort_id)
      })
      .catch(function(err){
        defer.reject('Error saving shops for alpinresorts resort '+ params.us.resort_id +' err:'+ err)
      })
    });
  })
  return defer.promise;
}

function scrapeShopDiscounts(params) {
  var defer = q.defer();
  var step1Request = {
    uri: 'https://www.alpinresorts.com/en/templates/ski-rental/update-shop-booking-parameter-form',
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
    uri: 'https://www.alpinresorts.com/en/service/ski-rental/shops/'+ params.them.shop_id +'/priceinfo',
    method: 'GET',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    data: params
  }
  console.log('alpinresorts::requesting', step1Request.uri);
  request(step1Request, function(err, res, body){

    request(discountRequest, function(err, res, body){
      res.request.uri.pathsuffix = '/'+ params.them.start+ '/'+ params.them.end;
      saveResponse(err, res, body)
      .then(function(data){
        defer.resolve('Discounts saved for alpinresorts shop '+ params.them.shop_id)
      })
      .catch(function(err){
        defer.reject('Error saving discounts for alpinresorts shop '+ params.them.shop_id +' err:'+ err)
      })
    })
  });


  return defer.promise;

}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var priceRequest = {
    uri: 'https://www.alpinresorts.com/en/service/static/ski-rental/shops/'+ params.them.shop_id +'/products?age_category=1&currency=EUR&duration=6',
    method: 'GET',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    data: params
  }
  console.log('alpinresorts::requesting', priceRequest.uri);
  request(priceRequest, function(err, res, body){
    saveResponse(err, res, body)
    .then(function(data){
      defer.resolve('Prices saved for alpinresorts shop '+ params.them.shop_id)
    })
    .catch(function(err){
      defer.reject('Error saving prices for alpinresorts shop '+ params.them.shop_id +' err:'+ err)
    })
  });

  return defer.promise;
}


function extractDataAndSave(err, res, body){
  var jsonString;
  if (typeof body == 'string') {
    // WHOA THERE!!!!
    jsonString = /(?:document.town_shop_data = )(.*)/.exec(body);
    try {
      data = eval(jsonString[1]);
      console.log('alpinresorts:extractDataAndSave VALID JSON');
    } catch (e) {
      console.log('alpinresorts:extractDataAndSave NOT JSON');
      data = body;
    }
  } else {
    data = body;
  }
  return saveResponse(err, res, JSON.stringify(data));
}


function saveResponse(err, res, body) {
  if (err) console.log('alpinresorts:saveResponse'+ err);

  var request = res.toJSON().request;

  var queryparams = qs.parse(request.uri.query);
  var response = JSON.parse(body);
  var hostname = request.uri.hostname.split('.').join('_');
  var path = request.uri.pathname + (request.uri.pathsuffix ? request.uri.pathsuffix : '');

  console.log('alpinresorts::saving raw', path)
  return firebase.database().ref().child('raw').child(hostname).child(path).set(response)
  .then(function(){
    return response;
  });
}
