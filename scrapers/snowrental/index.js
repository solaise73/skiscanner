/**
 * Module dependencies
 */
var q             = require('q');
var request = require('request');
var cheerio = require('cheerio');
var scrape = require("./scrape.js");
var process = require("./process.js");


module.exports = {
  doResort: doResort,
  scrapeResort: scrape.scrapeResort,
  getResortsAndShops: scrape.getResortsAndShops,
  processResort: process.processResort,
}

function doResort(params){
  return scrape.scrapeResort(params).then(function(){
      return process.processResort(params)
    })
}