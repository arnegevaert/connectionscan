const InfinityISDCalculator = require("./lib/ISDCalculators/InfinityISDCalculator");
const LCConnectionProvider = require("./lib/ConnectionProviders/LinkedConnections/LCConnectionProvider");
const EarliestArrivalHeuristic = require("./lib/BoundsCalculators/EarliestArrivalHeuristic");
const CSA = require("./lib/CSA");

let stop1 = "http://irail.be/stations/NMBS/008896008"; // Kortrijk
let stop2 = "http://irail.be/stations/NMBS/008812005"; // Brussel-Noord

let irailCP = new LCConnectionProvider("https://graph.irail.be/sncb/connections");
let infinityISDC = new InfinityISDCalculator(60*1000); // 1 minute transfer time
let boundsCalculator = new EarliestArrivalHeuristic("https://graph.irail.be/sncb/connections", infinityISDC);
let csa = new CSA(irailCP, infinityISDC, boundsCalculator, false);
csa.getJourneys(stop1, stop2, new Date("2018-03-01T08:00:00Z"), 5).then(journeys => {
    console.log(JSON.stringify(journeys, null, 4));
});
