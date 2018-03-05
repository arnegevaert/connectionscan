const AsyncIterator = require('asynciterator').AsyncIterator;

class IRailConnectionProvider extends AsyncIterator {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl;
    }

    read() {

    }

    reset(depTimeBounds) {
        this.depTimeBounds = depTimeBounds;
    }
}

module.exports = IRailConnectionProvider;