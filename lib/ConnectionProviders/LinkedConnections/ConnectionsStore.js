let N3Util = require('n3').Util;

class ConnectionsStore {

    constructor (documentIri, triples) {
        this.documentIri = documentIri;
        this.connections = [];
        this.addTriples(triples);
    }

    addTriples (triples) {
        //Find next page
        //building block 1: every page should be a hydra:PagedCollection with a next and previous page link
        let nextPage = triples.filter(triple => {
            return triple.predicate === 'http://www.w3.org/ns/hydra/core#next' && triple.subject === this.documentIri;
        });
        let previousPage = triples.filter(triple => {
            return triple.predicate === 'http://www.w3.org/ns/hydra/core#previous' && triple.subject === this.documentIri;
        });
        this.nextPageIri = null;
        this.previousPageIri = null;
        if (nextPage[0] && nextPage[0].object.substr(0,4) === 'http') {
            this.nextPageIri = nextPage[0].object;
        }
        if (previousPage[0] && previousPage[0].object.substr(0,4) === 'http') {
            this.previousPageIri = previousPage[0].object;
        }
        //group all entities together and
        let entities = [];
        for (let i = 0; i < triples.length ; i++) {
            let triple = triples[i];
            if (!entities[triple.subject]) {
                entities[triple.subject] = {};
            }
            if (triple.predicate === "http://semweb.mmlab.be/ns/linkedconnections#departureTime") {
                triple.predicate = "departureTime";
                triple.object = new Date(N3Util.getLiteralValue(triple.object));
            }
            if (triple.predicate === "http://semweb.mmlab.be/ns/linkedconnections#departureDelay") {
                triple.predicate = "departureDelay";
                triple.object = N3Util.getLiteralValue(triple.object);
            }
            if (triple.predicate === "http://semweb.mmlab.be/ns/linkedconnections#arrivalDelay") {
                triple.predicate = "arrivalDelay";
                triple.object = N3Util.getLiteralValue(triple.object);
            }
            if (triple.predicate === "http://semweb.mmlab.be/ns/linkedconnections#arrivalTime") {
                triple.predicate = "arrivalTime";
                triple.object = new Date(N3Util.getLiteralValue(triple.object));
            }
            if (triple.predicate === "http://semweb.mmlab.be/ns/linkedconnections#departureStop") {
                triple.predicate = "departureStop";
            }

            if (triple.predicate === "http://semweb.mmlab.be/ns/linkedconnections#arrivalStop") {
                triple.predicate = "arrivalStop";
            }
            if (triple.predicate === "http://vocab.gtfs.org/terms#trip") {
                triple.predicate = "gtfs:trip";
            }

            entities[triple.subject][triple.predicate] = triple.object;
        }
        //Find all Connections
        //building block 2: every lc:Connection entity is taken from the page and processed
        let keys = Object.keys(entities);
        let connections = [];
        for (let i = 0; i < keys.length; i++) {
            if (entities[keys[i]]["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"] && entities[keys[i]]["http://www.w3.org/1999/02/22-rdf-syntax-ns#type"] === 'http://semweb.mmlab.be/ns/linkedconnections#Connection') {
                entities[keys[i]]["@id"] = keys[i];
                connections.push(entities[keys[i]]);
            }
        }
        this.connections = connections.sort( (connectionA, connectionB) => {
            return connectionA.departureTime.valueOf() - connectionB.departureTime.valueOf();
        });
    }

    getNextPageIri () {
        return this.nextPageIri;
    }

    getPreviousPageIri() {
        return this.previousPageIri;
    }

    getConnections () {
        return this.connections;
    }
}

module.exports = ConnectionsStore;
