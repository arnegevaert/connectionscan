const util = require("./util");
const JourneyExtractor = require("./JourneyExtractor");

const WARN_CONN_OUT_OF_ORDER = "WARNING: connection not provided in order (descending departure time). Discarding connection.";
const WARN_CONN_INCONSISTENT = "WARNING: invalid connection: departure time must be before arrival time. Discarding connection.";
const WARN_CACHE_NOT_ENABLED = "WARNING: ISD Caches were not enabled";

class CSA {
    /**
     * @param connectionProvider: Object that provides connections by descending departure time using
     *                            the AsyncIterator interface: https://github.com/RubenVerborgh/AsyncIterator
     * @param interstopDistanceCalculator: Object that calculates the (walking) distance between two stops
     *                                     (separated for modularity). Must implement:
     *                                     async getInterstopDistance(departureStop, arrivalStop)
     * @param enableISDCaches: if true, interstop distances will be cached. Useful if calculating ISDs is expensive
     *                         (depends on the implementation of interstopDistanceCalculator)
     */
    constructor(connectionProvider, interstopDistanceCalculator, boundsCalculator, enableISDCaches) {
        this.connectionProvider = connectionProvider;
        this.interstopDistanceCalculator = interstopDistanceCalculator;
        this.boundsCalculator = boundsCalculator;
        this.enableISDCaches = enableISDCaches;
        this.journeyExtractor = new JourneyExtractor(interstopDistanceCalculator);

        this.reset();
    }

    async getInterstopDistance(departureStop, arrivalStop) {
        if (this.enableISDCaches) {
            let found = false;
            let i = 0;
            let isd = undefined;
            while (i < this.ISDCache.length && !found) {
                let entry = this.ISDCache[i];
                if (((entry.stop1 === departureStop && entry.stop2 === arrivalStop) || (entry.stop1 === arrivalStop && entry.stop2 === departureStop))) {
                    found = true;
                    isd = entry;
                    this.ISDCalls.cached++;
                }
                i++;
            }
            if (!found) {
                isd = await this.interstopDistanceCalculator.getInterstopDistance(departureStop, arrivalStop);
                this.ISDCache.push(isd);
                this.ISDCalls.uncached++;
            }
            return isd.duration;
        }
        let isd = await this.interstopDistanceCalculator.getInterstopDistance(departureStop, arrivalStop);
        return isd.duration;
    }

    async getInterstopDistancesForStop(stop) {
        if (this.enableISDCaches) {
            if (this.ISDCachePerStop[stop] === undefined) {
                this.ISDCachePerStop[stop] = await this.interstopDistanceCalculator.getInterstopDistancesForStop(stop);
                this.ISDForStopCalls.uncached++;
            } else {
                this.ISDForStopCalls.cached++;
            }
            return this.ISDCachePerStop[stop];
        }
        return await this.interstopDistanceCalculator.getInterstopDistancesForStop(stop);
    }

    discover(connection) {
        // Check for data inconsistencies
        if (connection.departureTime > this.currentDepartureTime) {
            console.warn(WARN_CONN_OUT_OF_ORDER);
            return false;
        } else if (connection.departureTime >= connection.arrivalTime) {
            console.warn(WARN_CONN_INCONSISTENT);
            return false;
        } else {
            this.currentDepartureTime = connection.departureTime;
            // Check if the stops of the connection are already known,
            // if not, initialize profile entries
            [connection.departureStop, connection.arrivalStop].forEach(stop => {
                if (this.stops.indexOf(stop) === -1) {
                    this.initProfileEntry(stop);
                    this.stops.push(stop);
                }
            });
            // Check if trip of the connection is already known,
            // if not, initialize tripStructure entry
            if (this.trips.indexOf(connection["gtfs:trip"]) === -1) {
                this.tripStructure[connection["gtfs:trip"]] = Array(this.maxLegs).fill({connection: null, time: Infinity});
                this.trips.push(connection["gtfs:trip"]);
            }
        }
        return true;
    }

    updateTripStructure(connection, connectionMinTimes) {
        let oldTripStructure = this.tripStructure[connection["gtfs:trip"]];
        let newTripStructure = [];
        for (let i = 0; i < oldTripStructure.length; i++) {
            if (connectionMinTimes[i] < oldTripStructure[i].time) {
                newTripStructure.push({connection: connection, time: connectionMinTimes[i]});
            } else {
                newTripStructure.push(oldTripStructure[i]);
            }
        }
        this.tripStructure[connection["gtfs:trip"]] = newTripStructure;
    }

    isDominated(connection, connectionMinTimes) {
        // (c_dep_time, Tc) can only be dominated by the last entry of the profile,
        // as the profile is sorted by descending departure time
        let depProfile = this.profile[connection.departureStop];
        let earliestProfileEntry = depProfile[depProfile.length - 1];
        let dominated = true;
        for (let i = 0; i < earliestProfileEntry.arrivalTimes.length; i++) {
            dominated = dominated && earliestProfileEntry.arrivalTimes[i] <= connectionMinTimes[i];
        }
    }

