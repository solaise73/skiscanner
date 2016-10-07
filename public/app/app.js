'use strict';

// Declare app level module which depends on views, and components
angular.module('skiscanner', [
  'ngRoute',
  'firebase',
  'ngMaterial',
  'uiGmapgoogle-maps',
  'angular.filter',
  'skiscanner.resorts',
  'skiscanner.resort',
  'skiscanner.map'
]).
config(['$locationProvider', '$routeProvider', '$mdDateLocaleProvider', function($locationProvider, $routeProvider, $mdDateLocaleProvider) {
  $locationProvider.hashPrefix('!');

  $routeProvider.otherwise({redirectTo: '/resorts'});
  $mdDateLocaleProvider.firstDayOfWeek = 1;
  $mdDateLocaleProvider.formatDate = function(date) {
    return date ? date.toISOString().split('T')[0] : '';
  }
}])
.service('scopeService', function() {
     return {
         safeApply: function ($scope, fn) {
             var phase = $scope.$root.$$phase;
             if (phase == '$apply' || phase == '$digest') {
                 if (fn && typeof fn === 'function') {
                     fn();
                 }
             } else {
                 $scope.$apply(fn);
             }
         },
     };
})
.filter('toArray', function() {
  return function(obj) {
    if (!(obj instanceof Object)) return obj;
    var a = [];
    for (var o in obj){
      // obj[o].key=o;
      a.push(obj[o])
    }
    return a;
  }
});