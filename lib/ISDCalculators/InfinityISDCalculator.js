class InfinityISDCalculator {
    constructor(changeTime) {
        this.changeTime = changeTime;
    }

    async getInterstopDistance(departureStop, arrivalStop) {
        if (departureStop === arrivalStop) {
            return this.changeTime;
        }
        return Infinity;
    }

    async getInterstopDistancesForStop(stop) {
        return [{stop1: stop, stop2: stop, duration: this.changeTime}];
    }
}

module.exports = InfinityISDCalculator;