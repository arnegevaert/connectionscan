const AsyncIterator = require('asynciterator').AsyncIterator;
const fs = require('fs');

/**
 * The ConnectionProvider fetches data (from anywhere, in any form) and provides it in the form
 * of an AsyncIterator. This version reads the data from a simple JSON file.
 */
class JSONConnectionProvider extends AsyncIterator {
    constructor(filename) {
        super();
        this.sortedConnections = [];
        this.index = 0;
        this.extractConnections(filename);
    }

    extractConnections(filename) {
        const dataset = JSON.parse(fs.readFileSync(filename));

        dataset["@graph"].forEach(entry => {
            if (entry["@type"] === "Connection") {
                let depTime = new Date(entry.departureTime);
                depTime.setSeconds(depTime.getSeconds() + entry.departureDelay);
                let arrTime = new Date(entry.arrivalTime);
                arrTime.setSeconds(arrTime.getSeconds() + entry.arrivalDelay);
                this.sortedConnections.push({
                    dep: {time: depTime, stop: entry.departureStop},
                    arr: {time: arrTime, stop: entry.arrivalStop},
                    tripId: entry["gtfs:trip"]
                });
            }
        });

        this.sortedConnections.sort((a,b) => b.dep.time - a.dep.time);
        this.sortedConnections.push(null);
    }

    read() {
        let result = this.sortedConnections[this.index];
        this.index++;
        return result;
    }
}

module.exports = JSONConnectionProvider;