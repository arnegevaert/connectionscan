const util = require('./util');

class CSA {
    /**
     * @param connectionProvider: Object that provides connections by descending departure time using
     *                            the AsyncIterator interface: https://github.com/RubenVerborgh/AsyncIterator
     * @param interstopDistanceCalculator: Object that calculates the (walking) distance between two stops
     *                                     (separated for modularity). Must implement:
     *                                     async getInterstopDistance(dep, arr)
     */
    constructor(connectionProvider, interstopDistanceCalculator) {
        this.connectionProvider = connectionProvider;
        this.interstopDistanceCalculator = interstopDistanceCalculator;
        this.reset();
    }

    discover(connection) {
        // TODO warnings here if connection invalid
        // Check if both stops of the connection are already known,
        // if not, initialize profile entries
        [connection.dep.stop, connection.arr.stop].forEach(stop => {
            if (this.stops.indexOf(stop) === -1) {
                this.initProfileEntry(stop);
                this.stops.push(stop);
            }
        });
        // Check if trip of the connection is already known,
        // if not, initialize profile entries
        if (this.trips.indexOf(connection.tripId) === -1) {
            this.tripTimes[connection.tripId] = Array(this.maxLegs).fill({connection: null, time:Infinity});
            this.trips.push(connection.tripId);
        }
    }

    updateTripTimes(connection, connectionMinTimes) {
        let oldTripTimes = this.tripTimes[connection.tripId];
        let newTripTimes = [];
        for (let i = 0; i < oldTripTimes.length; i++) {
            if (connectionMinTimes[i] < oldTripTimes[i].time) {
                newTripTimes.push({connection: connection, time: connectionMinTimes[i]});
            } else {
                newTripTimes.push(oldTripTimes[i]);
            }
        }
        this.tripTimes[connection.tripId] = newTripTimes;
    }

    isDominated(connection, connectionMinTimes) {
        // (c_dep_time, Tc) can only be dominated by the last entry of the profile,
        // as the profile is sorted by descending departure time
        let depProfile = this.profile[connection.dep.stop];
        let earliestProfileEntry = depProfile[depProfile.length - 1];
        let dominated = earliestProfileEntry.depTime === connection.dep.time;
        for (let i = 0; i < earliestProfileEntry.arrTimes.length; i++) {
            dominated = dominated && earliestProfileEntry.arrTimes[i] <= connectionMinTimes[i];
        }
    }

