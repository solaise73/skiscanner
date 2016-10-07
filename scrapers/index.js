var common        = require('./common');
var q             = require('q');
var firebase      = require("firebase");
var skiset        = require('./skiset');
var sport2000fr   = require('./sport2000fr');
var alpinresorts  = require('./alpinresorts');
var snowrental    = require('./snowrental');
var skidiscount   = require('./skidiscount');
var skirepublic   = require('./skirepublic');
var intersportfr  = require('./intersportfr');
var skimium       = require('./skimium');




module.exports = {
	skiset: skiset,
  sport2000fr: sport2000fr,
  alpinresorts: alpinresorts,
  snowrental: snowrental,
  skidiscount: skidiscount,
  skirepublic: skirepublic,
  intersportfr: intersportfr,
  skimium: skimium,
  scrapeResort: scrapeResort,
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

function scrapeResort(params){
  console.log('scrapeResort', params.resort_id)
  return checkLastScrape(params)
  .then(function(params){
    console.log(params)
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

function mapResortToPlaceId(params){
  var defer = q.defer();
  console.log('mapResortToPlaceId', params.resort_id);
  if (params.resort_id.length>25){
    firebase.database().ref().child('resorts').child(params.resort_id).once("value")
    .then(function(place){
      if (place.exists()){
        // snap.forEach(function(place){
          params.place_id = params.resort_id;
          params.resort_id = place.val()._resort_id;
          // console.log(place.val())
        // })
        console.log(params.place_id, 'maps to', params.resort_id)
        defer.resolve(params);
      } else {
        defer.reject('No resort name found for placeId')
      }
    })
    .catch(function(err){
      console.log( 'mapResortToPlaceId err'+ err)
      defer.reject('mapResortToPlaceId err'+ err)
    })

  } else {
    firebase.database().ref().child('resorts').orderByChild('_resort_id').startAt(params.resort_id).limitToFirst(1).once("value")
    .then(function(snap){
      if (snap.exists()){
        snap.forEach(function(place){
          var placeId = place.val().place_id;
          params.place_id = placeId;
          console.log('resort', params.resort_id, 'maps to', placeId)
        })
        defer.resolve(params);
      } else {
        defer.reject('No placeId found for resort name')
      }
    })
    .catch(function(err){
      console.log( 'mapResortToPlaceId err'+ err)
      defer.reject('mapResortToPlaceId err'+ err)
    })
  }
  return defer.promise
}