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

testCSA.calculateProfile("a5", 5).then(profile => {
    testJE.extractJourneys(profile, "a1", "a5", 0).then(journeys => {
        console.log(JSON.stringify(journeys, null, 4));
        console.log(JSON.stringify(testCSA.getCacheUsageReport(), null, 4));
    });
});

/*let jsonCP = new JSONConnectionProvider('data/lc_test_data.jsonld');
let infinityISDC = new InfinityISDCalculator();
let csa = new CSA(jsonCP, infinityISDC, false);
let je = new JourneyExtractor(csa);

let kortenberg = "https://irail.be/stations/NMBS/008811254";
let leuven = "https://irail.be/stations/NMBS/008833001";
let depTime = new Date("2018-02-08T08:50:00.000Z");

csa.calculateProfile(kortenberg, 5).then(profile => {
    je.extractJourneys(profile, kortenberg, leuven, depTime).then(journeys => {
        console.log(JSON.stringify(journeys, null, 4));
    });
});*/