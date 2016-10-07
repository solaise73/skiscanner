var http          = require("http");
var express       = require("express");
var path          = require("path");
var scrapers      = require('./scrapers');
var firebase      = require("firebase");
var q             = require('q');

var app = express();

app.listen(8080, function () {
  console.log('snowmodo listening on port 8080!');
});

firebase.initializeApp({
  serviceAccount: "snowmodo-e745f9c60033.json",
  databaseURL: "https://snowmodo.firebaseio.com"
});

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}

 app.get("/", function(req, res) {
	res.status(200).send('Hello, snowmodo world!');
});

app.get("/compare/:countryId/:resortId/:start/:days", function(req, res) {
	var countryId = req.params.countryId;
	var resortId = req.params.resortId;
	var start = req.params.start;
	var days = req.params.days;
	var params = {
		country_id: countryId,
		resort_id: resortId,
		start: start,
		duration: days
	};
	console.log('Received request for', params)
	scrapers.fetchResort(params)


	var status = 202;
	res.status(status).end(http.STATUS_CODES[status]);

});