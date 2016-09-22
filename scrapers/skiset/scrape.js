/**
 * Module dependencies
 */

var request       = require('request');
var cheerio       = require('cheerio');
var firebase      = require("firebase");
var q             = require('q');
var slug          = require("slug");
var process       = require("./process.js");
var referenceData = require("./data/reference.json");


module.exports = {
  scrapeResort: scrapeResort,
  getResortsAndShops: getResortsAndShops
}


function getResortsAndShops() {
  Object.keys(referenceData.country).forEach(function(country){
    var supplierCountryId = referenceData.country[country];
    if (supplierCountryId==3){ /// TEMP
      // firebase.database().ref().child('raw').child('www_skiset_co_uk/ajaxmotor/getresorts').child(path).set(response)
      console.log('skiset:: Getting resort for country', country, supplierCountryId)
      resortRequest = {
        uri: 'http://www.skiset.co.uk/ajaxmotor/getresorts/ncr/2/country/'+ supplierCountryId,
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        }
      }
      request(resortRequest, function(err, res, body){
        var countryId = slug(country, {'lower': true});
        var extra = {'country_id': countryId}
        firebase.database().ref().child('countries/'+countryId).child('alias/skiset').update({'country_id': supplierCountryId})
        saveResponse(err, res, body, extra)
        .then(function(data){
          data.response.list.forEach(function(resort){
            var supplierResortId = resort.key;
            var resortName = resort.value;
            var resortId = slug(resortName, {lower: true});
            console.log('skiset:: Getting shops for', resort.value, resort.key);
            firebase.database().ref().child('resorts/'+resortId+'/').child('alias/skiset').update({'country_id': supplierCountryId, 'resort_id': supplierResortId});
            getShopsForResort(resort)
          })
        })
      });

    }

  })
}

function getShopsForResort(resort) {
  var uri = 'http://www.skiset.co.uk/ajaxmotor/getshops/ncr/2/resort/'+ resort.key;
  shopsRequest = {
    uri: uri,
    headers: {
      "X-Requested-With": "XMLHttpRequest"
    }
  }
  request(shopsRequest, function(err, res, body){
    var extra = {'shop_id': slug(resort.value, {'lower': true})}
    saveResponse(err, res, body, extra)
  })
}


function scrapeResort(paramsIn) {
  var defer = q.defer();
  var params = process.mapParams(paramsIn).then(function(params){
    var uri = 'http://www.skiset.co.uk/ajaxmotor/getshops/ncr/2/resort/'+ params.them.resort_id;
    shopsRequest = {
      uri: uri,
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      }
    }
    request(shopsRequest, function(err, res, body){
      saveResponse(err, res, body)
      .then(function(data){
        data.response.list.forEach(function(shop){
          params.us.shop_id = slug(shop.value, {'lower': true});
          params.them.shop_id = shop.key;
          console.log('skiset::scrape shop', params.us.shop_id, params.them.shop_id)
          firebase.database().ref().child('shops').child(params.us.shop_id).update({
            name: shop.value,
            resort_id: params.us.resort_id,
            owner: 'skiset'
          })
          firebase.database().ref().child('shops/suppliers/skiset').set({
            shop_id: params.them.shop_id,
            resort_id: params.them.resort_id,
          })
          defer.resolve( q.all([
            scrapeShopPrices(params)
            // scrapeShopDiscounts(params)
          ]));
        });
      })
    })
  })

  return defer.promise;
}


function scrapeShopPrices(params) {
  var defer = q.defer();

  var priceRequest = {
    uri: 'http://www.skiset.co.uk/',
    method: 'POST',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    form: {
      country_id: params.them.country_id,
      resort_id: params.them.resort_id,
      shop_id: params.them.shop_id,
      duration: params.them.duration,
      first_day: params.them.first_day
    }
  }
  console.log(priceRequest.uri)

  request(priceRequest, function(err, res, body){
    extractDataAndSave(err, res, body, params)
    .then(function(data){
      console.log('skiset::Saving price data', params.them.shop_id)
      defer.resolve(data);
    })
  });

  return defer.promise;



}


function extractDataAndSave(err, res, body, params){
  var jsonString;
  if (typeof body == 'string') {
    // WHOA THERE!!!!
    jsonString = /(?:initCatalog)(.*)/.exec(body);
    try {
      data = eval(jsonString[1]);
      console.log('skiset:extractDataAndSave VALID JSON');
    } catch (e) {
      console.log('skiset:extractDataAndSave NOT JSON');
      data = body;
    }
  } else {
    data = body;
  }
  res.request.uri.pathname = res.request.uri.pathname + params.them.resort_id +'/'+ params.them.shop_id +'/'+ params.them.first_day+'/'+ params.them.duration;
  return saveResponse(err, res, JSON.stringify(data));
}


function saveResponse(err, res, body, extra) {
  // if (!extra) extra = {'country_id': 123}
  if (err) console.log('skiset:saveResponse'+ err)
  var request = res.toJSON().request;
  var response = JSON.parse(body);
  var hostname = request.uri.hostname.split('.').join('_');
  var path = request.uri.pathname;
  console.log('skiset::saving raw', path);
  var promises = [firebase.database().ref().child('raw').child(hostname).child(path).set(response)];
  if (extra)
    promises.push(firebase.database().ref().child('raw').child(hostname).child(path).update(extra))
  return q.all(promises)
  .then(function(){
    return response;
  });
}
