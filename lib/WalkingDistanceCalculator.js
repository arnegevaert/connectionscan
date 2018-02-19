const fs = require('fs');

class WalkingDistanceCalculator {
    constructor(filename) {
        const dataset = JSON.parse(fs.readFileSync(filename));
        this.footpaths = dataset.footpaths;
    }

    /**
     * Get walking distance from dep to arr
     * Returns Infinity if no footpath available
     * Returns change time if dep === arr
     * @param dep: string
     * @param arr: string
     */
    async getInterstopDistance(dep, arr) {
        let result = Infinity;
        this.footpaths.forEach(fp => {
            if ((fp.stop1 === dep && fp.stop2 === arr) || (fp.stop1 === arr && fp.stop2 === dep)) {
                result = fp.dur;
            }
        });
        return result;
    }

    async getInterstopConnectionsForStop(stop) {
        let result = [];
        this.footpaths.forEach(footpath => {
            if (footpath.stop1 === stop || footpath.stop2 === stop) {
                result.push(footpath);
            }
        });
        return result;
    }
}

module.exports = WalkingDistanceCalculator;