    incorporateInProfile(connection, ISD, stop, minVector) {
        let FPDepProfile = this.profile[stop]; // S[f_dep_stop]
        // S[f_dep_stop] might be undefined (open world), in that case initialize its profile entry
        if (FPDepProfile === undefined) {
            this.initProfileEntry(stop);
            FPDepProfile = this.profile[stop];
        }
        let FPDepEarliestEntry = FPDepProfile[FPDepProfile.length - 1]; // earliest dep time
        // Enter and exit connections are journey pointers
        let enterConnections = [];
        let exitConnections = [];

        // For each amount of legs
        for (let i = 0; i < this.maxLegs; i++) {
            // If the new arrival time is better, update journey pointers
            // Else, keep old journey pointers
            if (minVector[i] < FPDepEarliestEntry.arrTimes[i]) {
                enterConnections[i] = connection;
                exitConnections[i] = this.tripTimes[connection.tripId][i].connection;
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
        let depTime = connection.dep.time - ISD.dur; // Calculate c_dep_time - f_dur
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

    filterInfinity() {
        let result = [];
        this.stops.forEach(stop => {
            result[stop] = [];
            this.profile[stop].forEach(entry => {
                if (entry.depTime !== Infinity) {
                    result[stop].push(entry);
                }
            });
        });
        return result;
    }

    async calculateConnectionVector(connection) {
        // t1 <- c_arr_time + D[c_arr_stop]
        // (calculate time for getting off here and walking to the target)
        let x = connection.arr.time + await this.interstopDistanceCalculator.getInterstopDistance(connection.arr.stop, this.target);
        let walkTime = Array(this.maxLegs).fill(x);

        // t2 <- T[c_trip]
        // (calculate time for remaining seated)
        let remainTime = [];
        this.tripTimes[connection.tripId].forEach(pair => {
            remainTime.push(pair.time);
        });

        // t3 <- evaluate S[c_arr_stop] at c_arr_time
        // (calculate time for transferring)
        let transferTime = util.shiftVector(
            this.evalProfile(connection.arr.time, connection.arr.stop, this.maxLegs));

        // Tc <- min{t1,t2,t3}
        // Note: connectionMinTimes = Tc!
        return util.minVector([walkTime, remainTime, transferTime]);
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
     *          depStop: [profileEntry] (Profile entries are sorted by decreasing departure time)
     *      }
     *      tripTimes: {
     *          tripId: [{"connection": connection, "time": int}]
     *      } (Entry connection and arrival time per amount of legs)
     * Note: "Footpath" in paper = "ISD" (interstop distance) for generalization
     */
    async calculateProfile(target, maxLegs) {
        // For all stops x do S[x] <- {(Inf, (Inf, ..., Inf), (null, ..., null), (null, ..., null)}
        // For all trips x do T[x] <- ((null, Inf), ..., (null, Inf))
        // Note: this must be done online because of open-world assumption
        this.reset(target, maxLegs);

        // For connections c decreasing by c_dep_time do
        let connection = this.connectionProvider.read();
        while (connection !== null) {
            this.discover(connection); // Add stops/trip to stores if necessary
            let connectionMinTimes = await this.calculateConnectionVector(connection); // Calculate Tc
            this.updateTripTimes(connection, connectionMinTimes); // T[c_trip] <- Tc (+journey pointers for T)

            // Calculate if (c_dep_time, Tc) is dominated in S[c_dep_stop]
            // Note: paper says S[c_arr_stop], this is probably a mistake
            let dominated = this.isDominated(connection, connectionMinTimes);

            // if (c_dep_time, Tc) is non-dominated in S[c_dep_stop] then
            if (!dominated) {
                // minVector is component-wise minimum of Tc and the current arrival times of
                // the profile entry with earliest departure time. Used to incorporate Tc into the profile
                let depProfile = this.profile[connection.dep.stop];
                let earliestProfileEntry = depProfile[depProfile.length - 1];
                let minVector = util.minVector([connectionMinTimes, earliestProfileEntry.arrTimes]);

                // For all ISDs f with f_arr_stop = c_dep_stop
                let ISDs = await this.interstopDistanceCalculator.getInterstopDistancesForStop(connection.dep.stop);
                ISDs.forEach(ISD => {
                    // stop is f_dep_stop, the stop of the ISD that is _not_ connection.dep.stop
                    let stop = ISD.stop1;
                    if (stop === connection.dep.stop) {
                        stop = ISD.stop2;
                    }

                    // Incorporate (c_dep_time - f_dur, t_c) into profile of S[f_dep_stop]
                    this.incorporateInProfile(connection, ISD, stop, minVector);
                });
            }
            connection = this.connectionProvider.read();
        }

        // Filter out Infinity entries
        return this.filterInfinity();
    }

    evalProfile(depTime, depStop, maxLegs) {
        let i = this.profile[depStop].length - 1;
        while (i >= 0) {
            if (this.profile[depStop][i].depTime >= depTime) {
                return this.profile[depStop][i].arrTimes.slice(); // Return a copy of the array
            }
            i--;
        }
        return Array(maxLegs).fill(Infinity);
    }

    getInterstopDistanceCalculator() {
        return this.interstopDistanceCalculator;
    }

    initProfileEntry(stop) {
        this.profile[stop] = [{depTime: Infinity, arrTimes: Array(this.maxLegs).fill(Infinity),
            enterConnections: Array(this.maxLegs).fill(null),
            exitConnections: Array(this.maxLegs).fill(null)}];
    }

    reset(target, maxLegs) {
        this.stops = [];
        this.trips = [];
        this.profile = {};
        this.tripTimes = {};
        this.maxLegs = maxLegs;
        this.target = target;
    }
}

module.exports = CSA;