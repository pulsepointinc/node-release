# node-release #
Utilities for performing releases on git node-js projects.

A release will:
* Verify that the current project version contains a "-SNAPSHOT" suffix
* Verify that there are no uncommited changes
* Update project version to a release version (e.g. ```1.0.0-SNAPSHOT``` -> ```1.0.0```)
* Run a build
* Commit and tag project release version
* Perform any post-release tasks such as artifact/maven deployments etc.,
* Bump project version to next development interation (e.g. ```1.0.0-SNAPSHOT``` -> ```1.0.1-SNAPSHOT```)
* Push tag and new development version to git working branch

## Usage ##
A Release can be executed as part of a build script (prefered) via an API or via command line.

### Releasing via a build script ###

* Add ```node-release``` to project package.json's dependency section:
```
"node-release": "pulsepointinc/node-release#node-release-1.0.6",
```
* Include node-release in project build scripting
```
var release = require('node-release');
```
* Run a release:
```
release.perform({
    projectPath: '.',
    buildPromise: function(config){
        return new Promise(function(resolve,reject){
            var releaseVersion = config.releaseVersion;
            ... run build tasks ...
            resolve();
        });
    }
})
```

### Releasing via command line ###
* Install node-release:
```
npm install pulsepointinc/node-release#node-release-1.0.6
```
* Run node release:
```
node node_modules/node-release/Release.js -p . [--releaseVersion release version] [--devVersion next dev version] [--debug debug flag] [--build buildCmd]
```

## API ##
The release.perform function accepts an ```config``` argument that should consist of
* **projectPath**
    * required project path on file system
* **buildPromise**
    * required function that is supplied an object with a ```releaseVersion``` property and either performs a sync build or a returns a promise to perform a build
* **postReleasePromise**
    * optional function that is supplied an object with a ```releaseVersion``` property and performs post-release tasks, such as pushing artifacts to binary/maven repositories.  May return a promise.  If promise resolves to an object with a ```rollback``` property, rollback will be called on release failure.
* **releaseVersion**
    * optional release version string (automatically selected otherwise)
* **nextDevVersion** 
    * optional next dev version string (automatically selected otherwise)
* **debug**
    * optional truthy-flag that specifies whether or not to log debug messages (false by default)

## Building ##
* ```npm install```
* ```npm run jshnit```
* ```npm run test```

## Releasing ##
* ```npm run release```