(function() {
'use strict';

angular
	.module('skiscanner.map', ['ngRoute'])
	.controller('MapCtrl', MapCtrl)
	.config(['$routeProvider', function($routeProvider) {
	  $routeProvider.when('/map/:ds', {
	    templateUrl: 'map/map.html?x=12',
	    controller: 'MapCtrl'
	  });
	}])

	MapCtrl.$inject = ['$scope', '$firebaseObject', '$firebaseArray', '$q', '$routeParams', 'scopeService', '$http', '$mdDialog'];

	function MapCtrl ($scope, $firebaseObject, $firebaseArray, $q, $routeParams, scopeService, $http, $mdDialog) {
		$scope.map = { center: { latitude: 45, longitude: -73 }, zoom: 8 };
		$scope.resort.$loaded().then(function(resort){
				var lat = resort.geometry.location.lat;
				var lng = resort.geometry.location.lng;
				console.log($scope.shops)
				$scope.map = { center: { latitude: lat, longitude: lng }, zoom: 12 };
			})

		// Create a GeoQuery centered at fish2
	  var geoQuery = geoShops.query({
	    center: [45.448034, 6.980226],
	    radius: 3
	  });

	  geoQuery.on("key_entered", function(key, location, distance) {
	  	var shopsRef = firebase.database().ref('shops');
		 	 // console.log(key + " exited query to " + location + " (" + distance + " km from center)");
		  shopsRef
		    .child(key)
		    .once('value', function(snapshot) {
		        // console.log("The shop", snapshot.val(), "and it is", distance, "km away");
		    });
		});
	}


})();