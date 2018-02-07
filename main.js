const fs = require('fs');

class CSA {
    constructor(filename) {
        // Initialize variables
        const dataset = JSON.parse(fs.readFileSync(filename));
        this.stops = dataset.stops;
        this.trips = dataset.trips;
        this.sortedConnections = [];
        this.footpaths = dataset.footpaths; // {dep: [{'arr': arr, 'dur': dur}]}

        // Sort all connections
        this.trips.forEach(t => {
            t.connections.forEach(c => {
                c.tripId = t.id;
                this.sortedConnections.push(c);
            })
        });
        this.sortedConnections.sort((a,b) => b.dep.time - a.dep.time);
    }

    getWalkingDistance(dep, arr) {
        let footpaths = this.footpaths[dep];
        footpaths.forEach(fp => {
            if (fp.arr === arr) {
                return fp.dur;
            }
        });
        return Infinity;
    }

    shiftVector(vector) {
        // TODO
        // Shift vector to the right
        // Insert Infinity on left side
    }

    minVector(vectors) {
        // TODO
        // Calculate component-wise minimum of vectors (array)
    }

    // Returns profile function (for each amount of legs)
    // starting from given departure stop and departure time
    evalProfile(profile, depTime, depStop, maxLegs) {
        let i = 0;
        while (i < profile[depStop].length) {
            if (profile[depStop].depTime >= depTime) {
                return profile[depStop].arrTimes;
            }
            i++;
        }
        return [Infinity].repeat(maxLegs);
    }

    calculateProfile(target, maxLegs) {
        // profile contains profile function, objects sorted by departure time for each stop!
        let profile = {}; // {depStop: [{depTime: dt, arrTimes: [arrTime]}]}
        this.stops.forEach(stop => {
            profile[stop] = [];
        });
        let tripTimes = {};
        this.trips.forEach(t => {tripTimes[t.id] = [Infinity].repeat(maxLegs)});
        this.sortedConnections.forEach(connection => {
            // Calculate time for getting off here and walking to the target
            let x = Infinity;
            if (connection.arr.stop === target) {
                x = connection.arr.time + this.getWalkingDistance(target, target);
            }
            let walkTime = [x].repeat(this.maxLegs);

            // Calculate time for remaining seated
            let remainTime = tripTimes[connection.tripId];

            // Calculate time for transferring
            let transferTime = this.shiftVector(
                this.evalProfile(profile, connection.arr.time, connection.arr.stop, maxLegs));

            // Calculate min time
            let connectionMinTimes = this.minVector([walkTime, remainTime, transferTime]);

            // Update profile function
            let earliestArrival = profile[connection.dep.stop][0].arrTimes;
            let minVector = this.minVector([connectionMinTimes, earliestArrival]);
            if (minVector !== earliestArrival) {
                // TODO Add (c dep time − (c dep stop ) change , minVector) at the front of S[c dep stop ]
            }
            tripTimes[connection.tripId] = connectionMinTimes;
        })
    }


}

let csa = new CSA('test.json', 10);
csa.calculateProfile("t");
