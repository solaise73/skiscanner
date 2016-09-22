var common        = require('./common');
var q             = require('q');
var firebase      = require("firebase");
var skiset        = require('./skiset');
var sport2000fr   = require('./sport2000fr');
var alpinresorts  = require('./alpinresorts');
var snowrental    = require('./snowrental');
var skidiscount   = require('./skidiscount');




module.exports = {
	skiset: skiset,
  sport2000fr: sport2000fr,
  alpinresorts: alpinresorts,
  snowrental: snowrental,
  skidiscount: skidiscount,
  scrapeResort: scrapeResort
}

function setLastScrape(params){
	var todaysTimeString = common.getTodayString();
	var checkUrl = 'resorts/'+params.resort_id+'/scrapes/'+ params.duration +'/'+ params.start;
	console.log('scrapeResort setting last scrape', checkUrl, Date.now())
	firebase.database().ref().child(checkUrl).push(Date.now());
}

function checkLastScrape(params){
  var defer = q.defer();

  // defer.resolve(params) //!!!!!!!!!!!!!!!!!!!!!!!!!!!
  // return defer.promise

  var todaysTimeString = common.getTodayString();
  var checkUrl = 'resorts/'+ params.resort_id +'/scrapes/'+ params.duration +'/'+ params.start;
  console.log('checkLastScrape', checkUrl)

  firebase.database().ref().child(checkUrl).limitToLast(1).once('value')
  .then(function(snap){
    if (snap.exists()){
      var timestampObj = snap.val();
      var timestamp = timestampObj[Object.keys(timestampObj)[0]];
      var lastScraped = new Date(timestamp);
      var now = Date.now();
      var hoursAgo = Math.round((now-lastScraped)/(1000*60*60));
    	console.log('Resort last scraped', lastScraped.toISOString(), hoursAgo, 'hrs ago')
      if ( hoursAgo > 24 ){
        console.log('Start scrape for', params.resort_id)
        defer.resolve(params)
      } else {
        console.log('Resort has been scraped in last 24 hrs')
        defer.reject('Resort has been scraped in last 24 hrs')
      }
    } else {
      console.log('Start scrape for', params.resort_id)
			defer.resolve(params)
    }
  })
  return defer.promise
}

function scrapeResort(params){
  console.log('scrapeResort', params.resort_id)
  checkLastScrape(params)
  .then(function(params){
    q.allSettled([
      sport2000fr.doResort(params),
      skidiscount.doResort(params),
      snowrental.doResort(params),
      skiset.doResort(params),
      alpinresorts.doResort(params)
    ]).then(function(data){
      console.log('Then! Scraped and processed', data)
    }).catch(function(err){
      console.log('Catch! ', err)
    }).finally(function(){
      console.log('Finally! Tidy up')
      setLastScrape(params)
    });
  })
}