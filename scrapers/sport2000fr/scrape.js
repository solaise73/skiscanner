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
var resorts       = require("./data/resorts.json");


module.exports = {
  scrapeResort: scrapeResort,
  getResortsAndShops: getResortsAndShops
}



function getResortsAndShops() {
  resorts.forEach(function(resort){
    var supplierCountryId = resort.country.name;
    var countryId = slug(resort.country.name, {'lower': true});
    var resortId = resort.slug;
    var supplierResortId = resort.id;
    if (supplierCountryId=='ANDORRA' && resort.type=='station'){ /// TEMP
      // firebase.database().ref().child('raw').child('www_skiset_co_uk/ajaxmotor/getresorts').child(path).set(response)

      firebase.database().ref().child('countries/'+countryId).child('alias/sport2000fr').update({'country_id': supplierCountryId});
      firebase.database().ref().child('resorts/'+resortId+'/').child('alias/sport2000fr').update({'country_id': supplierCountryId, 'resort_id': supplierResortId});

      console.log('sport2000fr:: Saving resort for country', countryId, supplierCountryId, resortId, supplierResortId)

    }

  })
}


// function scrapeResort(paramsIn) {
//   return process.mapParams(paramsIn)
//   .then(function(params){
//     var rawUrl = 'raw/location-ski_sport2000_fr/json/shops/resort/'+ params.them.resort_id
//     console.log('sport2000fr::scrapeResort', rawUrl)
//     return firebase.database().ref(rawUrl).once('value')
//     .then(function(snap){
//       if (snap.exists()){
//         console.log('sport2000fr::Using cached requests')
//         return snap.val();
//       } else {
//         return q.all([
//           getShopsForResort(params)
//         ])
//       }
//     })
//   })
// }

function scrapeResort(paramsIn) {
  var defer = q.defer();
  console.log('sport2000fr::scrapeResort', paramsIn.resort_id)
  process.mapParams(paramsIn)
  .then(function(params){
    var uri = 'https://location-ski.sport2000.fr/json/shops/resort/'+ params.them.resort_id
    shopsRequest = {
      uri: uri,
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      }
    }
    console.log('sport2000fr::scrapeResort', uri)
    request(shopsRequest, function(err, res, body){
      saveResponse(err, res, body)
      .then(function(data){
        var promises = [];
        data[0].shops.forEach(function(shop){
          params.them.shop_id = shop.id;
          console.log('sport2000fr::scrape shop', params.them.shop_id)
          promises.push(scrapeShopPrices(params));
          promises.push(scrapeShopDiscounts(params));

          // save some info about this shop as Sport2000 is authority for it
          var shopId = slug(shop.name, {'lower': true});
          firebase.database().ref().child('shops/'+ shopId).update({
            'name': shop.name,
            'resort_id': params.us.resort_id,
            'image': shop.image,
            'phone': shop.phone,
            'email': shop.email,
            'owner': 'sport2000fr'
          });
        });
        q.all(promises).then(function(){
          defer.resolve('Shops saved for sport200fr resort '+ params.them.resort_id);
        })
      })
      .catch(function(err){
        defer.reject('Error saving shops for sport200fr resort '+ params.them.resort_id +' err:'+ err)
      })
    });
  });
  return defer.promise;
}

function scrapeShopDiscounts(params) {
  var defer = q.defer();
  var discountRequest = {
    uri: 'https://location-ski.sport2000.fr/json/product/discount/'+ params.them.shop_id +'/'+ params.them.timestamp/1000,
    method: 'GET',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    data: defer
  }
  console.log('sport2000fr::requesting', discountRequest.uri);
  request(discountRequest, function(err, res, body){
    saveResponse(err, res, body)
    .then(function(data){
      defer.resolve('Discounts saved for sport200fr shop '+ params.them.shop_id)
    })
    .catch(function(err){
      defer.reject('Error saving discounts for sport200fr shop '+ params.them.shop_id +' err:'+ err)
    })
  });


  return defer.promise;

}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var priceRequest = {
    uri: 'https://location-ski.sport2000.fr/json/product/price/'+ params.them.shop_id,
    method: 'GET',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    data: params
  }
  console.log('sport2000fr::requesting', priceRequest.uri);
  request(priceRequest, function(err, res, body){
    saveResponse(err, res, body)
    .then(function(data){
      defer.resolve('Prices saved for sport200fr shop '+ params.them.shop_id)
    })
    .catch(function(err){
      defer.reject('Error saving prices for sport200fr shop '+ params.them.shop_id +' err:'+ err)
    })
  });

  return defer.promise;
}


function saveResponse(err, res, body) {
  if (err) console.log('sport2000fr:saveResponse'+ err);
  if (res.headers['content-type']!='application/json') {
    console.log('sport2000fr:: NOT JSON');
    var defer = q.defer();
    defer.reject('sport2000fr:: NOT JSON');
    return defer.promise;
  }

  var request = res.toJSON().request;
  var response = JSON.parse(body);
  var hostname = request.uri.hostname.split('.').join('_');
  console.log('sport2000fr::saving raw', request.uri.href)
  return firebase.database().ref().child('raw').child(hostname).child(request.uri.pathname).set(response)
  .then(function(){
    return response;
  });
}
