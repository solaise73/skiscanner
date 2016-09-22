var scrapers      = require('./scrapers');
var firebase      = require("firebase");
var q             = require('q');

firebase.initializeApp({
  serviceAccount: "skiscanner-f90bc330d8cb.json",
  databaseURL: "https://skiscanner-7c3b8.firebaseio.com"
});


var params = {
	country_id: "ad",
	resort_id: "el-tarter",
	start: "2016-12-24",
	duration: 6
};


scrapers.snowrental.getResortsAndShops(params)




process.on('uncaughtException', function (err) {
  console.log(err);
})