    incorporateInProfile(connection, ISD, stop, minVector) {
        let ISDDepProfile = this.profile[stop]; // S[f_dep_stop]
        // S[f_dep_stop] might be undefined (open world), in that case initialize its profile entry
        if (ISDDepProfile === undefined) {
            this.initProfileEntry(stop);
            ISDDepProfile = this.profile[stop];
        }
        let ISDDepEarliestEntry = ISDDepProfile[ISDDepProfile.length - 1]; // earliest dep time
        // Enter and exit connections are journey pointers
        let enterConnections = [];
        let exitConnections = [];

        // For each amount of legs
        for (let i = 0; i < this.maxLegs; i++) {
            // If the new arrival time is better, update journey pointers
            // Else, keep old journey pointers
            if (minVector[i] < ISDDepEarliestEntry.arrivalTimes[i]) {
                enterConnections[i] = connection;
                exitConnections[i] = this.tripStructure[connection["gtfs:trip"]][i].connection;
                if (exitConnections[i] === null) {
                    // This means the exit connection is the enter connection,
                    // and tripStructure[connection.tripId] hasn't been initialized properly yet.
                    exitConnections[i] = connection;
                }
            } else {
                enterConnections[i] = ISDDepEarliestEntry.enterConnections[i];
                exitConnections[i] = ISDDepEarliestEntry.exitConnections[i];
            }
        }

        // If arrival times for all numbers of legs are equal to the earliest entry, this
        // entry is redundant
        let redundant = true;
        for (let i = 0; i < this.maxLegs; i++) {
            redundant = redundant && minVector[i] >= ISDDepEarliestEntry.arrivalTimes[i];
        }

        if (!redundant) {
            // If the new departure time is equal, update the profile entry
            // Else, insert a new entry
            let departureTime = new Date(connection.departureTime.getTime() - ISD.duration); // Calculate c_dep_time - f_dur
            let entry = {
                departureTime: departureTime, arrivalTimes: minVector,
                enterConnections: enterConnections,
                exitConnections: exitConnections
            };
            if (ISDDepEarliestEntry.departureTime !== departureTime) {
                ISDDepProfile.push(entry);
            } else {
                ISDDepProfile[ISDDepProfile.length - 1] = entry;
            }
        }
    }

    async calculateConnectionVector(connection) {
        // t1 <- c_arr_time + D[c_arr_stop]
        // (calculate time for getting off here and walking to the target)
        let dist = await this.getInterstopDistance(connection.arrivalStop, this.target);
        let x = Infinity;
        if (dist !== Infinity) {
            x = new Date(connection.arrivalTime.getTime() + dist);
        }
        let walkTime = Array(this.maxLegs).fill(x);

        // t2 <- T[c_trip]
        // (calculate time for remaining seated)
        let remainTime = [];
        this.tripStructure[connection["gtfs:trip"]].forEach(pair => {
            remainTime.push(pair.time);
        });

        // t3 <- evaluate S[c_arr_stop] at c_arr_time
        // (calculate time for transferring)
        let transferTime = util.shiftVector(
            util.evalProfile(this.profile, connection.arrivalTime, connection.arrivalStop, this.maxLegs));

        // Tc <- min{t1,t2,t3}
        // Note: connectionMinTimes = Tc!
        return util.minVector([walkTime, remainTime, transferTime]);
    }

