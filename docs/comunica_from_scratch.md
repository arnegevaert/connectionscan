# Creating a comunica project from scratch

## Minimal package.json
minimal dependencies are:
```json
"dependencies": {
    "@comunica/bus-init": "^1.0.0",
    "@comunica/core": "^1.0.0",
    "@comunica/runner": "^1.0.0",
    "@comunica/runner-cli": "^1.0.0",
}
```
`package.json` must also contain `lsd:module`, `lsd:components`, and `lsd:contexts`,
for the module url, `components.jsonld` file and `context.jsonld` files.
Lastly, `package.json` requires a `main` property pointing to the `index.js` file.

Example of a minimal `package.json`:
```json
{
  "name": "@comunica/actor-init-hello-world",
  "version": "1.0.0",
  "description": "A Hello World Comunica engine",
  "lsd:module": "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-init-hello-world",
  "lsd:components": "components/components.jsonld",
  "lsd:contexts": {
    "https://linkedsoftwaredependencies.org/contexts/comunica-actor-init-hello-world.jsonld": "components/context.jsonld"
  },
  "main": "index.js",
  "dependencies": {
    "@comunica/bus-init": "^1.0.0",
    "@comunica/core": "^1.0.0",
    "@comunica/runner": "^1.0.0",
    "@comunica/runner-cli": "^1.0.0",
  }
}
```

## Components folder
The folder `components` contains the components.js configuration along with context files.
Example structure:
```
components
|  context.jsonld
|  components.jsonld
-- Actor
   -- Init
      |  HelloWorld.jsonld
```

- `components.jsonld` contains the components.js configuration, see https://www.npmjs.com/package/componentsjs.
- `context.jsonld` contains a global JSON-LD context. Prefixes, urls, etc defined in this file
can be used in any component JSON-LD files.
- For each javascript file in `lib`, there should be a corresponding JSON-LD file somewhere in `components`.
See components.js manual for details.

## Configuration file
To run the project, a configuration JSON-LD file is needed. Details on how to construct such a file can be found at http://comunica.readthedocs.io/en/latest/tutorials/configuration/.

## Running the project

To run the project, use the `comunica-run` file in `node_modules/.bin` and the configuration file created
in the last step.
Be sure to run the project from the project root, e.g:
```
./node_modules/.bin/comunica-run config/config-example.json
```
and not (from within the `config` folder):
```
../node_modules/.bin/comunica-run config-example.json
```