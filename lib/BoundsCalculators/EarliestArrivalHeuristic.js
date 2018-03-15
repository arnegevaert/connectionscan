class EarliestArrivalHeuristic {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
    }

    async calculateBounds(departureStop, departureTime, arrivalStop) {
        // TODO
        return {
            lower: departureTime,
            upper: new Date(departureTime + 1000*60*60*6)
        }; // This is 4 hours
    }
}

module.exports = EarliestArrivalHeuristic;