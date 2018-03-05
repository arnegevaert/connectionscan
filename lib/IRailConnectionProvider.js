const AsyncIterator = require('asynciterator').AsyncIterator;

class IRailConnectionProvider extends AsyncIterator {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl;
    }

    read() {

    }
}

module.exports = IRailConnectionProvider