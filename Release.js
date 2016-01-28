var q = require('q'),
    execFile = require('child_process').execFile,
    spawn = require('child_process').spawn,
    semver = require('semver'),
    fs = require('fs-extra'),
    minimist = require('minimist');
/**
 * A Release utility for node projects that
 * - use npm and thus have a project.json file
 * - use git
 * - use semver versioning (e.g. 1.0.0) with SNAPSHOT dev versions (e.g. 1.0.0-SNAPSHOT)
 */
var Release = {
    /**
     * Run a git command by spawning a process; return an object containing stdout,stderr, and exitCode
     * Promise will reject on a non-zero git exit code
     * @param {array} commands - command array (e.g. ['commit','-m','message'])
     * @param {string} workingDirectory - working directory to launch git on
     * @retrun {object} promise that resolves to an object containing stdout,stderr, and exitCode
     */
    git: function(commands, workingDirectory){
        return new q.Promise(function(resolve,reject){
            var gitProc = execFile('git',commands,{cwd:workingDirectory,timeout:30000}, function(error,stdout,stderr){
                if(error !== null){
                    reject(new Error('Could not execute git ' + commands.join(' ') + 
                        ' (exit code ' + gitProc.exitCode+'); stdout:\n' + stdout + '\nstderr:\n' + stderr));
                    return;
                }
                resolve({
                    stdout: stdout,
                    stderr: stderr
                });
            });
        });
    },
    /**
     * Log a debug message
     */
    debug: function(){
        if(Release.debugEnabled){
            var args = Array.prototype.slice.call(arguments);
            if(args.length > 0){
                args[0] = '[release] ' + args[0];
            }
            console.log.apply(console,args);
        }
    },
    /**
     * Read current git commit and return a promise that resolves to this commit
     * @param {string} projectRoot - node project root
     * @return {object} promise that resolves to current git commit
     */
    readCurrentCommit: function(projectRoot){
        Release.debug("#readCurrentCommit:enter ("+projectRoot+")");
        return Release.git(['rev-parse', '--verify', 'HEAD'],projectRoot).then(function(result){
            return new q.Promise(function(resolve,reject){
                var currentCommit = result.stdout.trim();
                if(currentCommit !== ''){
                    resolve(currentCommit);
                }else{
                    reject(new Error('Could not read current commit.'));
                }
            });
        }.bind(this));
    },
    /**
     * Read current git branch and return a promise that resolves to the branch name
     * @param {string} projectRoot - node project root
     * @return {object} promise that resolves to current git branch name
     */
    readCurrentBranch: function(projectRoot){
        Release.debug("#readCurrentBranch:enter ("+projectRoot+")");
        return Release.git(['rev-parse','--abbrev-ref','HEAD'],projectRoot).then(function(result){
            return new q.Promise(function(resolve,reject){
                var currentBranch = result.stdout.trim();
                if(currentBranch !== ''){
                    resolve(currentBranch);
                }else{
                    reject(new Error('Could not read current branch.'));
                }
            });
        });
    },
    /**
     * Hard-revert projectRoot to a pre-release commit in case a release is botched and return a promise
     * @param {string} projectRoot - node project root
     * @param {string} commit - a pre-release commit to revert to
     * @return {object} promise that resolves when revert is complete
     */
    reset: function(projectRoot,commit){
        Release.debug("#reset:enter (" + projectRoot + "," + commit + ")");
        return new q.Promise(function(resolve,reject){
            if(!commit){
                Release.debug("#reset:no pre-release commit supplied");
                resolve();
            }else{
                Release.git(['reset','--hard',commit],projectRoot).then(function(){
                    Release.debug("#reset:reverted to pre-release commit "+commit);
                    resolve();
                }).catch(function(error){
                    reject(error);
                });
            }
        }.bind(this));
    },
    /**
     * Delete a git tag by name
     * @param {string} projectRoot - node project root
     * @param {string} tagName - tag name to delete
     * @return {object} promise that resolves when delete is complete
     */
    deleteTag: function(projectRoot,tagName){
        Release.debug("#deleteTag:enter ("+projectRoot+","+tagName+")");
        return new q.Promise(function(resolve,reject){
            if(!tagName){
                Release.debug("#deleteTag:no tagName supplied");
                resolve();
            }else{
                Release.git(['tag','-d',tagName],projectRoot).then(function(){
                    Release.debug("#deleteTag:deleted tag "+tagName);
                    resolve();
                }).catch(function(error){
                    reject(error);
                });
            }
        });
    },
    /**
     * Verifies that a project version has a "-SNAPSHOT" in it; returns a promsie that resolves to current version if it does
     * @param {string} projectRoot - project root
     * @return {object} promise that resolves to current version if the project version is a snapshot
     */
    checkVersion: function(projectRoot){
        Release.debug("#checkVersion:enter ("+projectRoot+")");
        return q.Promise(function(resolve,reject){
            var version = require(projectRoot+'/package.json').version;
            if(version.indexOf('SNAPSHOT') === -1){
                reject(new Error('Can not release a non-SNAPSHOT version; update package.json version prior to release'));
            }
            if(version.split('.').length!==3){
                reject(new Error('Project version must be semver compliant and have a patch version (e.g. 1.0.0-SNAPSHOT)'));
            }
            resolve(version);
        });
    },
    /**
     * Returns a promise that resolves only if there are uncommitted changes
     * @param {string} projectRoot - project root
     * @return {object} promise that resolves only if there are uncommited changes
     */
    checkUncommitted: function(projectRoot){
        Release.debug("#checkUncommitted:enter ("+projectRoot+")");
        return Release.git(['status','--porcelain'],projectRoot).then(function(result){
            return new q.Promise(function(resolve,reject){
                if(result.stdout.length > 0){
                    reject(new Error('Outstanding git changes present; commit all changes prior to running a release:\n'+result.stdout));
                }else{
                    resolve();
                }
            });
        });
    },
    /**
     * Returns a promise that updates project version to supplied new version and resolves
     * @param {string} projectRoot - project root
     * @param {string} newVersion - new version project version
     * @return {object} promise that resolves after updating project version
     */
    updateVersion: function(projectRoot,newVersion){
        Release.debug("#updateVersion:enter ("+projectRoot+","+newVersion+")");
        return new q.Promise(function(resolve,reject){
            var packageJSON = require(projectRoot+'/package.json');
            packageJSON.version = newVersion;
            fs.writeJsonSync(projectRoot+'/package.json',packageJSON,{spaces: 2});
            resolve();
        });
    },
    /**
     * Returns a promise that performs a commit and resolves on success
     * @param {string} projectRoot - project root
     * @param {string} message - commit message
     * @return {object} promise that resolves after successful commit
     */
    commit: function(projectRoot,message){
        Release.debug("#commit:enter ("+projectRoot+","+message+")");
        return Release.git(['commit','package.json','-m',message],projectRoot);
    },
    /**
     * Returns a promise that tags current repository at HEAD and resolves to tag name on success
     * @param {string} projectRoot - project root
     * @param {string} message - release message
     * @param {string} version - tag name/version
     * @return {object} promise that resolves to tag name after successful tag
     */
    tag: function(projectRoot,message,version){
        Release.debug("#tag:enter ("+projectRoot+","+message+","+version+")");
        return Release.git(['tag','-a','-m',message, version], projectRoot).then(function(result){
            return version;
        });
    },
    /**
     * Returns a promise that pushes a ref to a remote git repo
     * @param {string} projectRoot - project root
     * @param {string} remote - remote name (e.g. origin)
     * @param {string} ref - ref to push (e.g. master, 1.0.0)
     * @return {object} promise that resolves after successful push
     */
    push: function(projectRoot,remote,ref){
        Release.debug("#push:enter ("+projectRoot+","+remote+","+ref+")");
        return Release.git(['push',remote,ref],projectRoot);
    },
    /**
     * Perform a release given a release configuration consisting of at least a <code>projectPath</code> and <code>buildPromise</code>
     * @param {object}  config                       - required release configuration
     * @param {string}  config.projectPath           - required node project file system path
     * @param {string}  config.buildPromise          - required function that is supplied an object with "releaseVersion" and returns a build promise or status
     * @param {object}  config.postReleasePromise    - optional function that is supplied an object with "releaseVersion" and returns a post-release promise or status
     * @param {string}  config.releaseVersion        - optional release version (automatically selected otherwise)
     * @param {string}  config.nextDevVersion        - optional next dev version (automatically selected otherwise)
     * @param {boolean} config.debug                 - optional flag that specifies whether or not to log debug messages
     * @return {object} promise that resolves with release information (releaseVersion,devVersion,releaseTime) or rejects with an error
     */
    perform: function(config){
        /* validate config */
        if(!config){
            throw new Error("Release requires a configuration object");
        }
        if(!config.projectPath){
            throw new Error("Release requires a projectPath configuration");
        }
        fs.ensureFileSync(config.projectPath+"/package.json");
        if(!config.buildPromise || typeof(config.buildPromise) !== 'function'){
            throw new Error("Release requires a buildPromise function");
        }
        if(config.debug){
            Release.debugEnabled = true;
        }
        /* remember some state */
        var preReleaseCommit = null,
            devBranch = null,
            devVersion = null,
            releaseVersion = null,
            releaseTagName = null,
            nextDevVersion = null,
            releaseStartTime = new Date().getTime();

        /* original */
        /* check current version contains a -SNAPSHOT */
        return Release.checkVersion(config.projectPath)
            /* remember current version and check for uncommitted changes */
            .then(function(version){
                Release.debug("#perform:read DEV version as " + version);
                devVersion = version;
                return Release.checkUncommitted(config.projectPath);
            })
            /* read current commit */
            .then(function(){
                Release.debug("#perform:verified there are no uncommitted changes");
                return Release.readCurrentCommit(config.projectPath);
            })
            /* remember current commit and read current branch */
            .then(function(currentCommit){
                Release.debug("#perform:read pre-release commit as " + currentCommit);
                preReleaseCommit = currentCommit;
                return Release.readCurrentBranch(config.projectPath);
            })
            /* remember current branch and bump version to release version */
            .then(function(currentBranch){
                Release.debug("#perform:read DEV branch as " + currentBranch);
                devBranch = currentBranch;
                releaseVersion = config.releaseVersion || semver.inc(devVersion,'patch');
                Release.debug("#perform:picked release version as " + releaseVersion+"; updating local DEV version to release");
                return Release.updateVersion(config.projectPath,releaseVersion);
            })
            /* perform a build */
            .then(function(){
                Release.debug("#perform:executing build");
                return config.buildPromise({
                    releaseVersion: releaseVersion
                });
            })
            /* commit release version */
            .then(function(){
                Release.debug("#perform:executed build; committing release version as "+releaseVersion);
                return Release.commit(config.projectPath,'[release] - releasing ' + releaseVersion);
            })
            /* tag release */
            .then(function(){
                Release.debug("#perform:tagging release version");
                return Release.tag(config.projectPath,'[release] - '+releaseVersion+' release', releaseVersion);
            })
            /* remember definitive release tag name and perform post-release tasks */
            .then(function(tagName){
                Release.debug("#perform:tagged "+tagName);
                releaseTagName = tagName;
                if(config.postReleasePromise){
                    Release.debug("#perform:executing post release steps");
                    return config.postReleasePromise({
                        releaseVersion: releaseVersion
                    });
                }else{
                    return;
                }
            })
            /* bump to next dev version */
            .then(function(){
                nextDevVersion = config.nextDevVersion || semver.inc(releaseVersion,'patch') + '-SNAPSHOT';
                Release.debug("#perform:picked next DEV version as " + nextDevVersion);
                return Release.updateVersion(config.projectPath,nextDevVersion);
            })
            /* commit dev version */
            .then(function(){
                Release.debug("#perform:committing next DEV version");
                return Release.commit(config.projectPath,'[release] - updating dev version to '+nextDevVersion);
            })
            /* push tag upstream */
            .then(function(){
                Release.debug("#perform:pushing released tag");
                return Release.push(config.projectPath,'origin',releaseVersion);
            })
            /* push dev version */
            .then(function(){
                Release.debug("#perform:pushing DEV version (" + devBranch+")");
                return Release.push(config.projectPath,'origin',devBranch);
            })
            /* publish release information */
            .then(function(){
                Release.debug("#perform:done");
                return {
                    releaseVersion: releaseVersion,
                    devVersion: nextDevVersion,
                    releaseTime: new Date().getTime() - releaseStartTime
                };
            })
            /* catch any release errors and clean up */
            .catch(function(error){
                Release.debug("#perform:error performing release - "+error);
                return Release.reset(config.projectPath,preReleaseCommit)
                    .then(function(){
                        return Release.deleteTag(config.projectPath,releaseTagName);
                    })
                    .then(function(){
                        throw new Error(error);
                    });
            });
    }
};
/* check whether or not this is being executed from the CLI */
if(!module.parent){
    /* release is being run directly; parse args */
    var cliArgs = minimist(process.argv.slice(2));
    if(cliArgs.help){
        console.log('usage:');
        console.log('node ' + process.argv[1] + ' [-p path to project (. by default)] [--releaseVersion release version] [--devVersion next dev version] [--debug debug flag] [--build buildCmd]');
        return;
    }

    Release.perform({
        projectPath: cliArgs.p || process.cwd(),
        releaseVersion: cliArgs.releaseVersion || undefined,
        devVersion: cliArgs.devVersion || undefined,
        debug: cliArgs.debug || false,
        buildPromise: function(){
            if(cliArgs.build){
                return new q.Promise(function(resolve,reject){
                    var args = cliArgs.build.split(" ");
                    if(args.length<1){
                        reject(new Error("invalid build argument"));
                    }
                    var cmd = args[0];
                    args = args.length>1?args.slice(1):[];
                    var proc = spawn(cmd,args,{stdio:'pipe'});
                    proc.stdout.on('data',function(dataBuffer){
                        if(dataBuffer.toString()!==''){
                            console.log(dataBuffer.toString().trim());
                        }
                    });
                    proc.stderr.on('data',function(dataBuffer){
                        if(dataBuffer.toString()!==''){
                            console.log(dataBuffer.toString().trim());
                        }
                    });
                    proc.on('exit',function(){
                        if(proc.exitCode !==0){
                            reject(new Error('Build failed with exit code '+exitCode));
                        }else{
                            resolve();
                        }
                    });
                });
            }else{
                return true;
            }
        }
    }).then(function(results){
        console.log("Release Performed in "+results.releaseTime+"ms");
        console.log("-----------------------------------------------");
        console.log("released version: "+results.releaseVersion);
        console.log("dev version: "+results.devVersion);
    }).catch(function(error){
        console.log("Release failed");
        console.log("--------------");
        console.log(error);
    });
}
module.exports = Release;