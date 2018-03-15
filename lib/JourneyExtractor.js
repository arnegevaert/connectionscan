const util = require("./util");

class JourneyExtractor {
    constructor(interstopDistanceCalculator) {
        this.interstopDistanceCalculator = interstopDistanceCalculator;
        this.bestArrivalTime = Infinity;
    }

    /**
     * Extract one journey for a given amount of transfers
     */
    async extractJourney(target, entry, transfers, profile) {
        // Extract journey for amount of transfers
        let journey = {
            departureTime: entry.departureTime,
            arrivalTime: entry.arrivalTimes[transfers],
            transfers: transfers,
            legs: []
        };
        this.bestArrivalTime = entry.arrivalTimes[transfers];

        let currentEntry = entry;
        let remainingTransfers = transfers;
        while (remainingTransfers >= 0) {
            // Construct and push leg
            let enterConnection = currentEntry.enterConnections[remainingTransfers];
            let exitConnection = currentEntry.exitConnections[remainingTransfers];
            let leg = {
                enterConnection: enterConnection,
                exitConnection: exitConnection
            };
            journey.legs.push(leg);

            remainingTransfers--;
            if (remainingTransfers >= 0) {
                // Find profile entry for next leg
                // This is the entry with the earliest departure time that is later than the previous arrival time + interstop distance
                let nextProfile = profile[leg.exitConnection.arrivalStop];
                let i = nextProfile.length - 1;
                let found = false;
                // No need to check for i >= 0, journey pointers guarantee that some entry must be valid
                while (!found) {
                    let connection = nextProfile[i].enterConnections[remainingTransfers];
                    let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(leg.exitConnection.arrivalStop, connection.departureStop);
                    if (connection.departureTime >= new Date(leg.exitConnection.arrivalTime.getTime() + walkingDistance)) {
                        found = true;
                        let enterConnection = currentEntry.exitConnections[remainingTransfers + 1];
                        let exitConnection = nextProfile[i].enterConnections[remainingTransfers];
                        let interleg = {
                            enterConnection: enterConnection,
                            exitConnection: exitConnection,
                            duration: walkingDistance
                        };
                        journey.legs.push(interleg);
                        currentEntry = nextProfile[i];
                    }
                    i--;
                }
            }
        }
        // Add last interleg if necessary
        if (journey.legs[journey.legs.length - 1].exitConnection.arrivalStop !== target) {
            let lastLeg = journey.legs[journey.legs.length - 1];
            let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(lastLeg.exitConnection.arrivalStop, target);
            // TODO this is ugly but there is no real exit connection
            let interleg = {
                enterConnection: lastLeg.exitConnection,
                arrivalStop: target,
                arrivalTime: lastLeg.arrivalTime + walkingDistance,
                duration: walkingDistance
            };
            journey.legs.push(interleg);
        }
        return journey;
    }

    /**
     * Extract possible journeys from profile, with departure time equal to or greater than departureTime.
     * A leg consists of a departure "dep" and arrival "arr" of the same trip,
     * corresponds to entering the trip "dep" and leaving at "arr". Note that a leg can span multiple
     * consecutive connections.
     * An interleg consists of a departure "dep", arrival "arr" and duration "dur". This means that the
     * interstop distance between dep.stop and arr.stop is dur, and we need to get to arr.stop by arr.time,
     * when leaving at dep.time (so dur <= arr.time - dep.time). Corresponds to a footpath in the paper.
     * Data structures:
     *      journey: [leg, interleg, leg, ...}
     *      leg: {
     *          enterConnection: connection,
     *          exitConnection: connection,
     *      }
     *      interleg: {
     *          enterConnection: connection,
     *          exitConnection: connection,
     *          duration: int
     *      } TODO maybe interlegs should only contain departure and arrival stop and time.
     *        TODO Very last interleg is now broken because of this (line 66)
     */
    async extractJourneys(profile, source, target, departureTime) {
        let journeys = [];
        for (let entry of profile[source]) {
            if (entry.departureTime >= departureTime) {
                this.bestArrivalTime = Infinity;
                for (let transfers = 0; transfers < entry.arrivalTimes.length; transfers++) {
                    if (entry.arrivalTimes[transfers] < this.bestArrivalTime) {
                        let journey = await this.extractJourney(target, entry, transfers, profile);
                        journeys.push(journey);
                    }
                }
            }
        }
        return journeys;
    }
}

module.exports = JourneyExtractor;
