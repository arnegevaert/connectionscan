/**
 * Shift a number vector to the right,
 * inserting Infinity on the left side and discarding
 * the last number on the right side
 * @param vector: [int]
 */
function shiftVector(vector) {
    // Shift vector to the right
    // Insert Infinity on left side
    let result = [Infinity];
    for (let i = 0; i < vector.length - 1; i++) {
        result.push(vector[i]);
    }
    return result;
}

/**
 * Calculate component-wise minimum of an array of vectors
 * eg minVector([[3,8,9],[4,4,4],[5,5,1]]) = [3,4,1]
 * @param vectors: [[int]]
 * @returns {Array}
 */
function minVector(vectors) {
    // Calculate component-wise minimum of vectors (array)
    let result = [];
    for (let i = 0; i < vectors[0].length; i++) {
        let components = [];
        vectors.forEach(v => components.push(v[i]));
        result.push(Math.min(...components));
    }
    return result;
}

function filterInfinity(stops, profile) {
    let result = {};
    stops.forEach(stop => {
        result[stop] = [];
        profile[stop].forEach(entry => {
            if (entry.departureTime !== Infinity) {
                result[stop].push(entry);
            }
        });
    });
    return result;
}

function evalProfile(profile, departureTime, departureStop, maxLegs) {
    let i = profile[departureStop].length - 1;
    while (i >= 0) {
        if (profile[departureStop][i].departureTime >= departureTime) {
            return profile[departureStop][i].arrivalTimes.slice(); // Return a copy of the array
        }
        i--;
    }
    return Array(maxLegs).fill(Infinity);
}

function cleanJourneys(journeys) {
    let result = [];
    journeys.forEach(j => {
        let legs = [];
        j.legs.forEach(l => {
            legs.push({
                departureTime: new Date(l.departureTime),
                departureStop: l.departureStop,
                arrivalTime: new Date(l.arrivalTime),
                arrivalStop: l.arrivalStop,
                "gtfs:trip": l["gtfs:trip"],
                duration: l.duration
            })
        });
        let journey = {
            "departureTime": new Date(j.departureTime),
            "arrivalTime": new Date(j.arrivalTime),
            "legs": legs
        };
        result.push(journey);
    });
    return result;
}

module.exports = {
    shiftVector: shiftVector,
    minVector: minVector,
    filterInfinity: filterInfinity,
    evalProfile: evalProfile,
    cleanJourneys: cleanJourneys
};