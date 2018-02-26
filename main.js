const WalkingDistanceCalculator = require('./lib/WalkingDistanceCalculator');
const JourneyExtractor = require('./lib/JourneyExtractor');
const JSONConnectionProvider = require('./lib/JSONConnectionProvider');
const TestConnectionProvider = require('./lib/TestConnectionProvider');
const InfinityISDCalculator = require('./lib/InfinityISDCalculator');
const CSA = require('./lib/CSA');

let wdc = new WalkingDistanceCalculator('data/test3.json');
let testCP = new TestConnectionProvider('data/test3.json');
let enableISDCaches = false;

let testCSA = new CSA(testCP, wdc, enableISDCaches);
let testJE = new JourneyExtractor(testCSA);

/*testCSA.calculateProfile("a5", 5).then(profile => {
    testJE.extractJourneys(profile, "a1", "a5", 0).then(journeys => {
        console.log(JSON.stringify(journeys, null, 4));
        console.log(JSON.stringify(testCSA.getCacheUsageReport(), null, 4));
    });
});*/

let jsonCP = new JSONConnectionProvider('data/lc_test_data.jsonld');
let infinityISDC = new InfinityISDCalculator();
let csa = new CSA(jsonCP, infinityISDC, false);
let je = new JourneyExtractor(csa);

let kortrijk = "https://irail.be/stations/NMBS/008896008";
let gentSP = "https://irail.be/stations/NMBS/008892007";

csa.calculateProfile(kortrijk, 5).then(profile => {
    je.extractJourneys(profile, kortrijk, gentSP, new Date("2018-02-09T08:50:00.000Z")).then(journeys => {
        console.log(JSON.stringify(journeys, null, 4));
    })
});