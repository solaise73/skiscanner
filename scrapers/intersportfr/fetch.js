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
var cache         = require('Simple-Cache').SimpleCache("tmp/websites/intersportfr", console.log);



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
  var url = 'http://www.intersport-rent.fr/rent/ajax/inputlistStations.aspx?rechValue=';
  var resorts
  var countryRequest = {
        uri: url,
        headers: {}
      }
  console.log('[intersportfr]setup requesting', url)
  request(countryRequest, function(err, res, body){
    console.log(body)
    resorts = body.split('</LI>').map(function(elem,i){return elem.split('>').map(function(elem,i){return elem.replace("<LI id='idstation_","").replace("'","")})})
    resorts.forEach(function(resort){
      if (resort){
        var params = {
          us: {
            'country_id': ourCountryId
          },
          them: {
            'country_id': theirCountryId,
            'resort_id': resort[0],
            'resort_name': resort[1],
            'supplier': 'intersportfr'
          }
        }
        console.log('[intersportfr] setup', resort[0])
        promises.push(common.geoCodeResort(params))
      }
    })
  })

  q.all(promises).then(function(){
    defer.resolve('[intersportfr] All resorts mapped')
  })

  return defer.promise;
}

function fetchResort(paramsIn) {
  var defer = q.defer();
  console.log('[intersportfr] Scrape started')
  mapParams(paramsIn)
  .then(function(params){
    var url = 'http://www.intersport-rent.fr/rent/page/station.aspx?station='+ params.them.resort_id;

    cache.get(url, function(callback){
      console.log('[intersportfr] fetchResort from ', url)
      var model = {
        'shopIds': {
          selector: '#resa__input--magasin option:not(:first-of-type)',
          get: 'value'
        },
        'shopNames': '#resa__input--magasin option:not(:first-of-type)'
      }
      scrapy.scrape(url, model, function(err, data) {
        callback(data)
      })
    }).fulfilled(function(data) {
      if (data.shopIds){
        data.shopIds.forEach(function(shopId,i){
          var p1 = JSON.parse(JSON.stringify(params));
          p1.them.shop_id = shopId;
          p1.them.shop_name = 'Intersport,'+data.shopNames[i];
          common.findShop(p1).then(function(shop){
            var p2 = JSON.parse(JSON.stringify(p1));
            p2.us.shop_id = shop.place_id;
            console.log('[intersportfr] fetchResort scrape shop', p2.us.shop_id, p2.them.shop_id,shop.name)
            scrapeShopPrices(p2).then(function(products){
              var p3 = JSON.parse(JSON.stringify(p2));
              p3.them.products = products;
              processShop(p3)
            })
          })
        })
      } else {
        defer.resolve('[intersportfr] No shops in that resort')
      }
      
    })
  })
  return defer.promise;
}

function processShop(params){
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('[intersportfr] processShop', dataUrl)
  params.them.products.forEach(function(product){
    if (true){ // exclude any here
      var p = getProductDetails(product);
      var categoryId = p.category;
      var levelId = p.level ? p.level : '0';
      delete p.category;
      delete p.level;
      console.log('[intersportfr] saving a product', categoryId, levelId, params.us.shop_id)
      firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/intersportfr').set(p);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/intersportfr').child(categoryId).child(levelId).set(p);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/intersportfr/best_discount').set(p.discount);
    } else {
      console.log('[intersportfr] ignoring a variation')
    }
  })
}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var uri = 'http://www.intersport-rent.fr/rent/page/pack.aspx'
  var data = {
    'resa__input--magasin': params.them.shop_id,
    'select_flag': 0,
    'from': params.them.from,
    'to': params.them.to,
    'hiddenTO': params.them.from,
    'hiddenFROM': params.them.to
  }
  var key = uri + JSON.stringify(data);
  console.log('[intersportfr] scrapeShopPrices requesting', uri, data)
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
      var uri = 'http://www.intersport-rent.fr/rent/ajax/listePacks.aspx?idgamme=11&idcategorie=1&_=1475648788289'
      var nextRequest = {
        uri: uri,
        method: 'GET',
        followRedirect: true,
        followAllRedirects: true,
        jar: true,
        data: data
      }

      request(nextRequest, function(err, res, body){
        var $ = cheerio.load(body)
        var data = [];
        $('form:not([action])').each(function(i,_form){
            var form = $(_form);
            var packdata = {}
            var id = form.attr('id').replace('form','');
            var nameId = '#pack_'+id;
            var pack = $(nameId).find('h2').text().trim();
            var packId = slug(pack, {'lower': true});
            $(form).serializeArray().map(function(x){packdata[x.name.replace(id,'')] = x.value;})
            packdata.name = pack;
            packdata.id = packId;
            data.push(packdata);
        })
        console.log('[intersportfr] scrapeShopPrices success')
        callback(data);

      })
    })
  }).fulfilled(function(data) {
    console.log('[intersportfr] scrapeShopPrices resolved', params.them.shop_id)
    defer.resolve(data)
  })
  return defer.promise;
}

function getProductDetails(productIn){
  var categoryId = 'S';
  var levelId = referenceData.levels[productIn.id];
  var discount = parseInt(productIn.remiseMagSansChaussure);
  var full_price = parseFloat(productIn.prixBarreMagSansChaussure);
  var price = parseFloat(productIn.prixMagSansChaussure);
  var product = {
      name: productIn.name,
      category: categoryId,
      level: levelId,
      full_price: full_price,
      discount: discount,
      price: price
    }
    console.log('[intersportfr] Got product', product.name, product.category, product.level);
  return product;
}



function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var key = 'resorts/'+ params.resort_id +'/alias/intersportfr';
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
        console.log('[intersportfr] Unknown resort_id passed in', key);
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.them.supplier =  'intersportfr';
    paramsOut.them.from = themDateFormat(params.start);
    paramsOut.them.to =  themDateFormat(common.getEndDate(params.start, params.duration));
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.us.datestamp = common.getTodayString();
    console.log('[intersportfr] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  function themDateFormat(dateIn){
    var d = new Date(dateIn);
    return d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
  }

  return defer.promise;
}




