/**
 * Module dependencies
 */

var request = require('request');
var cheerio = require('cheerio');
var firebase = require("firebase");
var _ = require('./lodash.custom.js');
var $;

var COUNTRIES = require('./data/andorra.json');

module.exports = {
  getShopsInResort: getShopsInResort
}

function getShopsInResort(params, cb) {
  for (var i=0; i<COUNTRIES.length; i++) {
    var country = COUNTRIES[i];
    var resorts = country.resorts;
    for (var j=0; j<resorts.length; j++) {
      var resort = resorts[j];
      var requestData = {
        countryId: 3,
        resortId: resort.key
      }

      var resortRequest = {
        uri: 'http://www.skiset.co.uk/ajaxmotor/getshops/ncr/2/resort/'+ resort.key,
        method: 'POST',
        followRedirect: true,
        followAllRedirects: true,
        jar: true,
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        },
        data: requestData
      }
      console.log('Requesting:', resortRequest)
      request(resortRequest, processResortShops);
    }
  }

  // cb(null, 'Done!')


  function processResortShops(err, res, body) {

    if (err) {
      console.log(err)
      return cb(err);
    }

    var requestData = res.request.data;
    var data = JSON.parse(body);
    var shops = data.response.list;
    console.log('Saving shops in resort:', requestData)
    for (var i=0; i<shops.length; i++) {
      var shop = shops[i];
      requestData.shopId = shop.key;
      var shopRequest = {
        uri: 'http://www.skiset.co.uk/ajaxmotor/getconf/ncr/2/?resort='+ requestData.resortId +'&country='+ requestData.countryId +'&shop='+ shop.key,
        method: 'GET',
        followRedirect: true,
        followAllRedirects: true,
        jar: true,
        headers: {
          "X-Requested-With": "XMLHttpRequest"
        },
        data: requestData
      }
      console.log('Saving shop:', shop, requestData.resortId)
      firebase.database().ref('skiset/countries/'+ requestData.countryId +'/resorts/'+ requestData.resortId +'/shops/'+ shop.key).set(shop);
      request(shopRequest, processShopDetails);
    }
  }

  function processShopDetails(err, res, body) {

    if (err) {
      console.log(err)
      return cb(err);
    }

    var requestData = res.request.data;
    var data = JSON.parse(body);

    firebase.database().ref('skiset/countries/'+ requestData.countryId +'/resorts/'+ requestData.resortId +'/shops/'+ requestData.shopId +'/data').set(data.response);

  }

}