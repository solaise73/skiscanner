var common        = require('./common');
var q             = require('q');
var firebase      = require("firebase");
var fs            = require('fs');
var skiset        = require('./skiset');
var sport2000fr   = require('./sport2000fr');
var alpinresorts  = require('./alpinresorts');
var snowrental    = require('./snowrental');
var skidiscount   = require('./skidiscount');
var skirepublic   = require('./skirepublic');
var intersportfr  = require('./intersportfr');
var skimium       = require('./skimium');


var websites = ['skiset', 'sport2000fr', 'alpinresorts', 'snowrental', 'skidiscount', 'skirepublic', 'intersportfr', 'skimium' ];
websites.forEach(function(website){
  var dir = './tmp/websites/'+ website;
  if (!fs.existsSync(dir)){ fs.mkdirSync(dir); }
});


module.exports = {
	skiset: skiset,
  sport2000fr: sport2000fr,
  alpinresorts: alpinresorts,
  snowrental: snowrental,
  skidiscount: skidiscount,
  skirepublic: skirepublic,
  intersportfr: intersportfr,
  skimium: skimium,
  fetchResort: fetchResort,
  setUp: setUp
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

function setUp(params){
  q.allSettled([
    sport2000fr.setUp(params),
    skidiscount.setUp(params),
    snowrental.setUp(params),
    skiset.setUp(params),
    alpinresorts.setUp(params),
    skidiscount.setUp(params),
    intersportfr.setUp(params)
  ]).then(function(data){
    console.log('Then! Setup', data)
  }).catch(function(err){
    console.log('Catch! ', err)
  });
}


function fetchResort(params){
  console.log('fetchResort', params.resort_id)
  q.allSettled([
    sport2000fr.fetchResort(params),
    skidiscount.fetchResort(params),
    snowrental.fetchResort(params),
    skiset.fetchResort(params),
    alpinresorts.fetchResort(params),
    intersportfr.fetchResort(params)
  ]).then(function(data){
    console.log('Then! Scraped and processed', data)
  }).catch(function(err){
    console.log('Catch! ', err)
  }).finally(function(){
    console.log('Finally! Tidy up')
    setLastScrape(params)
  });
}
