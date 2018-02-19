const fs = require('fs');

// TODO extensive testing
// TODO     invalid data? Warning
// TODO if footpath arrives *exactly* on time, the connection is not taken
// TODO data structure: https://graph.irail.be/sncb/connections?departureTime=2018-02-09T08:50:00.000Z
class CSA {
    /**
     * Data structures:
     *      connection: {
     *          "dep": {"stop": string, "time": int},
     *          "arr": {"stop": string, "time": int},
     *          "tripId": string
     *      }
     *      sortedConnections: [connection] (sorted by decreasing dep.time)
     *      footpaths: {
     *          [{"stop1": string, "stop2": string, "dur": int}]
     *      }
     * @param filename: string
     */
    constructor(filename) {
        // Read input file and extract variables
        const dataset = JSON.parse(fs.readFileSync(filename));
        this.stops = dataset.stops;
        this.footpaths = dataset.footpaths;
        this.sortedConnections = dataset.connections;
        this.sortedConnections.sort((a,b) => b.dep.time - a.dep.time);

        // TODO this is stupid and temporary: trips must be added when they are encountered (open world)
        this.trips = [];
        this.sortedConnections.forEach(c => {
            if (this.trips.indexOf(c.tripId) === -1) {
                this.trips.push(c.tripId);
            }
        })
    }

    /**
     * Get walking distance from dep to arr
     * Returns Infinity if no footpath available
     * Returns change time if dep === arr
     * @param dep: string
     * @param arr: string
     */
    // TODO make this async/await
    // TODO and bring to new class
    async getWalkingDistance(dep, arr) {
        let result = Infinity;
        this.footpaths.forEach(fp => {
            if ((fp.stop1 === dep && fp.stop2 === arr) || (fp.stop1 === arr && fp.stop2 === dep)) {
                result = fp.dur;
            }
        });
        return result;
    }

    /**
     * Shift a number vector to the right,
     * inserting Infinity on the left side and discarding
     * the last number on the right side
     * @param vector: [int]
     */
    shiftVector(vector) {
        // Shift vector to the right
        // Insert Infinity on left side
        let result = [Infinity];
        for (let i = 0; i < vector.length - 1; i++) {
            result.push(vector[i]);
        }
        return result;
    }

    /**
     * Calculate component-wise minimum of an array of vectors
     * eg minVector([[3,8,9],[4,4,4],[5,5,1]]) = [3,4,1]
     * @param vectors: [[int]]
     * @returns {Array}
     */
    minVector(vectors) {
        // Calculate component-wise minimum of vectors (array)
        let result = [];
        for (let i = 0; i < vectors[0].length; i++) {
            let components = [];
            vectors.forEach(v => components.push(v[i]));
            result.push(Math.min(...components));
        }
        return result;
    }

    /**
     * Evaluate the profile function when starting from depStop at depTime,
     * with up to maxLegs legs
     * @param profile: profile (see calculateProfile)
     * @param depTime: int
     * @param depStop: string
     * @param maxLegs: int
     */
    evalProfile(profile, depTime, depStop, maxLegs) {
        let i = profile[depStop].length - 1;
        while (i >= 0) {
            if (profile[depStop][i].depTime > depTime) {
                return profile[depStop][i].arrTimes.slice(); // Return a copy of the array
            }
            i--;
        }
        return Array(maxLegs).fill(Infinity);
    }

