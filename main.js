const JSONConnectionProvider = require('./lib/JSONConnectionProvider');
const InfinityISDCalculator = require('./lib/InfinityISDCalculator');
const CSA = require('./lib/CSA');

/*let jsonCP = new JSONConnectionProvider('data/lc_test_data.jsonld');
let infinityISDC = new InfinityISDCalculator();
let csa = new CSA(jsonCP, infinityISDC, false);

let stop1 = "http://irail.be/stations/NMBS/008811221";
let stop2 = "http://irail.be/stations/NMBS/008811254";
let depTime = new Date("2018-02-08T08:50:00.000Z");

csa.getJourneys(stop1, stop2, depTime, 5).then(journeys => {
    console.log(JSON.stringify(journeys, null, 4));
});*/

let stop1 = "http://irail.be/stations/NMBS/008811221";
let stop2 = "http://irail.be/stations/NMBS/008811254";
let depTimeBounds = {
    lower: new Date("2018-03-01T08:00:00Z"),
    upper: new Date("2018-03-01T12:00:00Z")
};