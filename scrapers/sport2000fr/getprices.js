/**
 * Module dependencies
 */

var request = require('request');
var cheerio = require('cheerio');
var firebase = require("firebase");
var referenceData = require("./data/reference.json");




module.exports = {
  getPricesForShop: getPricesForShop
}

function getPricesForShop(params, cb) {
  var timestamp
  var productRef = firebase.database().ref('suppliers/sport2000fr/'+ params.shopId +'/products')
  var discountRef = firebase.database().ref('suppliers/sport2000fr/'+ params.shopId +'/discounts/'+ params.days +'/'+ timestamp)
  var priceRequest = {
    uri: 'https://location-ski.sport2000.fr/json/product/price/242',
    method: 'GET',
    followRedirect: true,
    followAllRedirects: true,
    jar: true,
    data: params
  }

  request(priceRequest, processPrices);

  function processPrices(err, res, body) {
    var productList = [];
    if (err)
      return cb(err);

    var requestData = res.request.data;
    var data = JSON.parse(body);
    Object.keys(data).forEach(function(key){
      var products = getProductDetails(data[key]);
      if (products) {
        productList = productList.concat(products)
      }
    })

    cb(null, productList)

    // firebase.database().ref('sport2000/countries/'+ requestData.countryId +'/resorts/'+ requestData.resortId +'/shops/'+ requestData.shopId +'/prices/'+ requestData.key).set(prices);
  }
}



function getProductDetails(productIn){
  var id = productIn.id;
  var products = [];
  var product = {};
  var s2kproduct;

  // lookup details of productId
  Object.keys(referenceData.products).forEach(function(key){
    s2kproduct = referenceData.products[key].id == id ? referenceData.products[key] : s2kproduct;
  })

  // level
  if (s2kproduct.level_ski)
    var level = s2kproduct.level_ski.reference;

  // create a product per category
  if (s2kproduct.category_ids) {
    s2kproduct.category_ids.forEach(function(category_id){
      var lookup = referenceData.categories[category_id];

      // for now we are only interested in adult and child skis/boards
      if ([1].indexOf(lookup.parent_id)<0)
        return null

      var product = {
        name: s2kproduct.reference,
        category: lookup.category,
        gender: lookup.gender,
        level: level,
        prices: productIn.prices,
        options: []
      }

      var option;
      if (productIn.options){
        // recurse the same for options
        Object.keys(productIn.options).forEach(function(key){
          option = getProductDetails(productIn.options[key]);
          if (option) {
            product.options.push(option);
          }
        })
      }
      // console.log(option)
      products.push( product );


    })
  } else {
    return s2kproduct;
  }


  // product
  // var product = products.products.filter(function(elem, index, array) {
  //     return elem.id = id;
  //   }
  // );
  // console.log(products)
  return products;
}