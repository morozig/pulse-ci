var async = require('async');
var urlJoin = require('url-join');
var request = require('request');
var path = require('path');
var fs = require('fs-extra');
var Logger = require('./logger.js');

module.exports = (remoteApi, pulseUrl, getToken, updateToken) => {
    /**
     * @param {{project, build}} options
     */
    var getBuildNumber = (options, callback) => {
        if (options.build !== undefined){
            callback(null, options.build);
        } else {
            remoteApi({
                name: 'getLatestBuildForProject',
                args: [options.project, false]
            }, (err, buildInfos) => {
                if (err) callback(err);
                var buildInfo = buildInfos[0];
                async.whilst(
                    () => !buildInfo.succeeded,
                    (callback) => {
                        remoteApi({
                            name: 'getPreviousBuild',
                            args: [options.project, buildInfo.id]
                        }, (err, previousBuildInfos) => {
                            if (err) callback(err);
                            buildInfo = previousBuildInfos[0];
                            callback(null);
                        });
                    },
                    (err) => {
                        if (err) callback(err);
                        callback(null, buildInfo.id);
                    }
                );
            });
        }
    };
    
    /**
     * @param {{project, build, name, dir, saveAs, consoleLog}} options
     */
    var downloadArtifactsFromSpecificBuild = (options, callback) => {
        remoteApi({
            name: 'getArtifactsInBuild',
            args: [options.project, options.build]
        }, (err, artifactInfos) => {
            if (err) callback(err);
            async.eachSeries(artifactInfos, (artifactInfo, callback) => {
                remoteApi({
                    name: 'getArtifactFileListing',
                    args: [
                        options.project,
                        options.build,
                        artifactInfo.stage,
                        artifactInfo.command,
                        artifactInfo.name,
                        ''
                    ]
                }, (err, artifactFiles) => {
                    if (err) callback(err);
                    async.eachSeries(artifactFiles, (file, callback) => {
                        if (file.match(options.name) &&(!options.stage || artifactInfo.stage == options.stage )){
                            var artifactUrl = urlJoin(
                                pulseUrl,
                                artifactInfo.permalink,
                                file.replace(/ /g, '%20')
                            );
                            options.file = file;
                            options.url = artifactUrl;
                            downloadTo(options, callback);
                        } else callback(null);
                    }, callback);
                });
            }, callback);
        });
    };

    /**
     * @param {{project, build, name, dir, saveAs, consoleLog}} options
     */
    var downloadArtifacts = (options, callback) => {
        getBuildNumber(options, (err, buildNumber) => {
            if (err) callback(err);
            options.build = buildNumber;
            downloadArtifactsFromSpecificBuild(options, callback);
        });
    };

    /**
     * @param {{url, file, name, dir, saveAs, consoleLog}} options
     */
    var downloadTo = (options, callback) => {
        var targetName = options.file;
        if (options.saveAs !== undefined){
            var pattern = new RegExp(options.name);
            targetName = options.file.replace(pattern, options.saveAs);
        }
        targetName = path.join(options.dir, targetName);
        var makeRequest = (token, checkToken, callback) => {
            var stream = request.get({
                url: options.url,
                proxy: '',
                headers: {'PULSE_API_TOKEN': token}
            });
            stream.on('response', (response) => {
                var size = response.headers['content-length'];
                if (checkToken && size === undefined){
                    updateToken((err, token) => {
                        if (err) callback(err);
                        makeRequest(token, false, callback);
                    });
                } else {
                    if (options.consoleLog){
                        console.log(options.file);
                        var logger = Logger(size);
                        stream.on('data', logger.tick)
                        .on('end', () => {
                            logger.hide();
                        });
                    }
                    stream.on('error', callback)
                    .on('end', callback)
                    .pipe(fs.createWriteStream(targetName))
                    .on('error', callback);
                }
            });
        };
        getToken((err, token) => {
            if (err) callback(err);
            fs.ensureFile(targetName, (err) => {
                if (err) callback(err);
                makeRequest(token, true, callback);
            });
        });
    };
    /**
     * @param {{artifacts:[{project, build, name, saveAs}], dir, consoleLog}} options
     */
    var retrieve = (options, callback) => {
        var dir = options.dir === undefined ? '.' : options.dir;
        if (options.consoleLog === undefined){
            options.consoleLog = true;
        }
        options.artifacts.forEach((artifactOptions) => {
            if (artifactOptions.dir === undefined) artifactOptions.dir = dir;
            artifactOptions.consoleLog = options.consoleLog;
        });
        async.eachSeries(options.artifacts, downloadArtifacts, callback);
    };
    return retrieve;
};