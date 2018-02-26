class InfinityISDCalculator {
    async getInterstopDistance(dep, arr) {
        if (dep === arr) {
            return 0;
        }
        return Infinity;
    }

    async getInterstopDistancesForStop(stop) {
        return [{stop1: stop, stop2: stop, dur: 0}];
    }
}

module.exports = InfinityISDCalculator;