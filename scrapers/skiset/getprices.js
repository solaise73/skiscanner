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
  getPricesForShop: getPricesForShop
}

function getPricesForShop(params, cb) {
  var requestData = {
    countryId: 3,
    resortId: 105,
    shopId: 171,
    key: '2016-12-17::6'
  }

  var priceRequest = {
    uri: 'http://www.skiset.co.uk/',
    method: 'POST',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    form: {
      country_id: 3,
      resort_id: 105,
      shop_id: 171,
      duration: 6,
      first_day: '2016-12-17'
    },
    data: requestData
  }

  request(priceRequest, processPriceRequest);

  cb(null, 'Done!')


  function processPriceRequest(err, res, body) {

    if (err) {
      console.log(err)
      return cb(err);
    }

    var requestData = res.request.data;
    var jsonString = /(?:initCatalog)(.*)/.exec(body);
    // console.log('jsonString:::', jsonString[1])
    // WHOA THERE!!!!
    var jsonData = eval(jsonString[1]);
    var prices = jsonData.offers;

    firebase.database().ref('skiset/countries/'+ requestData.countryId +'/resorts/'+ requestData.resortId +'/shops/'+ requestData.shopId +'/prices/'+ requestData.key).set(prices);
  }
}

