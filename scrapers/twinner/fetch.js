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
var resortsData   = require("./data/resorts.json");
var fs            = require('fs');
var cachedir      = './tmp/websites/twinner';

if (!fs.existsSync(cachedir)){ fs.mkdirSync(cachedir); }
var cache         = require('Simple-Cache').SimpleCache(cachedir, console.log);



module.exports = {
  fetchResort: fetchResort,
  setUp: setUp
}

function setUp(){
  [{'france':'france'}].forEach(setUpCountry)
}

function setUpCountry(filterOn) {
  var defer = q.defer();
  var promises = [];
  var ourCountryId = Object.keys(filterOn)[0];
  var theirCountryId = filterOn[ourCountryId];

  resortsData.forEach(function(resort){
    if (resort){
      var params = {
        us: {
          'country_id': ourCountryId
        },
        them: {
          'country_id': theirCountryId,
          'resort_id': resort.id_station,
          'resort_name': resort.nom,
          'resort_slug': resort.item,
          'supplier': 'twinner'
        }
      }
      console.log('[twinner] setup', resort.nom)
      promises.push(common.geoCodeResort(params))
    }
  })


  q.all(promises).then(function(){
    defer.resolve('[twinner] All resorts mapped')
  })

  return defer.promise;
}

function fetchResort(paramsIn) {
  var defer = q.defer();
  console.log('[twinner] Scrape started')
  mapParams(paramsIn)
  .then(function(params){
    var url = 'http://location-ski.twinner-sports.com/api/magasins?id_station='+ params.them.resort_id;

    cache.get(url, function(callback){
      url += '&_='+ Date.now();
      console.log('[twinner] fetchResort from ', url)
      request(url, function(err, res, body){
        var data = JSON.parse(body);
        callback(data)
      })
    }).fulfilled(function(data) {
      if (data.length){
        data.forEach(function(shop,i){
          console.log(shop)
          var p1 = JSON.parse(JSON.stringify(params));
          p1.them.shop_id = shop.id_magasin;
          p1.them.shop_name = shop.nom;
          p1.them.shop_address = shop.adresse;
          common.findShop(p1).then(function(shop){
            var p2 = JSON.parse(JSON.stringify(p1));
            p2.us.shop_id = shop.place_id;
            console.log('[twinner] fetchResort scrape shop', p2.us.shop_id, p2.them.shop_id,shop.name)
            scrapeShopPrices(p2).then(function(products){
              var p3 = JSON.parse(JSON.stringify(p2));
              p3.them.products = products;
              processShop(p3)
            })
          })
        })
      } else {
        defer.resolve('[twinner] No shops in that resort')
      }
    })
  })
  return defer.promise;
}

function processShop(params){
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('[twinner] processShop', dataUrl)
  if (params.them.products.length>0) {
    params.them.products.forEach(function(product){
      if (true){ // exclude any here
        var p = getProductDetails(product);
        var categoryId = p.category;
        var levelId = p.level ? p.level : '0';
        delete p.category;
        delete p.level;
        console.log('[twinner] saving a product', categoryId, levelId, params.us.shop_id)
        firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/twinner').set(p);
        firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/twinner').child(categoryId).child(levelId).set(p);
        firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/twinner/best_discount').set(p.discount);
      } else {
        console.log('[twinner] ignoring a variation')
      }
    })
  } else {
    console.log('[twinner] No products returned for shop', params.us.shop_id)
  }
}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var uri = 'http://location-ski.twinner-sports.com/rent/etape2/check'
  var data = {
    'id_station':params.them.resort_id,
    'id_magasin':params.them.shop_id,
    'date_debut':params.them.from,
    'id_duree_reservation':params.them.duration
  }
  var key = uri + JSON.stringify(data);
  console.log('[twinner] scrapeShopPrices requesting', uri, data)
  cache.get(key, function(callback){
    var firstRequest = {
      uri: uri,
      method: 'POST',
      followRedirect: true,
      followAllRedirects: true,
      jar: true,
      form: data
    }
    request(firstRequest, function(err, res, body){
      var uri = 'http://location-ski.twinner-sports.com/api/articles/resultats/1?_='+ Date.now();
      var nextRequest = {
        uri: uri,
        method: 'GET',
        followRedirect: true,
        followAllRedirects: true,
        jar: true,
        data: data
      }

      request(nextRequest, function(err, res, body){
        var data = JSON.parse(body);
        console.log('[twinner] scrapeShopPrices success')
        callback(data);
      })
    })
  }).fulfilled(function(data) {
    console.log('[twinner] scrapeShopPrices resolved', params.them.shop_id)
    defer.resolve(data)
  })
  return defer.promise;
}

function getProductDetails(productIn){
  var categoryId = 'S';
  var levelId = referenceData.levels[productIn.id_niveau];
  var discount = parseInt(productIn.remise.remise);
  var full_price = parseFloat(productIn.prixBrut);
  var price = parseFloat(productIn.prixNet);
  var product = {
      name: productIn.libelle,
      category: categoryId,
      level: levelId,
      full_price: full_price,
      discount: discount,
      price: price
    }
    console.log('[twinner] Got product', product.name, product.category, product.level);
  return product;
}



function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var key = 'resorts/'+ params.resort_id +'/alias/twinner';
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
        console.log('[twinner] Unknown resort_id passed in', key);
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.them.supplier =  'twinner';
    paramsOut.them.from = themDateFormat(params.start);
    paramsOut.them.to =  themDateFormat(common.getEndDate(params.start, params.duration));
    paramsOut.them.duration =  referenceData.days[params.duration]; // wtf! check out the weirdness of their days!
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.us.datestamp = common.getTodayString();
    console.log('[twinner] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  function themDateFormat(dateIn){
    var d = new Date(dateIn);
    return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
  }

  return defer.promise;
}




