const AsyncIterator = require("asynciterator").AsyncIterator;
const ldfetch = require("ldfetch");
const ConnectionsStore = require("./ConnectionsStore");
const N3Util = require("n3").Util;
const UriTemplate = require("uritemplate");

const buildingBlocks = {
    "hydra:previous": "http://www.w3.org/ns/hydra/core#previous",
    "rdf:type": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
    "lc:Connection": "http://semweb.mmlab.be/ns/linkedconnections#Connection",
    "lc:departureStop": "http://semweb.mmlab.be/ns/linkedconnections#departureStop",
    "lc:arrivalStop": "http://semweb.mmlab.be/ns/linkedconnections#arrivalStop",
    "lc:departureTime": "http://semweb.mmlab.be/ns/linkedconnections#departureTime",
    "lc:arrivalTime": "http://semweb.mmlab.be/ns/linkedconnections#arrivalTime",
    "gtfs:trip": "http://vocab.gtfs.org/terms#trip"
};

/**
 * ConnectionProvider for LinkedConnections interfaces (eg IRail)
 * This provider makes the following assumptions about the interface:
 *      [base_url]?departureTime=[ISO_timestamp]: provides connections in JSON-LD format with departure time
 *                                                starting at [ISO_timestamp] and ending some time later
 */
class LCConnectionProvider extends AsyncIterator {
    constructor(baseUrl) {
        super();
        this.baseUrl = baseUrl;
        this.connections = [];
        this.store = undefined;
        this.upperBoundDate = undefined;
    }

    async discover(url) {
        await new ldfetch().get(url).then(async response => {
            //the current page needs to be discoverable
            //Option 1: the lc:departureTimeQuery
            // → through a hydra:search → hydra:template
            // Need to check whether this is our building block: hydra:search → hydra:mapping → hydra:property === lc:departureTimeQuery

            //filter once all triples with these predicates
            let metaTriples = response.triples.filter(triple => {
                return triple.predicate === 'http://www.w3.org/ns/hydra/core#search' ||
                    triple.predicate === 'http://www.w3.org/ns/hydra/core#mapping' ||
                    triple.predicate === 'http://www.w3.org/ns/hydra/core#template' ||
                    triple.predicate === 'http://www.w3.org/ns/hydra/core#property' ||
                    triple.predicate === 'http://www.w3.org/ns/hydra/core#variable';
            });
            let searchUriTriples = metaTriples.filter(triple => {
                return triple.predicate === 'http://www.w3.org/ns/hydra/core#search' && triple.subject === response.url;
            });
            //look for all search template for the mapping
            for (let i = 0; i < searchUriTriples.length; i ++) {
                let searchUri = searchUriTriples[i].object;

                //TODO: filter on the right subject
                let template = N3Util.getLiteralValue(metaTriples.filter(triple => {
                    return triple.subject === searchUri && triple.predicate === 'http://www.w3.org/ns/hydra/core#template';
                })[0].object);
                let tpl = UriTemplate.parse(template);
                let params = {};
                params["departureTime"] = this.upperBoundDate.toISOString();
                let url = tpl.expand(params);
                await this.getPage(url);
            }
        })
    }

    async getPage(url) {
        await new ldfetch().get(url).then(response => {
            this.store = new ConnectionsStore(response.url, response.triples);
        }, error => {
            console.error(error);
        });
    }

    async read() {
        if (this.store === undefined) {
            await this.discover(this.baseUrl);
        } else if (this.store.connections.length === 0) {
            await this.getPage(this.store.previousPageIri);
        }
        return this.store.connections.pop();
    }

    reset(departureTimeBounds) {
        this.upperBoundDate = new Date(departureTimeBounds.upper);
    }
}

module.exports = LCConnectionProvider;
