var prettyBytes = require('pretty-bytes');
var Gauge = require("gauge");

module.exports = (size) => {
    var total = parseInt(size);
    var totalPretty = prettyBytes(total);
    var transferred = 0;
    var gauge = new Gauge();
    
    var tick = (chunk) => {
        transferred += chunk.length;
        var completed = transferred / total;
        var log = prettyBytes(transferred) + ' of ' + totalPretty;
        gauge.pulse();
        gauge.show(log, completed);
    };
    var hide = () => {
        gauge.disable();
    };
    return {tick, hide};
};