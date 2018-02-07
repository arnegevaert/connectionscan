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
        let result = Infinity;
        footpaths.forEach(fp => {
            if (fp.arr === arr) {
                result = fp.dur;
            }
        });
        return result;
    }

    shiftVector(vector) {
        // Shift vector to the right
        // Insert Infinity on left side
        let result = [Infinity];
        for (let i = 0; i < vector.length - 1; i++) {
            result.push(vector[i]);
        }
        return result;
    }

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


    // Returns profile function (for each amount of legs)
    // starting from given departure stop and departure time
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

    calculateProfile(target, maxLegs) {
        // profile contains profile function, objects sorted by descending departure time for each stop!
        let profile = {}; // {depStop: [{depTime: dt, arrTimes: [arrTime]}]}
        this.stops.forEach(stop => {
            profile[stop] = [{depTime: Infinity, arrTimes: Array(maxLegs).fill(Infinity)}];
        });
        let tripTimes = {};
        this.trips.forEach(t => {tripTimes[t.id] = Array(maxLegs).fill(Infinity)});
        this.sortedConnections.forEach(connection => {
            // Calculate time for getting off here and walking to the target
            let x = Infinity;
            if (connection.arr.stop === target) {
                x = connection.arr.time + this.getWalkingDistance(target, target);
            }
            let walkTime = Array(maxLegs).fill(x);

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
                let changeTime = this.getWalkingDistance(connection.dep.stop, connection.dep.stop);
                let depTime = connection.dep.time - changeTime;
                profile[connection.dep.stop].push({depTime: depTime, arrTimes: minVector});
            }
            tripTimes[connection.tripId] = connectionMinTimes;
        });
        return profile;
    }
}

let csa = new CSA('test.json', 10);
console.log(JSON.stringify(csa.calculateProfile("t", 5), null, 4));
