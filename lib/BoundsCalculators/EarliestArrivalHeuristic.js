class EarliestArrivalHeuristic {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async calculateBounds(departureStop, departureTime, arrivalStop) {
        // TODO
        return {
            lower: departureTime,
            upper: new Date(departureTime.getTime() + 1000*60*60*2)
        }; // This is 2 hours
    }
}

module.exports = EarliestArrivalHeuristic;