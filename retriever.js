var async = require('async');
var urlJoin = require('url-join');
var request = require('request');
var path = require('path');
var fs = require('fs');
var prettyBytes = require('pretty-bytes');

exports.retrieve = (remoteApi, pulseUrl, getToken, updateToken) => {
    /**
     * callback(err, [artifactUrl])
     * @param {{project, build, name}} options
     */
    var getArtifactUrls = (options, callback) => {
        var artifactUrls = [];
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
                    artifactFiles.forEach((file) => {
                        if (file.match(options.name)){
                            var artifactUrl = urlJoin(
                                pulseUrl,
                                artifactInfo.permalink,
                                file.replace(/ /g, '%20')
                            );
                            artifactUrls.push(artifactUrl);
                        }
                    });
                    callback(null);
                });
            }, (err) => {
                if (err) callback(err);
                callback(null, artifactUrls);
            });
        });
    };
    var downloadTo = (url, dir, callback) => {
        var fileName = url.split(/\//).pop().replace(/%20/g, ' ');
        var targetName = path.join(dir, fileName);
        var makeRequest = (token, callback) => {
            var stream = request.get({
                url: url,
                proxy: '',
                headers: {'PULSE_API_TOKEN': token}
            })
            stream.on('response', (response) => {
                var size = response.headers['content-length'];
                if (size === undefined){
                    updateToken((err, token) => {
                        if (err) callback(err);
                        makeRequest(token, callback);
                    });
                } else {
                    size = prettyBytes(parseInt(size));
                    console.log(fileName, size);
                    stream.on('error', callback)
                    .on('end', callback)
                    .pipe(fs.createWriteStream(targetName))
                    .on('error', callback);
                }
            });
        };
        getToken((err, token) => {
            if (err) callback(err);
            makeRequest(token, callback);
        });
    };
    /**
     * @param {{artifacts:[{project, build, name}], dir}} options
     */
    var retrieve = (options, callback) => {
        var artifactUrls = [];
        var dir = options.dir === undefined ? '.' : options.dir;
        var download = (url, callback) => {
            downloadTo(url, dir, callback);
        };
        async.mapSeries(
            options.artifacts,
            getArtifactUrls,
            (err, arrays) => {
                if (err) callback(err);
                artifactUrls = [].concat.apply([], arrays);
                async.eachSeries(artifactUrls, download, callback);
            }
        )
    };
    return retrieve;
};