(function() {
'use strict';

angular
	.module('skiscanner.resort', ['ngRoute'])
	.controller('ResortCtrl', ResortCtrl)
	// .controller('LevelCtrl', LevelCtrl)
	// .controller('ShopLevelCtrl', ShopLevelCtrl)
	.controller('ShopCtrl', ShopCtrl)
	.config(['$routeProvider', function($routeProvider) {
	  $routeProvider.when('/:countryId/resort/:resortId/:datestamp', {
	    templateUrl: 'resort/resort.html?x=1',
	    controller: 'ResortCtrl'
	  });
	}])

	ResortCtrl.$inject = ['$scope', '$firebaseObject', '$firebaseArray', '$q', '$routeParams', 'scopeService', '$http', '$mdDialog', '$timeout'];


	// function LevelCtrl ($scope) {
	// 	$scope.$watch('level.shops', function(shops){
	// 		var full_prices_range = [];
	// 		Object.keys(shops).forEach(function(shopId){
	// 			var shop = shops[shopId];
	// 			Object.keys(shop.suppliers).forEach(function(supplierId){
	// 				var supplier = shop.suppliers[supplierId];
	// 				full_prices_range.push(parseFloat(supplier.full_price));
	// 			})
	// 		})
	// 		$scope.full_prices_min = Math.min(...full_prices_range);
	// 		$scope.full_prices_max = Math.max(...full_prices_range);
	// 	})
	// }

	// function ShopLevelCtrl ($scope) {
	// 	$scope.$watch('shop.suppliers', function(suppliers){
	// 		$scope.cheapest = {"price": 100000}
	// 		Object.keys(suppliers).forEach(function(supplierId){
	// 			var supplier = suppliers[supplierId];
	// 			$scope.cheapest = parseFloat(supplier.price) < parseFloat($scope.cheapest.price) ? supplier : $scope.cheapest
	// 		})
	// 	})
	// }

	function ShopCtrl ($scope) {
		$scope.$watch('shop.suppliers', function(){
			setCheapestSupplier($scope.shop, $scope.catId, $scope.levelId)
		})
		$scope.$watch('levelId', function(){setCheapestSupplier($scope.shop, $scope.catId, $scope.levelId)})
		// setCheapestSupplier($scope.shop, $scope.catId, $scope.levelId)
	}

	function ResortCtrl ($scope, $firebaseObject, $firebaseArray, $q, $routeParams, scopeService, $http, $mdDialog, $timeout) {
		var rootRef = firebase.database().ref();
		var resortRef = rootRef.child('resort');
		var countryId = $routeParams.countryId;
		var resortId = $routeParams.resortId;
		var dateStamp = $routeParams.datestamp;
		var dateStart = new Date(dateStamp);
		var todayString = getTodayString();
		var lastSaturdayString = getLastSaturdayString(dateStamp);

		$scope.loading = true;
		$scope.days = 6
		$scope.shops = [];
		$scope.resortId = resortId;
		$scope.dateStamp = dateStamp;
		$scope.dateStart = dateStart;
		$scope.supplierLoaded = supplierLoaded;
		$scope.showSuppliers = showSuppliers;
		$scope.showFilters = showFilters;
		$scope.sortShopsByPrice = sortShopsByPrice;
		$scope.sortSuppliersByPrice = sortSuppliersByPrice;
		$scope.keys = Object.keys;
		$scope.map = { center: { latitude: 1, longitude: 2 }, zoom: 8 };

		$scope.catId = 'S';
		$scope.levelId = 'L1';


		compareResort($routeParams.resortId, lastSaturdayString, todayString, 6, 'S');

		// $scope.$watch('levelId', function(){
		// 	$scope.shopsForLevel = setShopsForLevel($scope.shopWithPrices, $scope.catId, $scope.levelId)
		// })

		function sortShopsByPrice(shop){
			if (shop.cheapestSupplier && shop.cheapestSupplier[$scope.catId][$scope.levelId]) {
				return parseFloat(shop.cheapestSupplier[$scope.catId][$scope.levelId].price)
			} else {
				return 99999
			}
		}
		function sortSuppliersByPrice(supplier){
			if (supplier[$scope.catId][$scope.levelId]) {
				return parseFloat(supplier[$scope.catId][$scope.levelId].price)
			} else {
				return 99999
			}
		}

	  function showFilters(ev) {
	    $mdDialog.show({
	      controller: FilterDialogController,
	      contentElement: '#filters',
	      parent: angular.element(document.body),
	      targetEvent: ev,
	      clickOutsideToClose: true,
	      bindToController: true,
	      escapeToClose: true
	    });
	  };

	  function FilterDialogController($scope, $mdDialog) {
	    $scope.close = function() {
	      $mdDialog.hide();
	    };

	    $scope.cancel = function() {
	      $mdDialog.cancel();
	    };

	    $scope.answer = function(answer) {
	      $mdDialog.hide(answer);
	    };
	  }

		function showSuppliers(ev, shopId) {
			console.log('#suppliers-'+ shopId)
	    $mdDialog.show({
	      controller: SupplierDialogController,
	      contentElement: '#suppliers-'+ shopId,
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
			var shopDataUrl = 'compare/'+ resortId+ '/'+ lastSaturdayString+ '/'+ days+ '/'+ todayString+ '/shops';

			$scope.lastCheck = $firebaseArray(firebase.database().ref(scrapesUrl).limitToLast(1))

			$scope.lastCheck.$loaded().then(function(data){
				if (data.length && data[0] && data[0].$value)
				 $scope.lastCheckDate = new Date(data[0].$value);
			})

			$scope.equipment = $firebaseObject(firebase.database().ref('equipment'));
			$scope.category = $firebaseObject(firebase.database().ref(dataUrl));
			$scope.websites = $firebaseObject(firebase.database().ref('websites'));
			$scope.resort = $firebaseObject(firebase.database().ref('resorts').child(resortId));
			$scope.shops = $firebaseObject(firebase.database().ref('shops').orderByChild('_resort_id').startAt(resortId).endAt(resortId));
			$scope.shopWithPrices = $firebaseArray(firebase.database().ref(shopDataUrl));
			$scope.shopsForLevel = $firebaseArray(firebase.database().ref(shopDataUrl));

			$scope.category.$loaded().then(function(data){
				console.log('category loaded', data)
				if (data.$value === null || true) { ///<------ always ping for now!
					pingServer(countryId, resortId, lastSaturdayString);
				} else {
					console.log('Not pinging server')
				}
				$scope.loading = false;

			})

			var setFailed = function(){
				if ($scope.websites){
					$scope.websites.forEach(function(website){
						website.failed = website.finished ? null : true;
					})
				} else {
					$timeout(setFailed, 10000);
				}
			}

			$timeout(setFailed, 10000)
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
			$scope.websites.$loaded().then(function(){	
				$scope.websites[supplierId].finished = true;
			})
		}

		function pingServer(countryId, resortId, lastSaturdayString){
			console.log('Pinging server', countryId, resortId, lastSaturdayString)
			// var server = 'https://snowmodo.appspot.com';
			var server = 'http://localhost:8080';
			$http.get(server +'/compare/'+ countryId +'/'+ resortId +'/'+ lastSaturdayString +'/6').then(function(data){
				console.log('Pinged server', data)
			})
		}
	}

	function setCheapestSupplier(shop, catId, levelId){
		delete shop.cheapestSupplier;
		setSuppliersForLevel(shop, catId, levelId);
		shop.suppliersForLevel.forEach(function(supplier){
			if (!shop.cheapestSupplier) shop.cheapestSupplier = supplier // set the first for now
			if (parseFloat(supplier[catId][levelId].price) < parseFloat(shop.cheapestSupplier[catId][levelId].price)){
				shop.cheapestSupplier = supplier
			}
		})
		console.log("The cheapestSupplier for", shop.$id,"is", shop.cheapestSupplier?shop.cheapestSupplier.key:'none', catId, levelId)
	}

	function setSuppliersForLevel(shop, catId, levelId){
		shop.suppliersForLevel = [];
		Object.keys(shop.suppliers).forEach(function(supplierId){
			var supplier = shop.suppliers[supplierId];
			supplier.key = supplierId;
			if (supplier[catId][levelId]) {
				shop.suppliersForLevel.push(supplier)
			}
		})
		console.log(shop.$id,"has",shop.suppliersForLevel.length, "suppliers")
	}


})();