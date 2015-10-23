var assert = require('chai').assert,
    fs = require('fs-extra'),
    tmp = require('tmp'),
    q = require('q'),
    Release = require('./Release.js');
describe('Release tests', function(){


    it('performs an end-end release', function(done){
        this.timeout(1000 * 60 * 5);
        /* make a fake package.json file */
        fs.writeJsonSync(tmpDir.name+'/package.json',{
            version: '1.2.3-SNAPSHOT'
        },{spaces: 2});
        /* make some state variables */
        var buildExecuted = false;
        var postReleaseExecuted = false;
        /* run a release! */
        Release.perform({
            projectPath: tmpDir.name,
            buildPromise: function(){
                return new q.Promise(function(resolve,reject){
                    buildExecuted = true;
                    resolve();
                });
            },
            postReleasePromise: function(){
                postReleaseExecuted = true;
                return;
            }
        }).then(function(results){
            /* now perform some asserts! */
            console.log(gitlog);
            done();
        }).catch(function(error){
            done(error);
        });
    });


    var gitlog = [],tmpDir;
    beforeEach(function(){
        gitlog = [];
        tmpDir = tmp.dirSync();
        Release.git = function(commands,workingDirectory){
            gitlog.push('git '+commands.join(' '));
        }
    });
    afterEach(function(){
        if(tmpDir){
            fs.unlinkSync(tmpDir.name+'/package.json');
            tmpDir.removeCallback();
        }
    })
});