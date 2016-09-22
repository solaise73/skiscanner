(function() {
'use strict';

angular
	.module('skiscanner.resorts', ['ngRoute'])
	.controller('ResortsCtrl', ResortsCtrl)
	.config(['$routeProvider', function($routeProvider) {
	  $routeProvider.when('/resorts', {
	    templateUrl: 'resorts/resorts.html?x2',
	    controller: 'ResortsCtrl'
	  });
	}])

	ResortsCtrl.$inject = ['$scope', '$firebaseObject', '$location'];

	function ResortsCtrl ($scope, $firebaseObject, $location) {

		var rootRef = firebase.database().ref();
		var resortsRef = rootRef.child('resorts').orderByKey();
		$scope.resorts = $firebaseObject(resortsRef);

		$scope.minDate = new Date('2016-12-17');
		$scope.maxDate = new Date('2017-04-17');
		$scope.searchResort = searchResort;

		function searchResort(){
			var path = '/ad/resort/'+ $scope.resortSelected + '/'+ getLastSaturdayString($scope.dateStart);
			console.log(path)
			$location.path(path);
		}

		function getLastSaturdayString(t){
		  console.log(t);
		  t.setHours(23);
		  t.setDate(t.getDate() - ((t.getDay()+1)%7));
		  console.log(t);
		  return t.toISOString().split('T')[0];
		}
	}
})();