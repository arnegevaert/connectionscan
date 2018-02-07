const fs = require('fs');

class CSA {
    constructor(filename, maxLegs) {
        // Initialize variables
        const dataset = JSON.parse(fs.readFileSync(filename));
        this.stops = dataset.stops;
        this.trips = dataset.trips;
        this.sortedConnections = [];
        this.footpaths = dataset.footpaths; // {dep: [{'arr': arr, 'dur': dur}]}
        this.profile = {Infinity: []}; // {dep: {depTime: [arrTime]}}
        this.maxLegs = maxLegs;

        this.profile.Infinity = [Infinity].repeat(this.maxLegs);

        // Sort all connections
        this.trips.forEach(t => {
            t.connections.forEach(c => {
                this.sortedConnections.push(c);
            })
        });
        this.sortedConnections.sort((a,b) => a.dep.time - b.dep.time);
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
        // Shift vector to the right
        // Insert Infinity on left side
    }

    calculateProfile(target) {
        this.sortedConnections.forEach(connection => {
            // Calculate time for getting off here and walking to the target
            let x = Infinity;
            if (connection.arr.stop === target) {
                x = connection.arr.time + this.getWalkingDistance(target, target);
            }
            let walkTime = [x].repeat(this.maxLegs);

            // Calculate time for remaining seated

            // Calculate time for transferring

            // Calculate min time

            // Update profile function
        })
    }
}

let csa = new CSA('test.json', 10);