const util = require("./util");

class JourneyExtractor {
    constructor(interstopDistanceCalculator) {
        this.interstopDistanceCalculator = interstopDistanceCalculator;
        this.bestArrTime = Infinity;
    }

    /**
     * Extract one journey for a given amount of transfers
     */
    async extractJourney(target, entry, transfers, profile) {
        // Extract journey for amount of transfers
        let journey = {
            depTime: entry.depTime,
            arrTime: entry.arrTimes[transfers],
            transfers: transfers,
            legs: []
        };
        this.bestArrTime = entry.arrTimes[transfers];

        let currentEntry = entry;
        let remainingTransfers = transfers;
        while (remainingTransfers >= 0) {
            // Construct and push leg
            let enterConnection = currentEntry.enterConnections[remainingTransfers];
            let exitConnection = currentEntry.exitConnections[remainingTransfers];
            let leg = {
                dep: enterConnection.dep,
                arr: exitConnection.arr,
                tripId: enterConnection.tripId
            };
            journey.legs.push(leg);

            remainingTransfers--;
            if (remainingTransfers >= 0) {
                // Find profile entry for next leg
                // This is the entry with the earliest departure time that is later than the previous arrival time + interstop distance
                let nextProfile = profile[leg.arr.stop];
                let i = nextProfile.length - 1;
                let found = false;
                // No need to check for i >= 0, journey pointers guarantee that some entry must be valid
                while (!found) {
                    let departure = nextProfile[i].enterConnections[remainingTransfers].dep;
                    let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(leg.arr.stop, departure.stop);
                    if (departure.time >= leg.arr.time + walkingDistance) {
                        found = true;
                        let interleg = {
                            dep: currentEntry.exitConnections[remainingTransfers + 1].arr,
                            arr: nextProfile[i].enterConnections[remainingTransfers].dep,
                            dur: walkingDistance
                        };
                        journey.legs.push(interleg);
                        currentEntry = nextProfile[i];
                    }
                    i--;
                }
            }
        }
        // Add last interleg if necessary
        if (journey.legs[journey.legs.length - 1].arr.stop !== target) {
            let dep = journey.legs[journey.legs.length - 1].arr;
            let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(dep.stop, target);
            let interleg = {
                dep: dep,
                arr: {stop: target, time: dep.time + walkingDistance},
                dur: walkingDistance
            };
            journey.legs.push(interleg);
        }
        return journey;
    }

    /**
     * Extract possible journeys from profile, with departure time equal to or greater than depTime.
     * A leg consists of a departure "dep" and arrival "arr" of the same trip,
     * corresponds to entering the trip "dep" and leaving at "arr". Note that a leg can span multiple
     * consecutive connections.
     * An interleg consists of a departure "dep", arrival "arr" and duration "dur". This means that the
     * interstop distance between dep.stop and arr.stop is dur, and we need to get to arr.stop by arr.time,
     * when leaving at dep.time (so dur <= arr.time - dep.time). Corresponds to a footpath in the paper.
     * Data structures:
     *      journey: [leg, interleg, leg, ...]
     *      leg: {
     *          dep: {stop: string, time: int},
     *          arr: {stop: string, time: int},
     *          tripId: string
     *      }
     *      interleg: {
     *          dep: {stop: string, time: int},
     *          arr: {stop: string, time: int},
     *          dur: int
     *      }
     */
    async extractJourneys(profile, source, target, depTime) {
        let journeys = [];
        for (let entry of profile[source]) {
            if (entry.depTime >= depTime) {
                this.bestArrTime = Infinity;
                for (let transfers = 0; transfers < entry.arrTimes.length; transfers++) {
                    if (entry.arrTimes[transfers] < this.bestArrTime) {
                        let journey = await this.extractJourney(target, entry, transfers, profile);
                        journeys.push(journey);
                    }
                }
            }
        }
        return util.cleanJourneys(journeys);
    }
}

module.exports = JourneyExtractor;
