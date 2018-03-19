class InfinityISDCalculator {
    constructor(changeTime) {
        this.changeTime = changeTime;
    }

    async getInterstopDistance(departureStop, arrivalStop) {
        if (departureStop === arrivalStop) {
            return {
                stop1: departureStop,
                stop2: arrivalStop,
                duration: this.changeTime
            };
        }
        return {
            stop1: departureStop,
            stop2: arrivalStop,
            duration: Infinity
        };
    }

    async getInterstopDistancesForStop(stop) {
        return [{stop1: stop, stop2: stop, duration: this.changeTime}];
    }
}

module.exports = InfinityISDCalculator;
