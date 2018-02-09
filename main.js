const fs = require('fs');

// TODO journey extraction from journey pointers (note: exitConnections is always [null] right now, probable bug)
// TODO extensive testing
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
     *          "dep": [{"arr": string, "dur": int}]
     *      }
     *      trips: [{"id": string, "connections": [connection]}]
     * @param filename
     */
    constructor(filename) {
        // Read input file and extract variables
        const dataset = JSON.parse(fs.readFileSync(filename));
        this.stops = dataset.stops;
        this.trips = dataset.trips;
        this.sortedConnections = [];
        this.footpaths = dataset.footpaths;

        // Sort all connections
        this.trips.forEach(t => {
            t.connections.forEach(c => {
                c.tripId = t.id;
                this.sortedConnections.push(c);
            })
        });
        this.sortedConnections.sort((a,b) => b.dep.time - a.dep.time);
    }

    /**
     * Get walking distance from dep to arr
     * Returns Infinity if no footpath available
     * Returns change time if dep === arr
     * @param dep: string
     * @param arr: string
     */
    getWalkingDistance(dep, arr) {
        let footpaths = this.footpaths[dep];
        let result = Infinity;
        footpaths.forEach(fp => {
            if (fp.arr === arr) {
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
    calculateProfile(target, maxLegs) {
        // For all stops x do S[x] <- {(Inf, (Inf, ..., Inf), (null, ..., null), (null, ..., null)}
        let profile = {};
        this.stops.forEach(stop => {
            profile[stop] = [{depTime: Infinity, arrTimes: Array(maxLegs).fill(Infinity),
                              enterConnections: Array(maxLegs).fill(null),
                              exitConnections: Array(maxLegs).fill(null)}];
        });

        // For all trips x do T[x] <- ((null, Inf), ..., (null, Inf))
        let tripTimes = {};
        this.trips.forEach(t => {
            tripTimes[t.id] = Array(maxLegs).fill({connection: null, time:Infinity});
        });

        // For connections c decreasing by c_dep_time do
        this.sortedConnections.forEach(connection => {
            // t1 <- c_arr_time + D[c_arr_stop]
            // (calculate time for getting off here and walking to the target)
            let x = connection.arr.time + this.getWalkingDistance(connection.arr.stop, target);
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
            let earliestProfileEntry = depProfile[depProfile.length-1];
            let dominated = earliestProfileEntry.depTime === connection.dep.time;
            for (let i = 0; i < earliestProfileEntry.arrTimes.length; i++) {
                dominated = dominated && earliestProfileEntry.arrTimes[i] <= connectionMinTimes[i];
            }

            // if (c_dep_time, Tc) is non-dominated in S[c_dep_stop] then
            if (!dominated) {
                // minVector is component-wise minimum of Tc and the current arrival times of
                // the profile entry with earliest departure time. Used to "incorporate" Tc into the profile
                let minVector = this.minVector([connectionMinTimes, earliestProfileEntry.arrTimes]);
                // For all footpaths f with f_arr_stop = c_dep_stop
                this.stops.forEach(stop => {
                    this.footpaths[stop].forEach(footpath => {
                        if (footpath.arr === connection.dep.stop) {
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
                                    exitConnections[i] = tripTimes[connection.tripId][i].connection
                                } else {
                                    enterConnections[i] = FPDepEarliestEntry.enterConnections[i];
                                    exitConnections[i] = FPDepEarliestEntry.exitConnections[i];
                                }
                            }
                            // If the new departure time is equal, update the profile entry
                            // Else, insert a new entry
                            if (FPDepEarliestEntry.depTime !== depTime) {
                                FPDepProfile.push({depTime: depTime, arrTimes: minVector,
                                                    enterConnections: enterConnections,
                                                    exitConnections: exitConnections});
                            } else {
                                FPDepProfile[FPDepProfile.length - 1] = {depTime: depTime, arrTimes: minVector,
                                                                         enterConnections: enterConnections,
                                                                         exitConnections: exitConnections};
                            }
                        }
                    })
                });
            }
            // T[c_trip] <- Tc
            // Also update journey pointers for T
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
        });
        return profile;
    }
}

let csa = new CSA('test.json', 10);
let profile = csa.calculateProfile("t", 5);
console.log("Done");