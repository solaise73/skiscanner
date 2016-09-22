(function() {
'use strict';

angular
	.module('skiscanner.resort', ['ngRoute'])
	.controller('ResortCtrl', ResortCtrl)
	.config(['$routeProvider', function($routeProvider) {
	  $routeProvider.when('/:countryId/resort/:resortId/:datestamp', {
	    templateUrl: 'resort/resort.html?x=1',
	    controller: 'ResortCtrl'
	  });
	}])

	ResortCtrl.$inject = ['$scope', '$firebaseObject', '$firebaseArray', '$q', '$routeParams', 'scopeService', '$http', '$mdDialog'];

	function ResortCtrl ($scope, $firebaseObject, $firebaseArray, $q, $routeParams, scopeService, $http, $mdDialog) {
		var rootRef = firebase.database().ref();
		var resortRef = rootRef.child('resort');
		var countryId = $routeParams.countryId;
		var resortId = $routeParams.resortId;
		var dateStamp = $routeParams.datestamp;
		var dateStart = new Date(dateStamp);
		var todayString = getTodayString();
		var lastSaturdayString = getLastSaturdayString(dateStamp);

		$scope.days = 6
		$scope.shops = [];
		$scope.resortId = resortId;
		$scope.catIdFilter = 'S';
		$scope.dateStamp = dateStamp;
		$scope.dateStart = dateStart;
		$scope.supplierLoaded = supplierLoaded;
		$scope.cheapestSupplier = cheapestSupplier;
		$scope.showSuppliers = showSuppliers;
		$scope.keys = Object.keys

		compareResort($routeParams.resortId, lastSaturdayString, todayString, 6, 'S');

		$scope.$watch('dateStart', function(s){
			// var start=new Date(s)
			// var timestamp = getLastSaturdayString(start);
			// console.log( timestamp, new Date(timestamp))
			// compareResort($routeParams.resortId, timestamp, 6, 'S');
		})

		function showSuppliers(ev, shopId, levelId) {
			console.log('#suppliers-'+ shopId)
	    $mdDialog.show({
	      controller: SupplierDialogController,
	      contentElement: '#suppliers-'+ shopId+ '-'+ levelId,
	      parent: angular.element(document.body),
	      targetEvent: ev,
	      clickOutsideToClose: true
	    });
	  };

	  function SupplierDialogController($scope, $mdDialog) {
	    $scope.hide = function() {
	      $mdDialog.hide();
	    };

	    $scope.cancel = function() {
	      $mdDialog.cancel();
	    };

	    $scope.answer = function(answer) {
	      $mdDialog.hide(answer);
	    };
	  }

		function compareResort(resortId, lastSaturdayString, todayString, days, categoryId) {

			var scrapesUrl = 'resorts/'+ resortId +'/scrapes/'+ days +'/'+ lastSaturdayString;
			var dataUrl = 'compare/'+ resortId+ '/'+ lastSaturdayString+ '/'+ days+ '/'+ todayString+ '/'+ categoryId;

			$scope.lastCheck = $firebaseArray(firebase.database().ref(scrapesUrl).limitToLast(1))

			$scope.lastCheck.$loaded().then(function(data){
				if (data.length && data[0] && data[0].$value)
				 $scope.lastCheckDate = new Date(data[0].$value);
			})

			$scope.equipment = $firebaseObject(firebase.database().ref('equipment'));
			$scope.category = $firebaseObject(firebase.database().ref(dataUrl));
			$scope.suppliers = $firebaseObject(firebase.database().ref('resorts').child(resortId).child('alias'));
			$scope.companies = $firebaseObject(firebase.database().ref('companies'));
			$scope.shops = $firebaseObject(firebase.database().ref('shops').orderByChild('resort_id').startAt(resortId).endAt(resortId));


			$scope.category.$loaded().then(function(data){
				console.log('category loaded', data)
				if (!data) pingServer(countryId, resortId, lastSaturdayString);
				// why ?ss
			})
		}

		function cheapestSupplier(suppliers){
			var cheapestSupplier
			Object.keys(suppliers).forEach(function(supplierId){
				suppliers[supplierId].key = supplierId;
				if (!cheapestSupplier || parseFloat(suppliers[supplierId].price) < parseFloat(cheapestSupplier.price))
					cheapestSupplier = suppliers[supplierId]
			})
			console.log('cheapestSupplier', suppliers)
			return cheapestSupplier
		}

		function getLastSaturdayString(d){
		  var t = new Date(d);
		  t.setDate(t.getDate() - ((t.getDay()+1)%7));
		  return t.toISOString().split('T')[0];
		}

		function getTodayString(){
		  return new Date().toISOString().split('T')[0];;
		}

		function supplierLoaded(supplierId){
			$scope.suppliers.$loaded().then(function(){	
				$scope.suppliers[supplierId].finished = true;
			})
		}

		function pingServer(countryId, resortId, lastSaturdayString){
			console.log('Pinging server', countryId, resortId, lastSaturdayString)
			$http.get('http://localhost:3000/compare/'+ countryId +'/'+ resortId +'/'+ lastSaturdayString +'/6').then(function(data){
				console.log('Pinged server', data)
			})
		}
	}


})();