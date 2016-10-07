var scrapers      = require('./scrapers');
var firebase      = require("firebase");
var q             = require('q');

firebase.initializeApp({
  serviceAccount: "snowmodo-e745f9c60033.json",
  databaseURL: "https://snowmodo.firebaseio.com"
});




var params = {
	country_id: "france",
	resort_id: "ChIJeaU1B1KmjkcRALIogy2rCAo",
	start: "2016-12-24",
	duration: 6
};



// scrapers.skidiscount.fetchResort(params).then(function(data){
// 	console.log('DONE', data)
// })
scrapers.setUp(params)
// scrapers.intersportfr.fetchResort(params)
// scrapers.fetchResort(params)
// .then(function(result){
// 	console.log(result)
// })



process.on('uncaughtException', function (err) {
  console.log(err);
})