    /**
     * Calculate profile function with given target and maxLegs
     * Data structures:
     *      profileEntry: {
     *          "depTime": int, "arrTimes": [int],
     *          "enterConnections": [connection],
     *          "exitConnections": [connection]
     *      }
     *      profile: {
     *          depStop: [profileEntry] (Note: Profile entries are sorted by decreasing departure time)
     *      }
     *      tripTimes: {
     *          tripId: [{"connection": connection, "time": int}]
     *      } (Entry connection and arrival time per amount of legs)
     * @param target: string
     * @param maxLegs: int
     */
    async calculateProfile(target, maxLegs) {
        // For all stops x do S[x] <- {(Inf, (Inf, ..., Inf), (null, ..., null), (null, ..., null)}
        // TODO stops must be added on the fly (view as "stream", "successor" instead of big array) (https://github.com/RubenVerborgh/AsyncIterator)
        // TODO can footpaths be held in profile data structure? Eg if calculating walk distance is very expensive
        // TODO only keep trip IDs in profile structure, trips themselves in separate structure (no duplicate storage)
        // TODO see pickupType/dropOffType (check if connection stops can be added or used)
        let profile = {};
        this.stops.forEach(stop => {
            profile[stop] = [{depTime: Infinity, arrTimes: Array(maxLegs).fill(Infinity),
                              enterConnections: Array(maxLegs).fill(null),
                              exitConnections: Array(maxLegs).fill(null)}];
        });

        // For all trips x do T[x] <- ((null, Inf), ..., (null, Inf))
        let tripTimes = {};
        this.trips.forEach(t => {
            tripTimes[t] = Array(maxLegs).fill({connection: null, time:Infinity});
        });

        // For connections c decreasing by c_dep_time do
        await this.sortedConnections.forEach(async connection => {
            // t1 <- c_arr_time + D[c_arr_stop]
            // (calculate time for getting off here and walking to the target)
            let x = connection.arr.time + await this.getWalkingDistance(connection.arr.stop, target);
            let walkTime = Array(maxLegs).fill(x);

            // t2 <- T[c_trip]
            // (calculate time for remaining seated)
            let remainTime = [];
            tripTimes[connection.tripId].forEach(pair => {
                remainTime.push(pair.time);
            });

            // t3 <- evaluate S[c_arr_stop] at c_arr_time
            // (calculate time for transferring)
            let transferTime = this.shiftVector(
                this.evalProfile(profile, connection.arr.time, connection.arr.stop, maxLegs));

            // Tc <- min{t1,t2,t3}
            // Note: connectionMinTimes = Tc!
            let connectionMinTimes = this.minVector([walkTime, remainTime, transferTime]);

            // Calculate if (c_dep_time, Tc) is dominated in S[c_dep_stop]
            // Note: paper says S[c_arr_stop], this is probably a mistake
            // (c_dep_time, Tc) can only be dominated by the last entry of the profile,
            // as the profile is sorted by descending departure time
            let depProfile = profile[connection.dep.stop];
            let earliestProfileEntry = depProfile[depProfile.length - 1];
            let dominated = earliestProfileEntry.depTime === connection.dep.time;
            for (let i = 0; i < earliestProfileEntry.arrTimes.length; i++) {
                dominated = dominated && earliestProfileEntry.arrTimes[i] <= connectionMinTimes[i];
            }

            // T[c_trip] <- Tc
            // Also update journey pointers for T
            // TODO refactor to make this clear
            let oldTripTimes = tripTimes[connection.tripId];
            let newTripTimes = [];
            for (let i = 0; i < oldTripTimes.length; i++) {
                if (connectionMinTimes[i] < oldTripTimes[i].time) {
                    newTripTimes.push({connection: connection, time: connectionMinTimes[i]});
                } else {
                    newTripTimes.push(oldTripTimes[i]);
                }
            }
            tripTimes[connection.tripId] = newTripTimes;

            // if (c_dep_time, Tc) is non-dominated in S[c_dep_stop] then
            if (!dominated) {
                // minVector is component-wise minimum of Tc and the current arrival times of
                // the profile entry with earliest departure time. Used to "incorporate" Tc into the profile
                let minVector = this.minVector([connectionMinTimes, earliestProfileEntry.arrTimes]);
                // For all footpaths f with f_arr_stop = c_dep_stop
                this.footpaths.forEach(footpath => {
                    if (footpath.stop1 === connection.dep.stop || footpath.stop2 === connection.dep.stop) {
                        // stop is f_dep_stop, the stop of the footpath that is _not_ connection.dep.stop
                        let stop = footpath.stop1;
                        if (stop === connection.dep.stop) {
                            stop = footpath.stop2;
                        }
                        // Incorporate (c_dep_time - f_dur, t_c) into profile of S[f_dep_stop]
                        let depTime = connection.dep.time - footpath.dur; // Calculate c_dep_time - f_dur
                        let FPDepProfile = profile[stop]; // S[f_dep_sop]
                        let FPDepEarliestEntry = FPDepProfile[FPDepProfile.length - 1]; // earliest dep time
                        // Enter and exit connections are journey pointers
                        let enterConnections = [];
                        let exitConnections = [];

                        // For each amount of legs
                        for (let i = 0; i < maxLegs; i++) {
                            // If the new arrival time is better, update journey pointers
                            // Else, keep old journey pointers
                            if (minVector[i] < FPDepEarliestEntry.arrTimes[i]) {
                                enterConnections[i] = connection;
                                exitConnections[i] = tripTimes[connection.tripId][i].connection;
                                if (exitConnections[i] === null) {
                                    // This means the exit connection is the enter connection,
                                    // and tripTimes[connection.tripId] hasn't been initialized properly yet.
                                    exitConnections[i] = connection;
                                }
                            } else {
                                enterConnections[i] = FPDepEarliestEntry.enterConnections[i];
                                exitConnections[i] = FPDepEarliestEntry.exitConnections[i];
                            }
                        }
                        // If the new departure time is equal, update the profile entry
                        // Else, insert a new entry
                        if (FPDepEarliestEntry.depTime !== depTime) {
                            FPDepProfile.push({
                                depTime: depTime, arrTimes: minVector,
                                enterConnections: enterConnections,
                                exitConnections: exitConnections
                            });
                        } else {
                            FPDepProfile[FPDepProfile.length - 1] = {
                                depTime: depTime, arrTimes: minVector,
                                enterConnections: enterConnections,
                                exitConnections: exitConnections
                            };
                        }
                    }
                });
            }

        });

        let result = {};
        // Filter out Infinity entries
        this.stops.forEach(stop => {
            result[stop] = [];
            profile[stop].forEach(entry => {
                if (entry.depTime !== Infinity) {
                    result[stop].push(entry);
                }
            });
        });
        return result;
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
                                    let walkingDistance = await this.getWalkingDistance(leg.arr.stop, departure.stop);
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
                            let walkingDistance = await this.getWalkingDistance(dep.stop, target);
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

let csa = new CSA('test3.json');
csa.calculateProfile("a5", 5).then(profile => {
    csa.extractJourneys(profile, "a1", "a5", 0).then(journeys => {
        console.log(JSON.stringify(journeys, null, 4));
    });
});
