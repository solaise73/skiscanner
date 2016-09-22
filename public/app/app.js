'use strict';

// Declare app level module which depends on views, and components
angular.module('skiscanner', [
  'ngRoute',
  'firebase',
  'ngMaterial',
  'angular.filter',
  'skiscanner.resorts',
  'skiscanner.resort'
]).
config(['$locationProvider', '$routeProvider', function($locationProvider, $routeProvider) {
  $locationProvider.hashPrefix('!');

  $routeProvider.otherwise({redirectTo: '/resorts'});
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
      obj[o].key=o;
      a.push(obj[o])
    }
    return a;
  }
});