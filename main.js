const WalkingDistanceCalculator = require('./lib/WalkingDistanceCalculator');
const JourneyExtractor = require('./lib/JourneyExtractor');
const JSONConnectionProvider = require('./lib/JSONConnectionProvider');
const CSA = require('./lib/CSA');

let wdc = new WalkingDistanceCalculator('data/test3.json');
let cp = new JSONConnectionProvider('data/test3.json');

let csa = new CSA(cp, wdc);
let je = new JourneyExtractor(csa);

csa.calculateProfile("a5", 5).then(profile => {
    je.extractJourneys(profile, "a1", "a5", 0).then(journeys => {
        console.log(JSON.stringify(journeys, null, 4));
        console.log(JSON.stringify(csa.getCacheUsageReport(), null, 4));
    });
});