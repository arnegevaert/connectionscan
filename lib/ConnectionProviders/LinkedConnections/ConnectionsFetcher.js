const Readable = require('stream').Readable;
const UriTemplate = require('uritemplate');
const N3Util = require('n3').Util;
const ConnectionsStore = require('./ConnectionsStore');

class ConnectionsFetcher extends Readable {
    constructor (starturl, ldfetch, departureTime) {
        super({objectMode: true});
        this._discoveryPhase = true;
        this.ldfetch = ldfetch;
        this.departureTime = departureTime;
        this.starturl = starturl;
        this.store = {};
    }

    close () {
        this.push(null);
    }

    _read () {
        if (this._discoveryPhase) {
            //Building block 1: a way to find a first page
            this.ldfetch.get(this.starturl).then(response => {
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
                    params["departureTime"] = this.departureTime.toISOString();
                    let url = tpl.expand(params);
                    this.ldfetch.get(url).then(response => {
                        this.store = new ConnectionsStore(response.url, response.triples);
                        this.push(this.store.connections.pop());
                    }, error => {
                        console.error(error);
                    });
                }
            }).catch(e => {
                console.log(e);
            });
            this._discoveryPhase = false;
        } else {
            //readConnection if still more available
            if (this.store.connections.length > 0) {
                this.push(this.store.connections.shift());
            } else {
                //fetch new page
                this.ldfetch.get(this.store.nextPageIri).then(response => {
                    this.store = new ConnectionsStore(response.url, response.triples);
                    let connection = this.store.connections.pop();
                    this.push(connection);
                }, error => {
                    this.push(null, error);
                });
            }
        }
    }
}

module.exports = ConnectionsFetcher;
