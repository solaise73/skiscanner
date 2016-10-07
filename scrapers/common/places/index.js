var firebase          = require("firebase");
var geoFire           = require("geofire");
var slug              = require("slug");
var q                 = require('q');
var resortNameMaps    = require('./namemaps.json')
var cache             = require('Simple-Cache').SimpleCache("tmp/geo", console.log);
var googleMapsClient  = require('@google/maps').createClient({
  key: 'AIzaSyDPa5o14HjfownTIREGy_KZYq6Ns7y-qxA'
});

// Place API textsearch
// https://maps.googleapis.com/maps/api/place/textsearch/json?key=AIzaSyDPa5o14HjfownTIREGy_KZYq6Ns7y-qxA&query=Tignes%20Val%20Claret

// Place API place details
// https://maps.googleapis.com/maps/api/place/details/json?key=AIzaSyDPa5o14HjfownTIREGy_KZYq6Ns7y-qxA&&placeid=ChIJSTxBjrF0iUcRPgmyj8Z0quA

// Geocode reuqest
// https://maps.googleapis.com/maps/api/geocode/json?key=AIzaSyDPa5o14HjfownTIREGy_KZYq6Ns7y-qxA&address=arc+1950,france&components=locality


module.exports = {
  findShop: findShop,
  geoCodeResort: geoCodeResort
}

function findShop(paramsIn){
  var params = JSON.parse(JSON.stringify(paramsIn));
	var defer = q.defer();
  var shopName = params.them.shop_name;
  var supplier = params.them.supplier;
  var resortId = params.us.resort_id;
  var countryId = params.us.country_id;
  var supplierResortName = params.them.resort_name;
  var supplierShopAddress = params.them.shop_address;
  var firebaseRef   = firebase.database().ref();
  var geofire       = new geoFire(firebaseRef.child('geo/shops'));

  var queryElements = [shopName]
  if (supplierShopAddress) queryElements.push(supplierShopAddress)
  if (supplierResortName) queryElements.push(supplierResortName)
  if (countryId) queryElements.push(countryId)

  var query = queryElements.join(', ');

  console.log('[findShop] ', supplier, query);

  cache.get(query, function(callback) {
    console.log('[findShop] Non cache hit', query);
    googleMapsClient.places({ 
      query: query,
      type: 'store'
    }, function(err, response) {
      console.log('[findShop] New place API shop request')
      if (!err) {
        if (response.json.status == 'OK'){
          var place = response.json.results[0];
          place._name = shopName;
          place._resort_id = resortId;
          place._type = 'shop';
          if (params.make_owner) place._owner = supplier
          console.log('[findShop] found', place.place_id);
          firebase.database().ref().child('shops').child(place.place_id).update(place);
          firebase.database().ref().child('shops').child(place.place_id).child('alias').child(supplier).update({
            'country_id': params.them.country_id,
            'resort_id': params.them.resort_id,
            'shop_id': params.them.shop_id,
            'shop_name': shopName,
          });
          callback(place);
        } else {
          console.log('[findShop] No geocode results for', query, response.json)
        }
      } else {
        console.log(err)
      }
    })

  }).fulfilled(function(place) {
    if (place && place.place_id && place._name){
      console.log("[findShop] Blam!, Got back a shop", place.place_id, place.name);
      // USe this here if want to make sure even cached stuff gets updated
        place._name = shopName;
        place._resort_id = resortId;
        place._type = 'shop';
        if (params.make_owner) place._owner = supplier
        firebase.database().ref().child('shops').child(place.place_id).update(place);
        firebase.database().ref().child('shops').child(place.place_id).child('alias').child(supplier).update({
          'country_id': params.them.country_id,
          'resort_id': params.them.resort_id,
          'shop_id': params.them.shop_id,
          'shop_name': shopName,
        });
        geofire.set(place.place_id, [place.geometry.location.lat, place.geometry.location.lng]);
        defer.resolve(place);
      } else {
        console.log("[findShop] Boo that doesnt look like a shop!, Got back ", place);
        defer.reject('Boo that doesnt look like a shop!')
      }
  });


  return defer.promise;
}

