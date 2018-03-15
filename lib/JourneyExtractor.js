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
                departureTime: enterConnection.departureTime,
                arrivalTime: exitConnection.arrivalTime,
                departureStop: enterConnection.departureStop,
                arrivalStop: exitConnection.arrivalStop,
                "gtfs:trip": enterConnection["gtfs:trip"]
            };
            journey.legs.push(leg);

            remainingTransfers--;
            if (remainingTransfers >= 0) {
                // Find profile entry for next leg
                // This is the entry with the earliest departure time that is later than the previous arrival time + interstop distance
                let nextProfile = profile[leg.arrivalStop];
                let i = nextProfile.length - 1;
                let found = false;
                // No need to check for i >= 0, journey pointers guarantee that some entry must be valid
                while (!found) {
                    let connection = nextProfile[i].enterConnections[remainingTransfers];
                    let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(leg.arrivalStop, connection.departureStop);
                    if (connection.departureTime >= new Date(leg.arrivalTime + walkingDistance)) {
                        found = true;
                        let departureConnection = currentEntry.exitConnections[remainingTransfers + 1];
                        let arrivalConnection = nextProfile[i].enterConnections[remainingTransfers];
                        let interleg = {
                            departureTime: departureConnection.arrivalTime,
                            departureStop: departureConnection.arrivalStop,
                            arrivalTime: arrivalConnection.departureTime,
                            arrivalStop: arrivalConnection.departureStop,
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
        if (journey.legs[journey.legs.length - 1].arrivalStop !== target) {
            let lastLeg = journey.legs[journey.legs.length - 1];
            let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(lastLeg.arrivalStop, target);
            let interleg = {
                departureStop: lastLeg.arrivalStop,
                departureTime: lastLeg.arrivalTime,
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
     *          departureStop: string,
     *          departureTime: int,
     *          arrivalStop: string,
     *          arrivalTime: int,
     *          gtfs:trip: string
     *      }
     *      interleg: {
     *          departureStop: string,
     *          departureTime: int,
     *          arrivalStop: string,
     *          arrivalTime: int,
     *          duration: int
     *      }
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
