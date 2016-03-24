var xmlrpc = require('xmlrpc');
var urlJoin = require('url-join');
var retriever = require('./retriever.js');

const TOKEN_EXPIRED_FAULT_STRING = 'java.lang.Exception: com.zutubi.pulse.servercore.api.AuthenticationException: Invalid token';

/**
 * @param {{url, user, password}} options
 * @returns {Object}
 */
module.exports = (options) => {
    var client = xmlrpc.createClient(
        {
            url: urlJoin(options.url, 'xmlrpc')
        }
    );
    var token = undefined;
    /**
     * callback(err, token)
     */
    var updateToken = (callback) => {
        remoteApi({
            name: 'login',
            args: [
                options.user,
                options.password
            ],
            needToken: false
        }, (err, token) => {
            if (err) callback(err);
            this.token = token;
            callback(null, token);
        });
    };
    /**
     * callback(err, token)
     */
    var getToken = (callback) => {
        if (token !== undefined) callback(null, token);
        else updateToken(callback);
    };
    /**
     * callback(err, result)
     * @param {{name, args, needToken}} options
     */
    var remoteApi = (options, callback) => {
        var functionName = 'RemoteApi.' + options.name;
        if (options.needToken === undefined) options.needToken = true;
        if (options.needToken){
            getToken((err, token) => {
                if (err) callback(err);
                var args = [token].concat(options.args);
                client.methodCall(functionName, args, (err, result) => {
                    if (err){
                        if (err.faultString == TOKEN_EXPIRED_FAULT_STRING){
                            updateToken((err, token) => {
                                if (err) callback(err);
                                args[0] = token;
                                client.methodCall(
                                    functionName, args, callback
                                );
                            });
                        } else callback(err);
                    } else callback(null, result);
                });
            });
        } else client.methodCall(functionName, options.args, callback);
    };
    var retrieve = retriever(remoteApi, options.url, getToken, updateToken);
    return {remoteApi, retrieve};
};