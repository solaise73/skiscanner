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
var cache         = require('Simple-Cache').SimpleCache("tmp/websites/skimium", console.log);



module.exports = {
  fetchResort: fetchResort,
  setUp: setUp
}

function setUp(){
  [{'france':'France'}].forEach(setUpCountry)
}

function setUpCountry(filterOn) {
  var defer = q.defer();
  var promises = [];
  var ourCountryId = Object.keys(filterOn)[0];
  var theirCountryId = filterOn[ourCountryId];
  var resorts = referenceData.resorts;
  resorts.forEach(function(resort){
    if (resort.label.indexOf(theirCountryId)>-1){
      var params = {
        us: {
          'country_id': ourCountryId
        },
        them: {
          'country_id': theirCountryId,
          'resort_id': resort.value,
          'resort_name': resort.value,
          'supplier': 'skimium'
        }
      }
      console.log('[skimium] setup', resort.value)
      promises.push(common.geoCodeResort(params))
    }
  })


  q.all(promises).then(function(){
    defer.resolve('[skimium] All resorts mapped')
  })

  return defer.promise;
}

function fetchResort(paramsIn) {
  var defer = q.defer();
  console.log('[skimium] Scrape started')
  mapParams(paramsIn)
  .then(function(params){
    var url = 'https://www.skimium.fr/station/search';
    var data = {
      'bookingResort': params.them.resort_id,
      'bookingStart': params.them.from,
      'bookingEnd': params.them.to
    }
    var key = url + JSON.stringify(data) + Date.now() //<___---------------WATATATTSTATSTASTATTSTASTST
    cache.get(key, function(callback){
      console.log('[skimium] fetchResort from ', url)
      var requestOptions = {
          uri: url,
          method: 'POST',
          followRedirect: true,
          followAllRedirects: true,
          jar: true,
          form: data
        }
      request(requestOptions, function(err, res, body){
        if(!err)
          callback(body)
      })
    }).fulfilled(function(body) {
      var $ = cheerio.load(body);
      var data = [];

      $('.shopListItem .shopListItem-name a').each(function(i,shopEl){
        var $shop = $(shopEl)
        var shopId = $shop.attr('href').split('-').reverse()[0]
        var shopName = $shop.text()
        data.push({name: shopName, id: shopId})
      })
      console.log( data)
      data.forEach(function(shop){
        var p1 = JSON.parse(JSON.stringify(params));
        p1.them.shop_id = shop.id;
        p1.them.shop_name = shop.name;
        common.findShop(p1).then(function(shop){
          var p2 = JSON.parse(JSON.stringify(p1));
          p2.us.shop_id = shop.place_id;
          console.log('[skimium] fetchResort scrape shop', p2.us.shop_id, p2.them.shop_id, shop.name)
          scrapeShopPrices(p2).then(function(products){
            var p3 = JSON.parse(JSON.stringify(p2));
            p3.them.products = products;
            processShop(p3)
          })
        })
      })

    })
  })
  return defer.promise;
}

function processShop(params){
  var dataUrl = '/compare/'+ params.us.resort_id +'/'+ params.them.datestamp +'/'+ params.us.duration +'/'+ params.us.datestamp;
  console.log('[skimium] processShop', dataUrl)
  params.them.products.forEach(function(product){
    if (true){ // exclude any here
      var p = getProductDetails(product);
      var categoryId = p.category;
      var levelId = p.level ? p.level : '0';
      delete p.category;
      delete p.level;
      console.log('[skimium] saving a product', categoryId, levelId, params.us.shop_id)
      firebase.database().ref(dataUrl).child(categoryId).child(levelId).child('shops').child(params.us.shop_id).child('suppliers/skimium').set(p);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/skimium').child(categoryId).child(levelId).set(p);
      firebase.database().ref(dataUrl).child('shops').child(params.us.shop_id).child('suppliers/skimium/best_discount').set(p.discount);
    } else {
      console.log('[skimium] ignoring a variation')
    }
  })
}

