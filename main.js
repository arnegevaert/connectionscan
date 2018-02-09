const fs = require('fs');

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
     *      profileEntry:
     *      profile:
     *      tripTimes:
     * @param target
     * @param maxLegs
     * @returns {{}}
     */
    calculateProfile(target, maxLegs) {
        // profile contains profile function, objects sorted by descending departure time for each stop!
        let profile = {}; // {depStop: [{depTime: dt, arrTimes: [arrTime]}]}
        this.stops.forEach(stop => {
            profile[stop] = [{depTime: Infinity, arrTimes: Array(maxLegs).fill(Infinity),
                              enterConnections: Array(maxLegs).fill(null),
                              exitConnections: Array(maxLegs).fill(null)}];
        });
        let tripTimes = {};
        this.trips.forEach(t => {
            tripTimes[t.id] = Array(maxLegs).fill({connection: null, time:Infinity});
        });
        this.sortedConnections.forEach(connection => {
            // Calculate time for getting off here and walking to the target
            let x = connection.arr.time + this.getWalkingDistance(connection.arr.stop, target);
            let walkTime = Array(maxLegs).fill(x);

            // Calculate time for remaining seated
            let remainTime = [];
            tripTimes[connection.tripId].forEach(pair => {
                remainTime.push(pair.time);
            });

            // Calculate time for transferring
            let transferTime = this.shiftVector(
                this.evalProfile(profile, connection.arr.time, connection.arr.stop, maxLegs));

            // Calculate min time
            let connectionMinTimes = this.minVector([walkTime, remainTime, transferTime]);

            // Update profile function
            let depProfile = profile[connection.dep.stop];
            let earliestProfileEntry = depProfile[depProfile.length-1];
            let minVector = this.minVector([connectionMinTimes, earliestProfileEntry.arrTimes]);

            // Limited walking: only update if (connection.dep.time, connectionMinTimes)
            // is non-dominated in profile[connection.dep.stop]
            let dominated = earliestProfileEntry.depTime === connection.dep.time;
            for (let i = 0; i < earliestProfileEntry.arrTimes.length; i++) {
                dominated = dominated && earliestProfileEntry.arrTimes[i] <= connectionMinTimes[i];
            }
            if (!dominated) {
                // For all footpaths f with f_arr_stop = c_dep_stop
                this.stops.forEach(stop => {
                    this.footpaths[stop].forEach(footpath => {
                        if (footpath.arr === connection.dep.stop) {
                            // Incorporate (c_dep_time - f_dur, t_c) into profile of S[f_dep_stop]
                            let depTime = connection.dep.time - footpath.dur;
                            let FPDepProfile = profile[stop];
                            let FPDepEarliestEntry = FPDepProfile[FPDepProfile.length - 1];
                            let enterConnections = FPDepEarliestEntry.enterConnections;
                            let exitConnections = FPDepEarliestEntry.exitConnections;
                            for (let i = 0; i < enterConnections.length; i++) {
                                if (minVector[i] < FPDepEarliestEntry.arrTimes[i]) {
                                    enterConnections[i] = connection;
                                    exitConnections[i] = tripTimes[connection.tripId][i].connection
                                }
                            }
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
console.log(JSON.stringify(csa.calculateProfile("t", 5), null, 4));
