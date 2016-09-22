/**
 * Module dependencies
 */
var q             = require('q');
var request = require('request');
var cheerio = require('cheerio');
var firebase = require("firebase");
var scrape = require("./scrape.js");
var process = require("./process.js");



module.exports = {
	doResort: doResort,
  scrapeResort: scrape.scrapeResort,
  processResort: process.processResort,
  getResortsAndShops: scrape.getResortsAndShops,
}


function doResort(params){
  return scrape.scrapeResort(params).then(function(){
      return process.processResort(params)
    })
}