function scrapeShopPrices(params) {
  var defer = q.defer();
  var uri = 'https://www.skimium.fr/equipment'
  var data = {
    'store': params.them.shop_id
  }
  var key = uri + JSON.stringify(data);
  console.log('[skimium] scrapeShopPrices requesting', uri, data)
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
      var uri = 'https://www.skimium.fr/ax/products';
      var data2 = {
        'target': 6,
        'category': 1,
        'display': 'tablet'
      }
      var nextRequest = {
        uri: uri,
        method: 'POST',
        followRedirect: true,
        followAllRedirects: true,
        jar: true,
        form: data2
      }
      var data3 = { 'action': 'create' }
      var priceRequest = {
        uri: 'https://www.skimium.fr/ax/update-product.json',
        method: 'POST',
        followRedirect: true,
        followAllRedirects: true,
        jar: true,
        form: data3
      }

      request(nextRequest, function(err, res, body){
        var data = JSON.parse(body)
        var $ = cheerio.load(data.products)
        var data = [];
        $('form').each(function(i,_form){
            var form = $(_form);
            var packdata = {};
            $(form).serializeArray().map(function(x){
              // /pack_id=4&pack_name=pack-budget-h&&action=create
              priceRequest.form[x.name] = x.value;
            })
            request(priceRequest, function(err, res, body){
              var priceData = JSON.parse(body)
              console.log(priceData)
            })

            /// TODO - split this out into a chain of promises
            /// TODO - split this out into a chain of promises
            /// TODO - split this out into a chain of promises
            /// TODO - split this out into a chain of promises
            /// TODO - split this out into a chain of promises
            /// TODO - split this out into a chain of promises

            // var id = form.attr('id').replace('form','');
            // var nameId = '#pack_'+id;
            // var pack = $(nameId).find('h2').text().trim();
            // var packId = slug(pack, {'lower': true});
            
            // packdata.name = pack;
            // packdata.id = packId;
            
        })
        console.log('[skimium] scrapeShopPrices success')
        console.log(data);

      })
    })
  }).fulfilled(function(data) {
    console.log('[skimium] scrapeShopPrices resolved', params.them.shop_id)
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
    console.log('[skimium] Got product', product.name, product.category, product.level);
  return product;
}



function mapParams(paramsIn) {
  var params = JSON.parse(JSON.stringify(paramsIn));
  var defer = q.defer();
  var key = 'resorts/'+ params.resort_id +'/alias/skimium';
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
        console.log('[skimium] Unknown resort_id passed in', key);
      }
    })
  }).fulfilled(function(data) {
    paramsOut.them = data;
    paramsOut.them.supplier =  'skimium';
    paramsOut.them.from = themDateFormat(params.start);
    paramsOut.them.to =  themDateFormat(common.getEndDate(params.start, params.duration));
    paramsOut.them.timestamp =  common.getLastSaturdaysTimestamp(params.start); // using lastSaturday
    paramsOut.them.datestamp =  common.getLastSaturdayString(params.start); // using lastSaturday
    paramsOut.us.datestamp = common.getTodayString();
    console.log('[skimium] mapParams for resort', paramsOut.us.resort_id, paramsOut.them.resort_id);
    defer.resolve(paramsOut)
  })

  function themDateFormat(dateIn){
    var d = new Date(dateIn);
    return d.getDate()+'/'+(d.getMonth()+1)+'/'+(d.getFullYear()+'').slice(-2);
  }

  return defer.promise;
}




