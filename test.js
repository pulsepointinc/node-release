var assert = require('chai').assert,
    fs = require('fs-extra'),
    tmp = require('tmp'),
    q = require('q'),
    Release = require('./Release.js');
describe('Release tests', function(){
    it('performs an end-end release', function(done){
        /* make a fake package.json file */
        fs.writeJsonSync(tmpDir.name+'/package.json',{
            name: 'test-project',
            version: '1.2.3-SNAPSHOT'
        },{spaces: 2});
        /* make some state variables */
        var buildExecuted = false;
        var suppliedBuildInfo = null;
        var postReleaseExecuted = false;
        var suppliedPostReleaseInfo = null;
        /* run a release! */
        Release.perform({
            projectPath: tmpDir.name,
            buildPromise: function(releaseInfo){
                suppliedBuildInfo = releaseInfo;
                buildExecuted = true;
            },
            postReleasePromise: function(releaseInfo){
                suppliedPostReleaseInfo = releaseInfo;
                postReleaseExecuted = true;
            }
        }).then(function(results){
            /* assert successful release */
            assert.equal(results.releaseVersion,'1.2.3');
            assert.equal(results.devVersion,'1.2.4-SNAPSHOT');
            assert.isNumber(results.releaseTime);
            /* assert git log for commits tags and push */
            assert.deepEqual(gitlog.slice(-5),[
                'git commit package.json -m [release] - releasing 1.2.3',
                'git tag -a -m [release] - 1.2.3 release test-project-1.2.3',
                'git commit package.json -m [release] - updating dev version to 1.2.4-SNAPSHOT',
                'git push origin test-project-1.2.3',
                'git push origin master']);
            /* assert dev version got updated in package.json */
            assert.equal(fs.readJsonSync(tmpDir.name+'/package.json').version,'1.2.4-SNAPSHOT');
            /* assert build was executed */
            assert.isTrue(buildExecuted);
            assert.equal('1.2.3',suppliedBuildInfo.releaseVersion);
            /* assert post release promise was executed */
            assert.isTrue(postReleaseExecuted);
            assert.equal('1.2.3',suppliedBuildInfo.releaseVersion);
            done();
        }).catch(function(error){
            done(error);
        });
    });
    
    it('errors out on missing config', function(){
        try{
            Release.perform();
        }catch(expected){
            assert.isNotNull(expected);
            return;
        }
        assert.fail();
    });

    it('errors out on empty config', function(){
        try{
            Release.perform({});
        }catch(expected){
            assert.isNotNull(expected);
            return;
        }
        assert.fail();
    });

    it('errors out on missing buildPromise', function(){
        try{
            Release.perform({
                projectPath: tmpDir.name
            });
        }catch(expected){
            assert.isNotNull(expected);
            return;
        }
        assert.fail();
    });

    it('errors out on missing projectPath', function(){
        try{
            Release.perform({
                buildPromise: function(){}
            });
        }catch(expected){
            assert.isNotNull(expected);
            return;
        }
        assert.fail();
    });

    it('errors out on empty projectPath', function(){
        try{
            Release.perform({
                projectPath: tmpDir.name
            });
        }catch(expected){
            assert.isNotNull(expected);
            return;
        }
        assert.fail();
    });

    it('errors out on wrong type of buildPromise', function(){
        fs.writeJsonSync(tmpDir.name+'/package.json',{
            version: '1.2.3-SNAPSHOT'
        },{spaces: 2});
        try{
            Release.perform({
                projectPath: tmpDir.name,
                buildPromise: 'string'
            });
        }catch(expected){
            assert.isNotNull(expected);
            return;
        }
        assert.fail();
    });

    it('errors out on bad version', function(done){
        /* make a fake package.json file */
        fs.writeJsonSync(tmpDir.name+'/package.json',{
            version: '1.0-SNAPSHOT'
        },{spaces: 2});
        Release.perform({
            projectPath: tmpDir.name,
            buildPromise: function(){
                return true;
            }
        }).then(function(results){
            done(new Error("release should have failed"));
        }).catch(function(error){
            assert.isNotNull(error);
            done();
        });
    });

    it('rolls back on failing build', function(done){
        /* make a fake package.json file */
        fs.writeJsonSync(tmpDir.name+'/package.json',{
            version: '1.0.0-SNAPSHOT'
        },{spaces: 2});
        /* run a release! */
        Release.perform({
            projectPath: tmpDir.name,
            buildPromise: function(){
                throw new Error("build has failed!");
            }
        }).then(function(results){
            done(new Error("release should have failed"));
        }).catch(function(error){
            /* assert build failed */
            assert.include(error.message,"build has failed!");
            /* verify git reset was executed */
            assert.equal('git reset --hard aaaaaaa',gitlog[gitlog.length-1]);
            done();
        });
    });

    it('rolls back on failing postRelease task', function(done){
        /* make a fake package.json file */
        fs.writeJsonSync(tmpDir.name+'/package.json',{
            name: 'example-project',
            version: '1.0.0-SNAPSHOT'
        },{spaces: 2});
        /* run a release! */
        Release.perform({
            projectPath: tmpDir.name,
            buildPromise: function(){},
            postReleasePromise: function(){
                throw new Error("post-release task failed");
            }
        }).then(function(results){
            done(new Error("release should have failed"));
        }).catch(function(error){
            /* assert build failed */
            assert.include(error.message,"post-release task failed");
            /* verify git resert and git delete tag were executed */
            assert.deepEqual(gitlog.slice(-2),[ 
                'git reset --hard aaaaaaa',
                'git tag -d example-project-1.0.0']);
            done();
        });
    });

    var gitlog = [],tmpDir;
    beforeEach(function(){
        gitlog = [];
        tmpDir = tmp.dirSync();
        Release.git = function(commands,workingDirectory){
            return new q.Promise(function(resolve,reject){
                var resolution = {exitCode:0,stdout:'',stderr:''};
                /* always respond with aaaaaaa for current commit */
                if(commands[0] === 'rev-parse' && commands[1] === '--verify'){
                    resolution.stdout = 'aaaaaaa';
                }
                /* always respond with 'master' for current branch */
                if(commands[0] === 'rev-parse' && commands[1] === '--abbrev-ref'){
                    resolution.stdout = 'master';
                }
                gitlog.push('git '+commands.join(' '));
                resolve(resolution);
            });
        };
    });
    afterEach(function(){
        if(tmpDir){
            try{
                fs.unlinkSync(tmpDir.name+'/package.json');
            }catch(ignore){

            }
            tmpDir.removeCallback();
        }
    });
});