function geoCodeResort(params){
	var defer = q.defer();
	var countryId = params.us.country_id;
	var supplierCountryId = params.them.country_id;
	var supplierRegionId = params.them.region_id || null;
	var supplierResortId = params.them.resort_id;
	var supplierResortSlug = params.them.resort_slug || null;
	var supplierResortName = params.them.resort_name;
	var supplier = params.them.supplier;
  var params = buildQuery(params);
  var query = params.query;
  var firebaseRef   = firebase.database().ref();
  var geofire       = new geoFire(firebaseRef.child('geo/resorts'));

  console.log('geoCodeResort request', query);
	cache.get(query, function(callback) {
    console.log('geoCodeResort request1', query);
    // googleMapsClient.geocode({ address: query }, // suspect places is going to give better results that geocode eg "arc-1950, france"
    googleMapsClient.places({ query: query },
      function(err, response) {
        console.log('geoCodeResort request2', err, response.json.status);
      if (!err) {
        if (response.json.status == 'OK'){
          var place = response.json.results[0];
          console.log('New uncached API resort request', query)
  	      callback(place);
        } else if (response.json.status == 'ZERO_RESULTS'){
          console.log('No geocode results for', query)
          callback(response)
        } else {
          console.log('Geocode problem for', query, response.status)
          callback(response)
        }
      } else {
        callback(err)
        console.log('Geocode err, not caching', query, err)
      }
    })
  }).fulfilled(function(place) {
    if (!place) {
      console.log('Geocode NO result',query);
      console.log('===============');
    } else {
      // if (!place.address_components) {
      //   console.log('Geocode no address_components query:',query);
      //   console.log('Geocode result',place.json);
      //   console.log('----------------');
      // }
      place._query =  query;
      place._country_id = countryId;
      place.name = params.us.resort_name_override ? params.us.resort_name_override : place.name;
      place._name = place.name //getResortName(place.address_components) // temp for now whilst try out using PlaceAPI rather than geocoding
      console.log('==', place.place_id, query, '==', place.name);
      try {
        firebase.database().ref().child('resorts/'+place.place_id).update(place);
        firebase.database().ref().child('resorts/'+place.place_id).child('alias').child(supplier).update({
          'country_id': supplierCountryId,
          'resort_id': supplierResortId,
          'resort_name': supplierResortName,
          'resort_slug': supplierResortSlug,
          'region_id': supplierRegionId
        });
      } catch (err){
        console.log('No resort name found for', query, place)
        console.log('+++++++++++++++++');
      }
    }
    geofire.set(place.place_id, [place.geometry.location.lat, place.geometry.location.lng]);
    defer.resolve(place)
  });
	return defer.promise;
}

function getResortName(address_components){
  var use
  if (!address_components) return null;
  address_components.some(function(c){
    use = c;
    return findOne(c.types)
  })
  return use.short_name;
}

function findOne(address_components ) {
  var arr=['sublocality', 'locality', 'colloquial_area']
  return arr.some(function (v) {
      return address_components.indexOf(v) >= 0;
  });
};

function buildQuery(params) {
  var countryId = params.us.country_id;
  var supplierResortName = params.them.resort_name;
  var slugName = slug(supplierResortName, {'lower': true});
  var queryResortName
  if (resortNameMaps[slugName]){
    console.log('Have a match', slugName)
    if (typeof(resortNameMaps[slugName])=='string'){
      queryResortName = resortNameMaps[slugName];
    } else {
      queryResortName = resortNameMaps[slugName][0];
      params.us.resort_name_override = resortNameMaps[slugName][1];
    }
  } else {
    queryResortName = supplierResortName;
  }
  params.query = [queryResortName, countryId].join(',');
  return params;
}