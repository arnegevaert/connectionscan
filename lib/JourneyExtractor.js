class JourneyExtractor {
    constructor(interstopDistanceCalculator) {
        this.interstopDistanceCalculator = interstopDistanceCalculator;
    }

    /**
     * Extract possible journeys from profile, with departure time equal to or greater than depTime.
     * Data structures:
     *      journey: [leg, footpath, leg, ...]
     *      leg: {
     *          dep: {stop: string, time: int},
     *          arr: {stop: string, time: int},
     *          tripId: string
     *      }
     *      footpath: {
     *          dep: {stop: string, time: int},
     *          arr: {stop: string, time: int},
     *          dur: int
     *      }
     * @param profile: profile (see above calculateProfile)
     * @param source: string
     * @param target: string
     * @param depTime: int
     */
    async extractJourneys(profile, source, target, depTime) {
        let journeys = [];
        await profile[source].forEach(async entry => {
            if (entry.depTime >= depTime) {
                let bestArrTime = Infinity;
                for (let transfers = 0; transfers < entry.arrTimes.length; transfers++) {
                    if (entry.arrTimes[transfers] < bestArrTime) {
                        // Extract journey for amount of transfers
                        let journey = {
                            depTime: entry.depTime,
                            arrTime: entry.arrTimes[transfers],
                            transfers: transfers,
                            legs: []
                        };
                        bestArrTime = entry.arrTimes[transfers];

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
                                let nextProfile = profile[leg.arr.stop];
                                let i = nextProfile.length - 1;
                                let found = false;
                                while (i >= 0 && !found) {
                                    let departure = nextProfile[i].enterConnections[remainingTransfers].dep;
                                    let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(leg.arr.stop, departure.stop);
                                    if (departure.time >= leg.arr.time + walkingDistance) {
                                        found = true;
                                        let footpath = {
                                            dep: currentEntry.exitConnections[remainingTransfers + 1].arr,
                                            arr: nextProfile[i].enterConnections[remainingTransfers].dep,
                                            dur: walkingDistance
                                        };
                                        journey.legs.push(footpath);
                                        currentEntry = nextProfile[i];
                                    }
                                    i--;
                                }
                            }
                        }
                        // Add last footpath if necessary
                        if (journey.legs[journey.legs.length - 1].arr.stop !== target) {
                            let dep = journey.legs[journey.legs.length - 1].arr;
                            let walkingDistance = await this.interstopDistanceCalculator.getInterstopDistance(dep.stop, target);
                            let footpath = {
                                dep: dep,
                                arr: {stop: target, time: dep.time + walkingDistance},
                                dur: walkingDistance
                            };
                            journey.legs.push(footpath);
                        }
                        journeys.push(journey);
                    }
                }
            }
        });
        return journeys;
    }
}

module.exports = JourneyExtractor;