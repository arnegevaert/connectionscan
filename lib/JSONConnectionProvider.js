const AsyncIterator = require('asynciterator').AsyncIterator;
const fs = require('fs');

/**
 * The ConnectionProvider fetches data (from anywhere, in any form) and provides it in the form
 * of an AsyncIterator. This version reads the data from a simple JSON file.
 */
class JSONConnectionProvider extends AsyncIterator {
    constructor(filename) {
        super();
        const dataset = JSON.parse(fs.readFileSync(filename));
        this.stops = dataset.stops;
        this.sortedConnections = dataset.connections;
        this.sortedConnections.sort((a,b) => b.dep.time - a.dep.time);
    }

    read() {
        let result = "Hello from connection provider: " + this.counter;
        this.counter++;
        if (this.counter >= 100) {
            this.readable = false;
        }
        return result;
    }
}

module.exports = JSONConnectionProvider;