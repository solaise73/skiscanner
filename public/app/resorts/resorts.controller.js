(function() {
'use strict';

angular
	.module('skiscanner.resorts', ['ngRoute'])
	.controller('ResortsCtrl', ResortsCtrl)
	.config(['$routeProvider', function($routeProvider) {
	  $routeProvider.when('/resorts', {
	    templateUrl: 'resorts/resorts.html?x211',
	    controller: 'ResortsCtrl'
	  });
	}])

	ResortsCtrl.$inject = ['$scope', '$firebaseObject', '$firebaseArray', '$location'];

	function ResortsCtrl ($scope, $firebaseObject, $firebaseArray, $location) {
		var self = this;
		var rootRef = firebase.database().ref();
		var countriesRef = rootRef.child('countries').orderByKey();
		var resortsRef = rootRef.child('resorts').orderByKey();
		$scope.countries = $firebaseObject(resortsRef);
		$scope.resorts = $firebaseArray(resortsRef);

		$scope.minDate = new Date('2016-12-17');
		$scope.maxDate = new Date('2017-04-17');
		$scope.searchResort = searchResort;
		$scope.querySearch = querySearch;

		function searchResort(){
			var path = '/'+ $scope.countrySelected +'/resort/'+ $scope.resortSelected + '/'+ getLastSaturdayString($scope.dateStart);
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

		function querySearch (query) {
      var results = query ? $scope.resorts.filter( createFilterFor(query) ) : $scope.resorts;
      var deferred;
      if (self.simulateQuery) {
        deferred = $q.defer();
        $timeout(function () { deferred.resolve( results ); }, Math.random() * 1000, false);
        return deferred.promise;
      } else {
        return results;
      }
    }

    function createFilterFor(query) {
      var lowercaseQuery = angular.lowercase(query);

      return function filterFn(state) {
        return (state.value.indexOf(lowercaseQuery) === 0);
      };

    }
	}
})();