var test={"products":"    \n        <script type=\"text\/javascript\">\n            productPackId['pack-initiation-h'] = 5\n        <\/script>\n\n        \n        \n                                            <div data-image=\" https:\/\/medias.skimium.com\/assets\/pack\/0001\/12\/thumb_11039_pack_medium.jpg \"\n             data-box=\"1\"\n                         class=\"product-box  product-level-2 product-box-first\"\n             id=\"pack-initiation-h\">\n\n            <div class=\"box-content\">\n                <form>\n                    <input type=\"hidden\" name=\"pack_id\" value=\"5\">\n                    <input type=\"hidden\" name=\"pack_name\" value=\"pack-initiation-h\">\n                    <strong class=\"pack-gender\">homme<\/strong>\n                    <h2 class=\"box-title\">\n                        Pack <br\/> initiation\n                    <\/h2>\n\n                    <div class=\"box-description hidden-mobile\">\n                        <p>Des skis faciles et rassurants pour d&eacute;buter en toute s&eacute;curit&eacute;.<\/p>                    <\/div>\n                    <div class=\"box-youtube youtube-trigger\">\n                                            <\/div>\n\n                    <div class=\"box-price\">\n                        \n                                                            <span class=\"discount-box\">\n                                                                    <span class=\"amount\">-20%<\/span>\n                                                                <\/span>\n                            \n                                                            <span class=\"price-old\">145,00\u00a0\u20ac<\/span>\n                                                    \n                        <span class=\"price\">116,00\u00a0\u20ac<\/span>\n\n                                                    <span class=\"price-special\">\n                            <span class=\"amount\">110,20\u00a0\u20ac<\/span>\n                            <small class=\"remand\">avec la carte D\u00e9cathlon<\/small>\n                        <\/span>\n                        \n                    <div class=\"product-action-box\">\n                        <a href=\"#homme\/ski\/pack-initiation-h\"  class=\"btn-action obj-btn\">\n                                                            S\u00e9lectionner ce mat\u00e9riel\n                                                    <\/a>\n                        <a href=\"#homme\/ski\/\" class=\"product-pack-back obj-btn color-3\">Retour au choix mat\u00e9riel<\/a>\n                    <\/div>\n                <\/div>\n\n                    <div class=\"product-details\">\n\n                                                                            <div class=\"product-img\">\n                                                                    <img src=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14641_product_medium.png                    \" data-d=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14642_product_big.png\" data-t=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14641_product_medium.png                    \" data-m=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14642_product_smaller.png\">\n                                                            <\/div>\n                        \n\n                                                 \n                                                                                                                                            \n\n                            <div class=\"product-options\">\n\n                                                                    <div class=\"product-option product-active-option\"\n                                         data-product-id=\"18\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"18\" alt=\"checked\"\n                                               id=\"5-product1\" name=\"products[]\"\/>\n                                        <label for=\"5-product1\"> <\/label>\n                                    <\/span>\n                                        <div class=\"option-img\">\n                                                                                            \n<img title=\"TECNICA MEGA3.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/11\/thumb_10910_product_smaller.png\" width=\"45\" height=\"45\"  \/>                                                                                    <\/div>\n                                        <div class=\"option-label\">\n                                            <strong>Chaussures initiation <\/strong>\n                                        <\/div>\n                                        <div class=\"option-price\">\n                                            (inclus)\n                                        <\/div>\n                                    <\/div>\n                                \n                                                                                                                                                                \n                                                                    <div class=\"product-option\" data-product-id=\"17\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"17\"\n                                               id=\"5-product2\" name=\"products[]\"\/>\n                                        <label for=\"5-product2\"> <\/label>\n                                    <\/span>\n                                    <div class=\"option-img\">\n                                                                                    \n<img title=\"zoom_3d1c5561d48d43aab528032972670a7a.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/12\/thumb_11303_product_smaller.png\" width=\"45\" height=\"43\"  \/>                                                                            <\/div>\n                                    <div class=\"option-label\">\n                                        <strong>Casque adulte<\/strong>\n                                    <\/div>\n                                    <div class=\"option-price\">\n                                        (+14,40\u00a0\u20ac)\n                                    <\/div>\n                                                                    <\/div>\n                            \n                                                                    <div class=\"pack-popin-links\">\n                                        <div class=\" more-models\">\n                                            <a href=\"#homme\/ski\/pack-initiation-h\"  class=\"box-examples\" data-parent=\"pack-initiation-h\"><span>Les mod\u00e8les<\/span><\/a>\n                                        <\/div>\n                                                                            <\/div>\n                                \n                                                                                                        <div class=\"product-brand\">\n                                        <div class=\"product-box-brand\">\n                                            <div class=\"pack-brand-name\">CRUZAR<\/div>\n                                                                                            \n<img title=\"fischer.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/01\/thumb_594_product_brand.png\" width=\"70\" height=\"12\"  \/>                                                                                    <\/div>\n                                                                                                                                                            <\/div>\n                                \n                                                                <div class=\"pack-category\">\n                                    Cat\u00e9gorie A\n                                <\/div>\n                                                            <\/div>\n                        \n                    <\/div> <!-- .product-details -->\n\n                <\/form>\n            <\/div> <!-- .product-box-content -->\n\n        <\/div>\n    \n        <script type=\"text\/javascript\">\n            productPackId['pack-loisir-h'] = 6\n        <\/script>\n\n        \n        \n                                            <div data-image=\" https:\/\/medias.skimium.com\/assets\/pack\/0001\/12\/thumb_11040_pack_medium.jpg \"\n             data-box=\"2\"\n                         class=\"product-box  product-level-3\"\n             id=\"pack-loisir-h\">\n\n            <div class=\"box-content\">\n                <form>\n                    <input type=\"hidden\" name=\"pack_id\" value=\"6\">\n                    <input type=\"hidden\" name=\"pack_name\" value=\"pack-loisir-h\">\n                    <strong class=\"pack-gender\">homme<\/strong>\n                    <h2 class=\"box-title\">\n                        Pack <br\/> loisir\n                    <\/h2>\n\n                    <div class=\"box-description hidden-mobile\">\n                        Des skis polyvalents et tol\u00e9rants pour \u00e9voluer en toute confiance \u00e0 vitesse mod\u00e9r\u00e9e.                    <\/div>\n                    <div class=\"box-youtube youtube-trigger\">\n                                            <\/div>\n\n                    <div class=\"box-price\">\n                        \n                                                            <span class=\"discount-box\">\n                                                                    <span class=\"amount\">-20%<\/span>\n                                                                <\/span>\n                            \n                                                            <span class=\"price-old\">165,00\u00a0\u20ac<\/span>\n                                                    \n                        <span class=\"price\">132,00\u00a0\u20ac<\/span>\n\n                                                    <span class=\"price-special\">\n                            <span class=\"amount\">125,40\u00a0\u20ac<\/span>\n                            <small class=\"remand\">avec la carte D\u00e9cathlon<\/small>\n                        <\/span>\n                        \n                    <div class=\"product-action-box\">\n                        <a href=\"#homme\/ski\/pack-loisir-h\"  class=\"btn-action obj-btn\">\n                                                            S\u00e9lectionner ce mat\u00e9riel\n                                                    <\/a>\n                        <a href=\"#homme\/ski\/\" class=\"product-pack-back obj-btn color-3\">Retour au choix mat\u00e9riel<\/a>\n                    <\/div>\n                <\/div>\n\n                    <div class=\"product-details\">\n\n                                                                            <div class=\"product-img\">\n                                                                    <img src=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14724_product_medium.jpg                    \" data-d=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14725_product_big.jpg\" data-t=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14724_product_medium.jpg                    \" data-m=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14725_product_smaller.jpg\">\n                                                            <\/div>\n                        \n\n                                                 \n                                                                                                                                            \n\n                            <div class=\"product-options\">\n\n                                                                    <div class=\"product-option product-active-option\"\n                                         data-product-id=\"19\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"19\" alt=\"checked\"\n                                               id=\"6-product1\" name=\"products[]\"\/>\n                                        <label for=\"6-product1\"> <\/label>\n                                    <\/span>\n                                        <div class=\"option-img\">\n                                                                                            \n<img title=\"LANGE CONCEPT +.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/11\/thumb_10942_product_smaller.png\" width=\"45\" height=\"54\"  \/>                                                                                    <\/div>\n                                        <div class=\"option-label\">\n                                            <strong>Chaussures dynamique <\/strong>\n                                        <\/div>\n                                        <div class=\"option-price\">\n                                            (inclus)\n                                        <\/div>\n                                    <\/div>\n                                \n                                                                                                                                                                \n                                                                    <div class=\"product-option\" data-product-id=\"17\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"17\"\n                                               id=\"6-product2\" name=\"products[]\"\/>\n                                        <label for=\"6-product2\"> <\/label>\n                                    <\/span>\n                                    <div class=\"option-img\">\n                                                                                    \n<img title=\"zoom_3d1c5561d48d43aab528032972670a7a.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/12\/thumb_11303_product_smaller.png\" width=\"45\" height=\"43\"  \/>                                                                            <\/div>\n                                    <div class=\"option-label\">\n                                        <strong>Casque adulte<\/strong>\n                                    <\/div>\n                                    <div class=\"option-price\">\n                                        (+14,40\u00a0\u20ac)\n                                    <\/div>\n                                                                    <\/div>\n                            \n                                                                    <div class=\"pack-popin-links\">\n                                        <div class=\" more-models\">\n                                            <a href=\"#homme\/ski\/pack-loisir-h\"  class=\"box-examples\" data-parent=\"pack-loisir-h\"><span>Les mod\u00e8les<\/span><\/a>\n                                        <\/div>\n                                                                            <\/div>\n                                \n                                                                                                        <div class=\"product-brand\">\n                                        <div class=\"product-box-brand\">\n                                            <div class=\"pack-brand-name\">RTM 7.4<\/div>\n                                                                                            \n<img title=\"volkl.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/01\/thumb_731_product_brand.png\" width=\"70\" height=\"22\"  \/>                                                                                    <\/div>\n                                                                                                                                                            <\/div>\n                                \n                                                                <div class=\"pack-category\">\n                                    Cat\u00e9gorie B\n                                <\/div>\n                                                            <\/div>\n                        \n                    <\/div> <!-- .product-details -->\n\n                <\/form>\n            <\/div> <!-- .product-box-content -->\n\n        <\/div>\n    \n        <script type=\"text\/javascript\">\n            productPackId['pack-dynamique-h'] = 7\n        <\/script>\n\n        \n        \n                                            <div data-image=\" https:\/\/medias.skimium.com\/assets\/pack\/0001\/12\/thumb_11041_pack_medium.jpg \"\n             data-box=\"3\"\n                         class=\"product-box  product-level-4\"\n             id=\"pack-dynamique-h\">\n\n            <div class=\"box-content\">\n                <form>\n                    <input type=\"hidden\" name=\"pack_id\" value=\"7\">\n                    <input type=\"hidden\" name=\"pack_name\" value=\"pack-dynamique-h\">\n                    <strong class=\"pack-gender\">homme<\/strong>\n                    <h2 class=\"box-title\">\n                        Pack <br\/> dynamique\n                    <\/h2>\n\n                    <div class=\"box-description hidden-mobile\">\n                        Des skis performants pour allier plaisir et sensations sur l\u2019ensemble du domaine skiable.<br>\r\n                    <\/div>\n                    <div class=\"box-youtube youtube-trigger\">\n                                            <\/div>\n\n                    <div class=\"box-price\">\n                        \n                                                            <span class=\"discount-box\">\n                                                                    <span class=\"amount\">-20%<\/span>\n                                                                <\/span>\n                            \n                                                            <span class=\"price-old\">185,00\u00a0\u20ac<\/span>\n                                                    \n                        <span class=\"price\">148,00\u00a0\u20ac<\/span>\n\n                                                    <span class=\"price-special\">\n                            <span class=\"amount\">140,60\u00a0\u20ac<\/span>\n                            <small class=\"remand\">avec la carte D\u00e9cathlon<\/small>\n                        <\/span>\n                        \n                    <div class=\"product-action-box\">\n                        <a href=\"#homme\/ski\/pack-dynamique-h\"  class=\"btn-action obj-btn\">\n                                                            S\u00e9lectionner ce mat\u00e9riel\n                                                    <\/a>\n                        <a href=\"#homme\/ski\/\" class=\"product-pack-back obj-btn color-3\">Retour au choix mat\u00e9riel<\/a>\n                    <\/div>\n                <\/div>\n\n                    <div class=\"product-details\">\n\n                                                                            <div class=\"product-img\">\n                                                                    <img src=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14738_product_medium.png                    \" data-d=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14739_product_big.png\" data-t=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14738_product_medium.png                    \" data-m=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14739_product_smaller.png\">\n                                                            <\/div>\n                        \n\n                                                 \n                                                                                                                                            \n\n                            <div class=\"product-options\">\n\n                                                                    <div class=\"product-option product-active-option\"\n                                         data-product-id=\"19\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"19\" alt=\"checked\"\n                                               id=\"7-product1\" name=\"products[]\"\/>\n                                        <label for=\"7-product1\"> <\/label>\n                                    <\/span>\n                                        <div class=\"option-img\">\n                                                                                            \n<img title=\"LANGE CONCEPT +.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/11\/thumb_10942_product_smaller.png\" width=\"45\" height=\"54\"  \/>                                                                                    <\/div>\n                                        <div class=\"option-label\">\n                                            <strong>Chaussures dynamique <\/strong>\n                                        <\/div>\n                                        <div class=\"option-price\">\n                                            (inclus)\n                                        <\/div>\n                                    <\/div>\n                                \n                                                                                                                                                                \n                                                                    <div class=\"product-option\" data-product-id=\"17\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"17\"\n                                               id=\"7-product2\" name=\"products[]\"\/>\n                                        <label for=\"7-product2\"> <\/label>\n                                    <\/span>\n                                    <div class=\"option-img\">\n                                                                                    \n<img title=\"zoom_3d1c5561d48d43aab528032972670a7a.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/12\/thumb_11303_product_smaller.png\" width=\"45\" height=\"43\"  \/>                                                                            <\/div>\n                                    <div class=\"option-label\">\n                                        <strong>Casque adulte<\/strong>\n                                    <\/div>\n                                    <div class=\"option-price\">\n                                        (+14,40\u00a0\u20ac)\n                                    <\/div>\n                                                                    <\/div>\n                            \n                                                                    <div class=\"pack-popin-links\">\n                                        <div class=\" more-models\">\n                                            <a href=\"#homme\/ski\/pack-dynamique-h\"  class=\"box-examples\" data-parent=\"pack-dynamique-h\"><span>Les mod\u00e8les<\/span><\/a>\n                                        <\/div>\n                                                                            <\/div>\n                                \n                                                                                                        <div class=\"product-brand\">\n                                        <div class=\"product-box-brand\">\n                                            <div class=\"pack-brand-name\">VANTAGE X CTI<\/div>\n                                                                                            \n<img title=\"atomic.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/01\/thumb_597_product_brand.png\" width=\"70\" height=\"15\"  \/>                                                                                    <\/div>\n                                                                                                                                                            <\/div>\n                                \n                                                                <div class=\"pack-category\">\n                                    Cat\u00e9gorie C\n                                <\/div>\n                                                            <\/div>\n                        \n                    <\/div> <!-- .product-details -->\n\n                <\/form>\n            <\/div> <!-- .product-box-content -->\n\n        <\/div>\n    \n        <script type=\"text\/javascript\">\n            productPackId['pack-premium-all-mtn-h'] = 54\n        <\/script>\n\n        \n        \n                                            <div data-image=\" https:\/\/medias.skimium.com\/assets\/pack\/0001\/12\/thumb_11082_pack_medium.jpg \"\n             data-box=\"4\"\n                         class=\"product-box  product-level-5\"\n             id=\"pack-premium-all-mtn-h\">\n\n            <div class=\"box-content\">\n                <form>\n                    <input type=\"hidden\" name=\"pack_id\" value=\"54\">\n                    <input type=\"hidden\" name=\"pack_name\" value=\"pack-premium-all-mtn-h\">\n                    <strong class=\"pack-gender\">homme<\/strong>\n                    <h2 class=\"box-title\">\n                        Pack <br\/> premium all mtn\n                    <\/h2>\n\n                    <div class=\"box-description hidden-mobile\">\n                        Des &nbsp;skis haut de gamme derni\u00e8re g\u00e9n\u00e9ration pour un maximum de sensation et de plaisir en toute neige et tout terrain.                    <\/div>\n                    <div class=\"box-youtube youtube-trigger\">\n                                            <\/div>\n\n                    <div class=\"box-price\">\n                        \n                                                            <span class=\"discount-box\">\n                                                                    <span class=\"amount\">-20%<\/span>\n                                                                <\/span>\n                            \n                                                            <span class=\"price-old\">225,00\u00a0\u20ac<\/span>\n                                                    \n                        <span class=\"price\">180,00\u00a0\u20ac<\/span>\n\n                                                    <span class=\"price-special\">\n                            <span class=\"amount\">171,00\u00a0\u20ac<\/span>\n                            <small class=\"remand\">avec la carte D\u00e9cathlon<\/small>\n                        <\/span>\n                        \n                    <div class=\"product-action-box\">\n                        <a href=\"#homme\/ski\/pack-premium-all-mtn-h\"  class=\"btn-action obj-btn\">\n                                                            S\u00e9lectionner ce mat\u00e9riel\n                                                    <\/a>\n                        <a href=\"#homme\/ski\/\" class=\"product-pack-back obj-btn color-3\">Retour au choix mat\u00e9riel<\/a>\n                    <\/div>\n                <\/div>\n\n                    <div class=\"product-details\">\n\n                                                                            <div class=\"product-img\">\n                                                                    <img src=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14740_product_medium.png                    \" data-d=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14741_product_big.png\" data-t=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14740_product_medium.png                    \" data-m=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14741_product_smaller.png\">\n                                                            <\/div>\n                        \n\n                                                 \n                                                                                                                                            \n\n                            <div class=\"product-options\">\n\n                                                                    <div class=\"product-option product-active-option\"\n                                         data-product-id=\"56\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"56\" alt=\"checked\"\n                                               id=\"54-product1\" name=\"products[]\"\/>\n                                        <label for=\"54-product1\"> <\/label>\n                                    <\/span>\n                                        <div class=\"option-img\">\n                                                                                            \n<img title=\"ROSSIGNOL ALLTRACK RENTAL.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/11\/thumb_10944_product_smaller.png\" width=\"45\" height=\"56\"  \/>                                                                                    <\/div>\n                                        <div class=\"option-label\">\n                                            <strong>Chaussures premium <\/strong>\n                                        <\/div>\n                                        <div class=\"option-price\">\n                                            (inclus)\n                                        <\/div>\n                                    <\/div>\n                                \n                                                                                                                                                                \n                                                                    <div class=\"product-option\" data-product-id=\"17\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"17\"\n                                               id=\"54-product2\" name=\"products[]\"\/>\n                                        <label for=\"54-product2\"> <\/label>\n                                    <\/span>\n                                    <div class=\"option-img\">\n                                                                                    \n<img title=\"zoom_3d1c5561d48d43aab528032972670a7a.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/12\/thumb_11303_product_smaller.png\" width=\"45\" height=\"43\"  \/>                                                                            <\/div>\n                                    <div class=\"option-label\">\n                                        <strong>Casque adulte<\/strong>\n                                    <\/div>\n                                    <div class=\"option-price\">\n                                        (+14,40\u00a0\u20ac)\n                                    <\/div>\n                                                                    <\/div>\n                            \n                                                                    <div class=\"pack-popin-links\">\n                                        <div class=\" more-models\">\n                                            <a href=\"#homme\/ski\/pack-premium-all-mtn-h\"  class=\"box-examples\" data-parent=\"pack-premium-all-mtn-h\"><span>Les mod\u00e8les<\/span><\/a>\n                                        <\/div>\n                                                                            <\/div>\n                                \n                                                                                                        <div class=\"product-brand\">\n                                        <div class=\"product-box-brand\">\n                                            <div class=\"pack-brand-name\">QST 85<\/div>\n                                                                                            \n<img title=\"Salomon-resiz\u00e9ok.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14835_product_brand.png\" width=\"55\" height=\"30\"  \/>                                                                                    <\/div>\n                                                                                                                                                            <\/div>\n                                \n                                                                <div class=\"pack-category\">\n                                    Cat\u00e9gorie D\n                                <\/div>\n                                                            <\/div>\n                        \n                    <\/div> <!-- .product-details -->\n\n                <\/form>\n            <\/div> <!-- .product-box-content -->\n\n        <\/div>\n    \n        <script type=\"text\/javascript\">\n            productPackId['pack-premium-piste-h'] = 78\n        <\/script>\n\n        \n        \n                                            <div data-image=\" https:\/\/medias.skimium.com\/assets\/pack\/0001\/12\/thumb_11137_pack_medium.jpg \"\n             data-box=\"5\"\n                         class=\"product-box  product-level-5 product-box-last\"\n             id=\"pack-premium-piste-h\">\n\n            <div class=\"box-content\">\n                <form>\n                    <input type=\"hidden\" name=\"pack_id\" value=\"78\">\n                    <input type=\"hidden\" name=\"pack_name\" value=\"pack-premium-piste-h\">\n                    <strong class=\"pack-gender\">homme<\/strong>\n                    <h2 class=\"box-title\">\n                        Pack <br\/> premium piste\n                    <\/h2>\n\n                    <div class=\"box-description hidden-mobile\">\n                        Des skis haut de gamme derni\u00e8re g\u00e9n\u00e9ration pour un maximum de sensation et de plaisir sur pistes dam\u00e9es.<br>\r\n                    <\/div>\n                    <div class=\"box-youtube youtube-trigger\">\n                                            <\/div>\n\n                    <div class=\"box-price\">\n                        \n                                                            <span class=\"discount-box\">\n                                                                    <span class=\"amount\">-20%<\/span>\n                                                                <\/span>\n                            \n                                                            <span class=\"price-old\">225,00\u00a0\u20ac<\/span>\n                                                    \n                        <span class=\"price\">180,00\u00a0\u20ac<\/span>\n\n                                                    <span class=\"price-special\">\n                            <span class=\"amount\">171,00\u00a0\u20ac<\/span>\n                            <small class=\"remand\">avec la carte D\u00e9cathlon<\/small>\n                        <\/span>\n                        \n                    <div class=\"product-action-box\">\n                        <a href=\"#homme\/ski\/pack-premium-piste-h\"  class=\"btn-action obj-btn\">\n                                                            S\u00e9lectionner ce mat\u00e9riel\n                                                    <\/a>\n                        <a href=\"#homme\/ski\/\" class=\"product-pack-back obj-btn color-3\">Retour au choix mat\u00e9riel<\/a>\n                    <\/div>\n                <\/div>\n\n                    <div class=\"product-details\">\n\n                                                                            <div class=\"product-img\">\n                                                                    <img src=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14742_product_medium.png                    \" data-d=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14743_product_big.png\" data-t=\"        \t            https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14742_product_medium.png                    \" data-m=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/15\/thumb_14743_product_smaller.png\">\n                                                            <\/div>\n                        \n\n                                                 \n                                                                                                                                            \n\n                            <div class=\"product-options\">\n\n                                                                    <div class=\"product-option product-active-option\"\n                                         data-product-id=\"56\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"56\" alt=\"checked\"\n                                               id=\"78-product1\" name=\"products[]\"\/>\n                                        <label for=\"78-product1\"> <\/label>\n                                    <\/span>\n                                        <div class=\"option-img\">\n                                                                                            \n<img title=\"ROSSIGNOL ALLTRACK RENTAL.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/11\/thumb_10944_product_smaller.png\" width=\"45\" height=\"56\"  \/>                                                                                    <\/div>\n                                        <div class=\"option-label\">\n                                            <strong>Chaussures premium <\/strong>\n                                        <\/div>\n                                        <div class=\"option-price\">\n                                            (inclus)\n                                        <\/div>\n                                    <\/div>\n                                \n                                                                                                                                                                \n                                                                    <div class=\"product-option\" data-product-id=\"17\">\n                                    <span class=\"obj-customCheckbox\">\n                                        <input type=\"checkbox\" value=\"17\"\n                                               id=\"78-product2\" name=\"products[]\"\/>\n                                        <label for=\"78-product2\"> <\/label>\n                                    <\/span>\n                                    <div class=\"option-img\">\n                                                                                    \n<img title=\"zoom_3d1c5561d48d43aab528032972670a7a.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/12\/thumb_11303_product_smaller.png\" width=\"45\" height=\"43\"  \/>                                                                            <\/div>\n                                    <div class=\"option-label\">\n                                        <strong>Casque adulte<\/strong>\n                                    <\/div>\n                                    <div class=\"option-price\">\n                                        (+14,40\u00a0\u20ac)\n                                    <\/div>\n                                                                    <\/div>\n                            \n                                                                    <div class=\"pack-popin-links\">\n                                        <div class=\" more-models\">\n                                            <a href=\"#homme\/ski\/pack-premium-piste-h\"  class=\"box-examples\" data-parent=\"pack-premium-piste-h\"><span>Les mod\u00e8les<\/span><\/a>\n                                        <\/div>\n                                                                            <\/div>\n                                \n                                                                                                        <div class=\"product-brand\">\n                                        <div class=\"product-box-brand\">\n                                            <div class=\"pack-brand-name\">HERO ELITE ALL TURN<\/div>\n                                                                                            \n<img title=\"rossignol.png\" src=\"https:\/\/medias.skimium.com\/assets\/product\/0001\/01\/thumb_588_product_brand.png\" width=\"70\" height=\"23\"  \/>                                                                                    <\/div>\n                                                                                                                                                            <\/div>\n                                \n                                                                <div class=\"pack-category\">\n                                    Cat\u00e9gorie D\n                                <\/div>\n                                                            <\/div>\n                        \n                    <\/div> <!-- .product-details -->\n\n                <\/form>\n            <\/div> <!-- .product-box-content -->\n\n        <\/div>\n    ","help":"    \n        <div class=\"products-help-box product-level-2\">\n                <ul>\r\n<li>Vous &eacute;voluez &agrave; vitesse mod&eacute;r&eacute;e en virages d&eacute;rap&eacute;s sur des pistes bleues ou rouges.&nbsp;<\/li>\r\n<li>Vous d&eacute;couvrez les virages serr&eacute;s et les grands virages arrondis. &nbsp; &nbsp; &nbsp;&nbsp;<\/li>\r\n<\/ul>&nbsp;\n            <div class=\"arrow\"><\/div>\n        <\/div>\n\n                    <div class=\"products-help-separator\"><\/div>\n            \n        <div class=\"products-help-box product-level-3\">\n                <ul><li>Vous \u00e9voluez avec confiance sur les pistes rouges.&nbsp;<br> <\/li> <li>Vous \u00eates capables d'adapter vos virages aux diff\u00e9rents terrains sur lesquels vous \u00e9voluez.&nbsp;<br> <\/li> <li>Vous ma\u00eetrisez toutes les techniques de virage.&nbsp;<br> <\/li> <li>Vous skiez \u00e0 vitesse soutenue sur tous types de pistes et de neige.<br> <\/li> <\/ul>&nbsp;\n            <div class=\"arrow\"><\/div>\n        <\/div>\n\n                    <div class=\"products-help-separator\"><\/div>\n            \n        <div class=\"products-help-box product-level-4\">\n                <ul>\r\n\t<li>Vous ma\u00eetrisez toutes les techniques de virage.<\/li>\r\n\t<li>Vous skiez \u00e0 vitesse \u00e9lev\u00e9e sur tous types de terrain et toutes conditions de neige.&nbsp;<\/li>\r\n\t<li>Vous recherchez un ski haut de gamme sp\u00e9cifique \u00e0 votre pratique : racing, free ride, free style, skiercross, backcountry, ... &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;&nbsp;<br>\r\n<\/li>\r\n<\/ul>&nbsp;\n            <div class=\"arrow\"><\/div>\n        <\/div>\n\n                    <div class=\"products-help-separator\"><\/div>\n            \n        <div class=\"products-help-box product-level-5\">\n                <ul><li>Vous ma\u00eetrisez toutes les techniques de virage. Vous skiez ais\u00e9ment sur tous types de terrain.&nbsp;<\/li><li>Vous voulez vous faire plaisir avec du <b>mat\u00e9riel tr\u00e8s haut de gamme , neuf en d\u00e9but de saison<\/b> &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp;<br><\/li><\/ul><p><\/p>&nbsp;\n            <div class=\"arrow\"><\/div>\n        <\/div>\n\n                    <div class=\"products-help-separator\"><\/div>\n            \n        <div class=\"products-help-box product-level-5\">\n                <p>.<\/p>&nbsp;\n               <div class=\"arrow\"><\/div>\n        <\/div>\n\n            "}