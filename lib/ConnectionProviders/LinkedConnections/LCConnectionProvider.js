const AsyncIterator = require("asynciterator").AsyncIterator;
const ldfetch = require("ldfetch");
const ConnectionsStore = require("./ConnectionsStore");
const N3Util = require("n3").Util;
const UriTemplate = require("uritemplate");

/**
 * ConnectionProvider for LinkedConnections interfaces (eg IRail)
 * This provider makes the following assumptions about the interface:
 *      [base_url]?departureTime=[ISO_timestamp]: provides connections in JSON-LD format with departure time
 *                                                starting at [ISO_timestamp] and ending some time later
 */
class LCConnectionProvider extends AsyncIterator {
    constructor(baseUrl, ldfetch, config) {
        super();
        this.baseUrl = baseUrl;
        this.connections = [];
        this.store = undefined;
        this.upperBoundDate = undefined;
        this.lowerBoundDate = undefined;
        
        this.config = config;
        this.ldfetch = ldfetch;
        if (config === undefined) {
            this.config = {"backward": true};
        }
    }

    async discover(url) {
        await this.ldfetch.get(url).then(async response => {
            //the current page needs to be discoverable
            //Option 1: the lc:departureTimeQuery
            // → through a hydra:search → hydra:template
            // Need to check whether this is our building block: hydra:search → hydra:mapping → hydra:property === lc:departureTimeQuery

            //filter once all triples with these predicates
            let metaTriples = response.triples.filter(triple => {
                return triple.predicate === "http://www.w3.org/ns/hydra/core#search" ||
                    triple.predicate === "http://www.w3.org/ns/hydra/core#mapping" ||
                    triple.predicate === "http://www.w3.org/ns/hydra/core#template" ||
                    triple.predicate === "http://www.w3.org/ns/hydra/core#property" ||
                    triple.predicate === "http://www.w3.org/ns/hydra/core#variable";
            });
            let searchUriTriples = metaTriples.filter(triple => {
                return triple.predicate === "http://www.w3.org/ns/hydra/core#search" && triple.subject === response.url;
            });
            //look for all search template for the mapping
            for (let i = 0; i < searchUriTriples.length; i ++) {
                let searchUri = searchUriTriples[i].object;

                //TODO: filter on the right subject
                let template = N3Util.getLiteralValue(metaTriples.filter(triple => {
                    return triple.subject === searchUri && triple.predicate === "http://www.w3.org/ns/hydra/core#template";
                })[0].object);
                let tpl = UriTemplate.parse(template);
                let params = {};
                if (this.config.backward) {
                    params["departureTime"] = this.upperBoundDate.toISOString();
                } else {
                    params["departureTime"] = this.lowerBoundDate.toISOString();
                }
                let url = tpl.expand(params);
                await this.getPage(url);
            }
        });
    }

    async getPage(url) {
        await this.ldfetch.get(url).then(response => {
            this.store = new ConnectionsStore(response.url, response.triples);
        }, error => {
            console.error(error);
        });
    }

    async read() {
        if (this.store === undefined) {
            await this.discover(this.baseUrl);
        } else if (this.store.connections.length === 0) {
            let iri = this.store.previousPageIri;
            if (!this.config.backward) {
                iri = this.store.nextPageIri;
            }
            await this.getPage(iri);
        }
        if (this.config.backward) {
            return this.store.connections.pop();
        } else {
            return this.store.connections.shift();
        }
    }

    setUpperBound(upperBound) {
        this.upperBoundDate = upperBound;
    }

    setLowerBound(lowerBound) {
        this.lowerBoundDate = lowerBound;
    }
}

module.exports = LCConnectionProvider;