    /**
     * Calculate profile function with given target and maxLegs
     * Data structures:
     *      profileEntry: {
     *          "departureTime": int, "arrivalTimes": [int],
     *          "enterConnections": [connection],
     *          "exitConnections": [connection]
     *      }
     *      profile: {
     *          departureStop: [profileEntry] (Profile entries are sorted by decreasing departure time)
     *      }
     *      tripStructure: {
     *          tripId: [{"connection": connection, "time": int}]
     *      } (Entry connection and arrival time per amount of legs) (tripId is the value of gtfs:trip for a connection)
     *      connection: {
     *          departureTime: int,
     *          departureStop: string,
     *          arrivalTime: int,
     *          arrivalStop: string,
     *          gtfs:trip: string
     *      }
     *
     * The profile data structure holds the profile function for every stop, along with journey pointers.
     * The meaning of an entry is as follows: if we depart at depStop at departureTime,
     * we can arrive at arrivalTimes[i] with i transfers. To take the route with i transfers,
     * we enter the train at the departure of enterConnections[i] and exit at the arrival of exitConnections[i].
     *
     * The tripStructure is a helper structure used to calculate the profile function, but is not necessary for
     * journey extraction. For every trip, it stores an array of integers and connections. The meaning of an entry
     * is as follows: entry[i].time represents the earliest possible arrival time when taking this trip,
     * using up to i transfers, departing in the earliest scanned connection of the trip. entry[i].connection is the
     * exit connection of the journey corresponding to the arrival time entry[i].time.
     *
     * Note: "Footpath" in paper = "ISD" (interstop distance) for generalization
     */
    async calculateProfile(source, target, maxLegs, minimumDepartureTime) {
        let departureTimeUpperBound = await this.boundsCalculator.calculateUpperBound(source, minimumDepartureTime, target);
        let departureTimeBounds = {
            lower: minimumDepartureTime,
            upper: departureTimeUpperBound
        };
        // For all stops x do S[x] <- {(Inf, (Inf, ..., Inf), (null, ..., null), (null, ..., null)}
        // For all trips x do T[x] <- ((null, Inf), ..., (null, Inf))
        // Note: this must be done online because of open-world assumption
        this.reset(target, maxLegs);
        this.connectionProvider.setUpperBound(departureTimeBounds.upper);

        // For connections c decreasing by c_dep_time do
        let connection = await this.connectionProvider.read();
        while (connection !== null && connection.departureTime >= departureTimeBounds.lower) {
            // Add stops/trip to stores if necessary
            // Discover returns false if data invalid
            if (this.discover(connection)) {
                let connectionMinTimes = await this.calculateConnectionVector(connection); // Calculate Tc
                this.updateTripStructure(connection, connectionMinTimes); // T[c_trip] <- Tc (+journey pointers for T)

                // Calculate if (c_dep_time, Tc) is dominated in S[c_dep_stop]
                // Note: paper says S[c_arr_stop], this is probably a mistake
                let dominated = this.isDominated(connection, connectionMinTimes);

                // if (c_dep_time, Tc) is non-dominated in S[c_dep_stop] then
                if (!dominated) {
                    // minVector is component-wise minimum of Tc and the current arrival times of
                    // the profile entry with earliest departure time. Used to incorporate Tc into the profile
                    let depProfile = this.profile[connection.departureStop];
                    let earliestProfileEntry = depProfile[depProfile.length - 1];
                    let minVector = util.minVector([connectionMinTimes, earliestProfileEntry.arrivalTimes]);

                    // For all ISDs f with f_arr_stop = c_dep_stop
                    let ISDs = await this.getInterstopDistancesForStop(connection.departureStop);
                    ISDs.forEach(ISD => {
                        // stop is f_dep_stop, the stop of the ISD that is _not_ connection.dep.stop
                        let stop = ISD.stop1;
                        if (stop === connection.departureStop) {
                            stop = ISD.stop2;
                        }

                        // Incorporate (c_dep_time - f_dur, t_c) into profile of S[f_dep_stop]
                        this.incorporateInProfile(connection, ISD, stop, minVector);
                    });
                }
            }
            connection = await this.connectionProvider.read();
        }

        this.profileMetadata = {
            target: target,
            minimumDepartureTime: minimumDepartureTime,
            maxLegs: maxLegs
        };

        // Filter out Infinity entries
        return util.filterInfinity(this.stops, this.profile);
    }

    // If recalculateProfile == false, this checks if recalculating
    // the profile function is necessary
    async getJourneys(source, target, minimumDepartureTime, maxLegs, recalculateProfile = false) {
        if (recalculateProfile || !this.checkProfileMetadata(target, minimumDepartureTime, maxLegs)) {
            await this.calculateProfile(source, target, maxLegs, minimumDepartureTime);
        }
        return await this.journeyExtractor.extractJourneys(
            util.filterInfinity(this.stops, this.profile), source, target, minimumDepartureTime);
    }

    initProfileEntry(stop) {
        this.profile[stop] = [{departureTime: Infinity, arrivalTimes: Array(this.maxLegs).fill(Infinity),
            enterConnections: Array(this.maxLegs).fill(null),
            exitConnections: Array(this.maxLegs).fill(null)}];
    }

    checkProfileMetadata(target, minimumDepartureTime, maxLegs) {
        return this.profileMetadata.target === target &&
            this.profileMetadata.minimumDepartureTime === minimumDepartureTime &&
            this.profileMetadata.maxLegs === maxLegs;
    }

    reset(target, maxLegs) {
        this.stops = [];
        this.trips = [];
        this.profile = {};
        this.profileMetadata = {};
        this.tripStructure = {};
        this.currentDepartureTime = Infinity;
        // Note: We can't guarantee that all ISDs for a given stop are present in ISDCache (some might be, some not).
        // Therefore separate caches for calls to getInterstopDistance() and getInterstopDistancesForStop() are necessary.
        this.ISDCache = [];
        this.ISDCachePerStop = {};
        // These structures can be used for cache usage analysis
        this.ISDForStopCalls = {cached: 0, uncached: 0};
        this.ISDCalls = {cached: 0, uncached: 0};
        this.maxLegs = maxLegs;
        this.target = target;
    }

    getCacheUsageReport() {
        if (!this.enableISDCaches) {
            console.warn(WARN_CACHE_NOT_ENABLED);
        }
        return {ISD: this.ISDCalls, ISDForStop: this.ISDForStopCalls};
    }
}

module.exports = CSA;
