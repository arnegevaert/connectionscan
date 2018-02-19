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
        this.sortedConnections.push(null);
        this.index = 0;
    }

    read() {
        let result = this.sortedConnections[this.index];
        this.index++;
        return result;
    }
}

module.exports = JSONConnectionProvider;