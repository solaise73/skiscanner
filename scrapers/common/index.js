var firebase      = require("firebase");

module.exports = {
	getLastSaturday: getLastSaturday,
  getLastSaturdayString: getLastSaturdayString,
	getLastSaturdaysTimestamp: getLastSaturdaysTimestamp,
	getTodaysTimestamp: getTodaysTimestamp,
  getTodayString: getTodayString,
  getEndDate: getEndDate
}

function getEndDate(startString, duration){
  var start = new Date(startString);
  var duration = parseInt(duration)
  var end = new Date(new Date(start).setDate(start.getDate() + duration));
  var endStamp = end.toISOString().split('T')[0];
  return endStamp;
}

function getLastSaturday(d){
  var t = new Date(d);
  t.setDate(t.getDate() - ((t.getDay()+1)%7));
  return t;
}

function getLastSaturdayString(d){
  var t = new Date(d);
  t.setDate(t.getDate() - ((t.getDay()+1)%7));
  return new Date(t).toISOString().split('T')[0];
}

function getLastSaturdaysTimestamp(d){
  var timeStamp = getLastSaturday(d).getTime();
  var tzOffSet = new Date().getTimezoneOffset() * 60 * 1000;
  timeStamp += tzOffSet;//add on the timezone offset
  return timeStamp;
}

function getTodaysTimestamp(){
	var timeStamp = Date.now();
  timeStamp -= timeStamp % (24 * 60 * 60 * 1000);//subtract amount of time since midnight
  timeStamp += new Date().getTimezoneOffset() * 60 * 1000;//add on the timezone offset
  return timeStamp;
}

function getTodayString(){
  var timeStamp = Date.now();
  // timeStamp -= timeStamp % (24 * 60 * 60 * 1000);//subtract amount of time since midnight
  // timeStamp += new Date().getTimezoneOffset() * 60 * 1000;//add on the timezone offset
  return new Date(timeStamp).toISOString().split('T')[0];;
}

function getResortSuppliers(params){
  return firebase.database().ref().child('resorts/'+params.resort_id+'/alias').once('value')
  .then(function(snap){
    return snap.val()
  })
}

