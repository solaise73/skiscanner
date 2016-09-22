var http          = require("http");
var express       = require("express");
var path          = require("path");
var scrapers      = require('./scrapers');
var firebase      = require("firebase");
var q             = require('q');

var app = express();

app.listen(3000, function () {
  console.log('Example app listening on port 3000!');
});

firebase.initializeApp({
  serviceAccount: "skiscanner-f90bc330d8cb.json",
  databaseURL: "https://skiscanner-7c3b8.firebaseio.com"
});

// Generic error handler used by all endpoints.
function handleError(res, reason, message, code) {
  console.log("ERROR: " + reason);
  res.status(code || 500).json({"error": message});
}

/*  "/contacts"
 *    GET: finds all contacts
 *    POST: creates a new contact
 */
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
	scrapers.scrapeResort(params)

	var status = 202;
	res.status(status).end(http.STATUS_CODES[status]);

});

// app.get("/compare/:supplierId", function(req, res) {
// 	var supplierId = req.params.supplierId;
// 	var params = {
// 		country_id: "AD",
// 		resort_id: "soldeu",
// 		start: "2016-12-24",
// 		duration: 6
// 	};
// 	if (scrapers[supplierId]){
// 		console.log('VALID supplierId', supplierId)
// 		scrapers[supplierId].scrapeResort(params).then(function(data){
// 			return scrapers[supplierId].processResort(params)
// 		})
// 	} else {
// 		console.log('INvalid supplierId', supplierId)
// 	}

// });

