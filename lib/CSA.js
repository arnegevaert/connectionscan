const util = require('./util');
const WalkingDistanceCalculator = require('./WalkingDistanceCalculator');
const JourneyExtractor = require('./JourneyExtractor');
const JSONConnectionProvider = require('./JSONConnectionProvider');

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
     * @param connectionProvider: Object that provides connections by descending departure time using
     *                            the AsyncIterator interface: https://github.com/RubenVerborgh/AsyncIterator
     * @param interstopDistanceCalculator: Object that calculates the (walking) distance between two stops
     *                                     (separated for modularity). Must implement:
     *                                     async getInterstopDistance(dep, arr)
     */
    constructor(connectionProvider, interstopDistanceCalculator) {
        this.connectionProvider = connectionProvider;
        this.interstopDistanceCalculator = interstopDistanceCalculator;
        this.stops = [];
        this.trips = [];
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
        // TODO this cannot be initialized for all stops, open world assumption
        this.stops.forEach(stop => {
            profile[stop] = [{depTime: Infinity, arrTimes: Array(maxLegs).fill(Infinity),
                              enterConnections: Array(maxLegs).fill(null),
                              exitConnections: Array(maxLegs).fill(null)}];
        });

        // For all trips x do T[x] <- ((null, Inf), ..., (null, Inf))
        let tripTimes = {};
        // TODO this cannot be initialized for all trips, open world assumption
        this.trips.forEach(t => {
            tripTimes[t] = Array(maxLegs).fill({connection: null, time:Infinity});
        });

        // For connections c decreasing by c_dep_time do
        await this.sortedConnections.forEach(async connection => {
            // t1 <- c_arr_time + D[c_arr_stop]
            // (calculate time for getting off here and walking to the target)
            let x = connection.arr.time + await this.interstopDistanceCalculator.getInterstopDistance(connection.arr.stop, target);
            let walkTime = Array(maxLegs).fill(x);

            // t2 <- T[c_trip]
            // (calculate time for remaining seated)
            let remainTime = [];
            tripTimes[connection.tripId].forEach(pair => {
                remainTime.push(pair.time);
            });

            // t3 <- evaluate S[c_arr_stop] at c_arr_time
            // (calculate time for transferring)
            let transferTime = util.shiftVector(
                this.evalProfile(profile, connection.arr.time, connection.arr.stop, maxLegs));

            // Tc <- min{t1,t2,t3}
            // Note: connectionMinTimes = Tc!
            let connectionMinTimes = util.minVector([walkTime, remainTime, transferTime]);

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
                let minVector = util.minVector([connectionMinTimes, earliestProfileEntry.arrTimes]);
                // For all footpaths f with f_arr_stop = c_dep_stop
                // TODO use getInterstopConnectionsForStop from InterstopDistanceCalculator
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
        // TODO iterate over stops in profile (not "all" stops), open world
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

    getInterstopDistanceCalculator() {
        return this.interstopDistanceCalculator;
    }
}

let wdc = new WalkingDistanceCalculator('data/test3.json');
let cp = new JSONConnectionProvider('data/test3.json');

let csa = new CSA(cp, wdc);
let je = new JourneyExtractor(csa);

csa.calculateProfile("a5", 5).then(profile => {
    je.extractJourneys(profile, "a1", "a5", 0).then(journeys => {
        console.log(JSON.stringify(journeys, null, 4));
    });
});
