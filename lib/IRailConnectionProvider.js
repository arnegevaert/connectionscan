const AsyncIterator = require('asynciterator').AsyncIterator;

/**
 * ConnectionProvider for LinkedConnections interfaces (eg IRail)
 * This provider makes the following assumptions about the interface:
 *      [base_url]?departureTime=[ISO_timestamp]: provides connections in JSON-LD format with departure time
 *                                                starting at [ISO_timestamp] and ending some time later
 */
class IRailConnectionProvider extends AsyncIterator {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl;
        this.currentUrl = baseUrl;
    }

    read() {

    }

    reset(depTimeBounds) {
        this.depTimeBounds = depTimeBounds;
        let upperBoundISODate = new Date(depTimeBounds.upper).toISOString();
        this.currentUrl = this.baseUrl + "?departureTime=" + upperBoundISODate;
    }
}

module.exports = IRailConnectionProvider;