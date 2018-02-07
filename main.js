const fs = require('fs');

class CSA {
    constructor(filename) {
        const dataset = JSON.parse(fs.readFileSync(filename));
        this.stops = dataset.stops;
        this.connections = dataset.connections;
        this.footpaths = dataset.footpaths; // {dep: [{'arr': arr, 'dur': dur}]}
        this.profile = {}; // {dep: {depTime: [arrTime]}}
        
    }

    
}
