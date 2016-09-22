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
var scrapy        = require('node-scrapy')


module.exports = {
  scrapeResort: scrapeResort,
  scrapeResorts: scrapeResorts
}

function scrapeResorts(countryId) {
  var defer = q.defer();
  var promises = [];
  var sd_countryId = countryId.toUpperCase();
  var uri = 'http://www.skidiscount.co.uk/scripts/resort.ajx.php?resort-action=list-resort-by-country&country-id='+ sd_countryId;
  shopsRequest = {
    uri: uri,
    headers: {
      "X-Requested-With": "XMLHttpRequest"
    }
  }
  console.log('skidiscount:: requesting', uri)
  request(shopsRequest, function(err, res, body){
    saveResponse(err, res, body).then(function(data){
      data.list.forEach(function(resort){
        if (resort.name && resort.resort_id){
          var name = resort.name;
          var resortId = resort.resort_id;
          var slugResort = slug(name, {'lower': true});
          promises.push(firebase.database().ref().child('resorts').child(slugResort).child('alias/skidiscount').set({
            'resort_id': resortId,
            'country_id': sd_countryId
          }));
        }
      })
      q.all(promises).then(function(){
        defer.resolve('All resorts mapped')
      })
    })
  })
  return defer.promise;
}




function scrapeResort(paramsIn) {
  var defer = q.defer();
  var promises = [];
  process.mapParams(paramsIn)
  .then(function(params){
    var url = 'http://www.skidiscount.co.uk/scripts/resort.ajx.php?resort-action=list-resort-provider&resort-id='+ params.them.resort_id;
    console.log('skidiscount:: requesting', url)
    request(url, function(err, res, body){
      if (err) defer.reject(err);
      saveResponse(err, res, body)
      .then(function(data){
        var shops = data.list;
        shops.forEach(function(shop){
          if (shop.resort_provider_id && shop.resort_id){
            params.them.shop_id = shop.resort_provider_id;
            params.us.shop_id = slug(shop.name, {'lower': true});
            firebase.database().ref().child('shops').child(params.us.shop_id).child('suppliers/skidiscount').update({
              'resort_id': params.them.resort_id,
              'shop_id': params.them.shop_id
            })
            promises.push(scrapeShop(params))
          }
        })
        q.all(promises).then(function(){
          defer.resolve('skidiscount:: All shops scraped')
        })
      })
    })
  })
  .catch(function(err){
    console.log('skidiscount:: Couldnt map params');
    console.log('skidiscount:: Have the resorts been mapped? Mapping resorts now');
    defer.reject( scrapeResorts(paramsIn.country_id) );
  });

  return defer.promise;
}

function scrapeShop(params) {
  var defer = q.defer();
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
  console.log('skidiscount:: requesting', url)
  scrapy.scrape(url, model, function(err, data) {
      if (err) return console.error(err);
      var path = url.split('http://')[1].split('.').join('_');
      console.log('skidiscount:: got data back from', path)
      firebase.database().ref().child('raw').child(path).set(data);
      defer.resolve(data)
  });

  return defer.promise;
}

function saveResponse(err, res, body, extra) {
  // if (!extra) extra = {'country_id': 123}
  if (err) console.log('skidiscount:: saveResponse'+ err)

  var request = res.toJSON().request;
  var response = JSON.parse(body);
  var hostname = request.uri.hostname.split('.').join('_');
  var qs = request.uri.query.replace(/=/g,'/').replace(/&/g,'/');
  var path = request.uri.pathname.split('.').join('_') + '/'+ qs;
  console.log('skidiscount:: saving raw', path);
  var promises = [firebase.database().ref().child('raw').child(hostname).child(path).set(response)];
  if (extra)
    promises.push(firebase.database().ref().child('raw').child(hostname).child(path).update(extra))
  return q.all(promises)
  .then(function(){
    return response;
  });
}
