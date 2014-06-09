/**
 * Created by delian on 3/11/14.
 *
 * Simple implmenetation of an RTMP Server
 *
 */

var net = require('net');
var Log = require('./log.js');
var rtmpSession = require('./rtmpSession.js');
var debug = 0;

module.exports = function() {
    Log(debug).log('Create RTMP Server Object');
    var ret = {};
    ret.createServer = function(cb) {
        Log(debug).log('Create RTMP Server');
        return net.createServer(function(sock) {
            sock.setMaxListeners(100); // Warning related to the amount of CS id's
            rtmpSession(sock,0,function() {
                Log(debug).log('Callback the Server callback!');
                var me = this;
                cb.apply(me,arguments); // Call the CallBack preserving the object
            });
        });
    };
    return ret;
};