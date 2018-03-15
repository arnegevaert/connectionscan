const InfinityISDCalculator = require("./lib/InfinityISDCalculator");
const IRailConnectionProvider = require("./lib/IRailConnectionProvider");
const CSA = require("./lib/CSA");

let stop1 = "http://irail.be/stations/NMBS/008896008"; // Kortrijk
let stop2 = "http://irail.be/stations/NMBS/008812005"; // Brussel-Noord
let depTimeBounds = {
    lower: new Date("2018-03-01T08:00:00Z"),
    upper: new Date("2018-03-01T10:00:00Z")
};
let irailCP = new IRailConnectionProvider("https://graph.irail.be/sncb/connections");
let infinityISDC = new InfinityISDCalculator(60*1000); // 1 minute transfer time
let csa = new CSA(irailCP, infinityISDC, false);
csa.getJourneys(stop1, stop2, depTimeBounds, 5).then(journeys => {
    console.log(JSON.stringify(journeys, null, 4));
});
