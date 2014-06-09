/**
 * Created by delian on 3/11/14.
 * This module implements basic RTMP Session handling
 */

var Log = require('./log.js');
var RQ = require('./readQueue.js');
var rmsg = require('./rtmpMessage.js');
var debug = 0;

/**
 * Class constructor
 * @param sock
 * @param isClient
 * @param cb
 * @returns {RtmpStream}
 * @constructor
 */
var RtmpStream = function(sock,isClient,cb) {

    if (!(this instanceof RtmpStream)) return new RtmpStream(sock,isClient,cb);

    var me = this;
    me.Q = new RQ(sock); // Create new Read Queue
    me.isClient = isClient;
    me.sock = sock;
    me.log = Log(debug,sock.remoteAddress+':'+sock.remotePort).log;
    me.log('RSESS: Create RTMP Session');
    me.msg = new rmsg({ debug: debug, Q: this.Q }); // Provide interface to the messages
    me.getTs = me.msg.getTs;

    if (isClient) {
        me.log('RSESS: Client Handshake Start');
        me.rtmpSendHandshakeC0();
        me.rtmpSendHandshakeC1();
        me.rtmpReadHandshakeS0();
        me.rtmpReadHandshakeS1();
        me.rtmpSendHandshakeC2();
        me.rtmpReadHandshakeS2();
    } else {
        me.log('RSESS: Server Handshake Start');
        me.rtmpReadHandshakeC0();
//        this.rtmpSendHandshakeS0();
        me.rtmpReadHandshakeC1();
        me.rtmpSendHandshakeS01(); // Send 0 and 1 together
        me.rtmpReadHandshakeC2();
        me.rtmpSendHandshakeS2();
    }

    this.sock.on('close',function() {
        me.log('RSESS: Destroy the RTMP session');
        delete(me.log);
        delete(me.msg);
        delete(me.getTs);
        delete(me.sock);
        delete(me.Q);
    });

    if (typeof cb == 'function') cb.call(this,this); // Send the object as an argument
};

/**
 * Send C0 header
 * @returns {*}
 */
RtmpStream.prototype.rtmpSendHandshakeC0 = function() {
    var me = this;
    this.Q.Q(0,function() {
        var buffer = new Buffer(1);
        buffer.writeUInt8(3,0); // RTMP Version
        me.sock.write(buffer);
        me.log('RSESS: Sent C0 Handshake',data);
    });
};

/**
 * Receive C0 header
 */
RtmpStream.prototype.rtmpReadHandshakeC0 = function() {
    var me = this;
    me.Q.Q(1,function(data) {
        me.log('RSESS: Received C0 Handshake',data);
    });
};

/**
 * Send C1 header
 */
RtmpStream.prototype.rtmpSendHandshakeC1 = function() {
    var me = this;
    me.Q.Q(0,function() {
        var buffer = new Buffer(1536);
        buffer.writeUInt32BE(me.getTs(),0); // Set the timestamp
        buffer.writeUInt32BE(0,4); // zero
        me.sock.write(buffer);
        me.log('RSESS: Sent C1 Handshake',buffer);
    });
};

/**
 * Receive C1 header
 */
RtmpStream.prototype.rtmpReadHandshakeC1 = function() {
    var me = this;
    me.Q.Q(1536,function(data) {
        me.C1 = data;
        me.c1s1ts = me.getTs();
        me.log('RSESS: Received C1 Handshake',data);
    });
};

/**
 * Send S0 header
 */
RtmpStream.prototype.rtmpSendHandshakeS0 = function() {
    var me = this;
    me.Q.Q(0,function() {
        var buffer = new Buffer(1);
        buffer.writeUInt8(3,0); // RTMP Version
        me.sock.write(buffer);
        me.log('RSESS: Sent S0 Handshake',buffer);
    });
};

/**
 * Read S0 header
 */
RtmpStream.prototype.rtmpReadHandshakeS0 = function() {
    var me = this;
    me.Q.Q(1,function(data) {
        me.log('RSESS: Received S0 Handshake',data);
    });
};

/**
 * Send S1 header
 */
RtmpStream.prototype.rtmpSendHandshakeS1 = function() {
    var me = this;
    me.Q.Q(0,function() {
        var buffer = new Buffer(1536);
        buffer.writeUInt32BE(me.getTs(),0); // Set the timestamp
        buffer.writeUInt32BE(0,4); // zero
        me.sock.write(buffer);
        me.log('RSESS: Sent S1 Handshake',buffer);
    });
};

/**
 * Send S0 and S1 at once, to avoid a potential bug with the librtmp
 */
RtmpStream.prototype.rtmpSendHandshakeS01 = function() {
    var me = this;
    me.Q.Q(0,function() {
        var buffer = new Buffer(1537);
        buffer.writeUInt8(3,0);
        buffer.writeUInt32BE(me.getTs(),1); // Set the timestamp
        buffer.writeUInt32BE(0,5); // zero
        me.sock.write(buffer);
        me.log('RSESS: Sent S0+1 Handshake',buffer);
    });
};

/**
 * Read S1 Header
 */
RtmpStream.prototype.rtmpReadHandshakeS1 = function() {
    var me = this;
    me.Q.Q(1536,function(data) {
        me.S1 = data;
        me.c1s1ts = me.getTs();
        me.log('RSESS: Received S1 Handshake',data);
    });
};

/**
 * Send C2 Header
 */
RtmpStream.prototype.rtmpSendHandshakeC2 = function() {
    var me = this;
    me.Q.Q(0,function() {
        var buffer = new Buffer(1536);
        if (me.S1) me.S1.copy(buffer);
        buffer.writeUInt32BE(me.c1s1ts,4);
        me.sock.write(buffer);
        me.log('RSESS: Sent C2 Handshake',buffer);
    });
};

/**
 * Read C2 Header
 */
RtmpStream.prototype.rtmpReadHandshakeC2 = function() {
    var me = this;
    me.Q.Q(1536,function(data) {
        me.log('RSESS: Received C2 Handshake',data);
    });
};

/**
 * Send S2 Header
 */
RtmpStream.prototype.rtmpSendHandshakeS2 = function() {
    var me = this;
    me.Q.Q(0,function() {
        var buffer = new Buffer(1536);
        if (me.C1) me.C1.copy(buffer);
        buffer.writeUInt32BE(me.c1s1ts,4);
        me.sock.write(buffer);
        me.log('RSESS: Sent S2 Handshake',buffer);
    });
};

/**
 * Read S2 Header
 */
RtmpStream.prototype.rtmpReadHandshakeS2 = function() {
    var me = this;
    me.Q.Q(1536,function(data) {
        me.log('RSESS: Received S2 Handshake',data);
    });
};

module.exports = RtmpStream;

