const AsyncIterator = require('asynciterator').AsyncIterator;
const ldfetch = require('ldfetch');
const n3 = require('n3');

const buildingBlocks = {
    'hydra:previous': "http://www.w3.org/ns/hydra/core#previous",
    'rdf:type': "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    'lc:Connection': "http://semweb.mmlab.be/ns/linkedconnections#Connection",
    'lc:departureStop': "http://semweb.mmlab.be/ns/linkedconnections#departureStop",
    'lc:arrivalStop': "http://semweb.mmlab.be/ns/linkedconnections#arrivalStop",
    'lc:departureTime': "http://semweb.mmlab.be/ns/linkedconnections#departureTime",
    'lc:arrivalTime': "http://semweb.mmlab.be/ns/linkedconnections#arrivalTime",
    'gtfs:trip': "http://vocab.gtfs.org/terms#trip"
};

/**
 * ConnectionProvider for LinkedConnections interfaces (eg IRail)
 * This provider makes the following assumptions about the interface:
 *      [base_url]?departureTime=[ISO_timestamp]: provides connections in JSON-LD format with departure time
 *                                                starting at [ISO_timestamp] and ending some time later
 */
class IRailConnectionProvider extends AsyncIterator {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl;
        this.currentUrl = baseUrl;
        this.connections = [];
        this.previousLink = undefined;
        this.index = 0;
    }

    async getPage() {
        this.index = 0;
        if (this.previousLink !== undefined) {
            this.currentUrl = this.previousLink;
        }
        await new ldfetch().get(this.currentUrl).then(response => {
            response.store = new n3.Store(response.triples,{prefixes: response.prefixes});
            this.previousLink = response.store.getTriples(null,buildingBlocks["hydra:previous"])[0].object;
            let connectionIDs = response.store.getTriples(null, buildingBlocks['rdf:type'], buildingBlocks['lc:Connection']);
            let connections = [];
            connectionIDs.forEach(c => {
                let connectionTriples = new n3.Store(response.store.getTriples(c.subject));
                let departureStop = connectionTriples.getTriples(null, buildingBlocks['lc:departureStop'])[0];
                let arrivalStop = connectionTriples.getTriples(null, buildingBlocks['lc:arrivalStop'])[0];
                let departureTime = connectionTriples.getTriples(null, buildingBlocks['lc:departureTime'])[0];
                let arrivalTime = connectionTriples.getTriples(null, buildingBlocks['lc:arrivalTime'])[0];
                let gtfsTrip = connectionTriples.getTriples(null, buildingBlocks['gtfs:trip'])[0];
                if (typeof departureStop !== 'undefined' &&
                    typeof arrivalStop !== 'undefined' &&
                    typeof departureTime !== 'undefined' &&
                    typeof arrivalTime !== 'undefined') {
                    let depTime = new Date(n3.Util.getLiteralValue(departureTime.object));
                    let arrTime = new Date(n3.Util.getLiteralValue(arrivalTime.object));
                    connections.push({
                        departureTime: depTime.getTime(),
                        departureStop: departureStop.object,
                        arrivalTime: arrTime.getTime(),
                        arrivalStop: arrivalStop.object,
                        "gtfs:trip": gtfsTrip.object
                    });
                }
            });
            this.connections = connections;
            this.connections.sort((a,b) => b.departureTime - a.departureTime);
        });
    }

    async read() {
        if (this.index >= this.connections.length) {
            await this.getPage();
        }
        let result = this.connections[this.index];
        this.index++;
        return result;
    }

    reset(depTimeBounds) {
        if (depTimeBounds !== undefined) {
            this.depTimeBounds = depTimeBounds;
            let upperBoundISODate = new Date(depTimeBounds.upper).toISOString();
            this.currentUrl = this.baseUrl + "?departureTime=" + upperBoundISODate;
        }
    }
}

module.exports = IRailConnectionProvider;