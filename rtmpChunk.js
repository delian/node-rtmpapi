/**
 * Created by delian on 3/11/14.
 *
 * This little module provides interface to processing chunks on a higher level
 */

var amf = require('node-amfutils');
var Log = require('./log.js');

/**
 * Contains rules for chunk processing
 */

function getTs() {
    var ts = new Date().getTime();
    return ts % 0x7FFFFF;
}

/**
 * Create a chunk class
 * @param chunk {object}
 * @param opt
 * @returns {RtmpChunkMsgClass}
 */
function RtmpChunkMsgClass(chunk, opt) {
    var k;
    if (!(this instanceof RtmpChunkMsgClass)) return new RtmpChunkMsgClass(chunk, opt);

    var me = this;

    me.chunk = {
        data: new Buffer(0),
        sendData: new Buffer(0), // The data parameter we use to transmit
        timestamp: 0,
        msgLen: 0,
        msgLeft: 0,
        msgType: 0,
        msgTypeText: "",
        fmt: 0,
        msgComplete: 1,
        streamId: 0,
        recvBytes: 0,
        chunkSize: {}, // Reference to a chunk size, initialized later
        msgStreamId: 0
    };
    me.oldChunk = {
        data: new Buffer(0),
        sendData: new Buffer(0), // The data parameter we use to transmit
        timestamp: 0,
        msgLen: 0,
        msgLeft: 0,
        msgType: 0,
        msgTypeText: "",
        fmt: 0,
        msgComplete: 1,
        streamId: 0,
        recvBytes: 0,
        chunkSize: {}, // Reference to a chunk size, initialized later
        msgStreamId: 0
    };
    me.Q = opt.Q; // Inherit Q
    if (opt.Q) me.sock = opt.Q.sock;
    if (opt.sock) me.sock = opt.sock; // Inherit socket
    me.log = Log(opt.debug, (me.sock ? me.sock.remoteAddress : '') + ':' + (me.sock ? me.sock.remotePort : '')).log; // Implement Logging
    if (me.Q && typeof me.Q.chunkSize == 'undefined') {
        me.Q.chunkSize = { rcv: 128, snd: 128, rcvWinSize: 4096, sndWinSize: 4096 };
        me.log('CHUNK: The session never had chunkSize before, lets set it');
    }
    for (k in chunk) me.chunk[k] = chunk[k]; // Get the properties
    me.chunk.chunkSize = me.Q.chunkSize;
    me.oldChunk.chunkSize = me.chunk.chunkSize;
    if (me.sock) {
        me.sock.on('close', function () {
            me.log('CHUNK: MSG class destroyed', me.streamId);
            me.log = null;
            me.Q = null;
            me.sock = null;
            me.chunk = null;
        });
    }
}

/**
 * Static link to the local getTs function
 * @returns {*}
 */
RtmpChunkMsgClass.prototype.getTs = function () {
    return getTs();
};

/**
 * Called when we receive Set Chunk Size message
 */
RtmpChunkMsgClass.prototype.rcvSetChunkSize = function () {
    var c = this.chunk;
    c.chunkSize.rcv = c.data.readUInt32BE(0);
    c.msgTypeText = "setChunkSize";
    c.msg = { setChunkSize: c.chunkSize.rcv };
    this.log('CHUNK: Received Set Chunk Size', c.chunkSize.rcv, this.chunk);
};

/**
 * Called when we want to set the Chunk Size
 * @param size
 */
RtmpChunkMsgClass.prototype.sendSetChunkSize = function (size) { // Chunk Size is it one direction only or both?
    this.log('CHUNK: Send Set Chunk Size', size);
    this.chunk.chunkSize.snd = size; // Set the chunk size of the object
    var msg = {
        msgType: 1,
        data: new Buffer(4), msgStreamId: 0, streamId: 2
    };
    msg.data.writeUInt32BE(size, 0);
    return this.rtmpMsgSend(msg);
};

/**
 * Called when we receive Abort Message
 */
RtmpChunkMsgClass.prototype.rcvAbortMsg = function () {
    var sid = this.chunk.data.readUInt32BE(0);
    this.chunk.msgTypeText = "abort";
    this.chunk.msg = { msgStreamId: sid };
    this.log('CHUNK: Received Abort message for Stream Id', sid);
};

/**
 * Called when we want to send Abort message for a certain stream
 * @param msgStreamId
 * @returns {*}
 */
RtmpChunkMsgClass.prototype.sendAbortMsg = function (msgStreamId) {
    this.log('CHUNK: Send Abort Message for', msgStreamId);
    var data = new Buffer(4);
    data.writeUInt32BE(msgStreamId, 0);
    return this.rtmpMsgSend({ msgType: 2, data: data, msgStreamId: 0, streamId: 2 });
};

/**
 * Called when we receive Ack Message
 */
RtmpChunkMsgClass.prototype.rcvAckMsg = function () {
    var snum = this.chunk.data.readUInt32BE(0);
    this.log('CHUNK: Received ACK with seq num', snum);
    this.chunk.msgTypeText = "ack";
    this.chunk.msg = { seq: snum };
};

/**
 * Called when we want to send Ack Message
 * @returns {*}
 */
RtmpChunkMsgClass.prototype.sendAckMsg = function () {
    var data = new Buffer(4);
    var Q = this.Q;
    data.writeUInt32BE(Q.recvBytes, 0);
    this.log('CHUNK: Send ACK with seq num', Q.recvBytes, Q.recvBytes - Q.ackBytes);
    Q.ackBytes = Q.recvBytes;
    return this.rtmpMsgSend({ msgType: 3, data: data, msgStreamId: 0, streamId: 2 });
};

/**
 * Called when we receive Set Window Size message
 */
RtmpChunkMsgClass.prototype.rcvSetWindowSize = function () {
    var snum = this.chunk.data.readUInt32BE(0);
    this.log('CHUNK: Received Set Window Size', snum);
    this.chunk.windowSize = snum;
    this.chunk.msgTypeText = "setWindowSize";
    this.chunk.msg = { windowSize: snum };
    this.chunk.chunkSize.sndWinSize = snum; // We do set this, but we do not follow it strictly
};

/**
 * Send request to set Window Size
 * @param snum the window size number
 * @returns {*}
 */
RtmpChunkMsgClass.prototype.sendSetWindowSize = function (snum) {
    this.log('CHUNK: Send Set Window Size', snum);
    var data = new Buffer(4);
    data.writeUInt32BE(snum, 0);
    this.chunk.chunkSize.rcvWinSize = snum;
    return this.rtmpMsgSend({ msgType: 5, data: data, msgStreamId: 0, streamId: 2 });
};

/**
 * Called when we receive setPeerBw message
 */
RtmpChunkMsgClass.prototype.rcvSetPeerBw = function () {
    var snum = this.chunk.data.readUInt32BE(0);
    var ltype = 0;
    if (this.chunk.data.length > 4) this.chunk.data.readUInt8(4);
    this.log('CHUNK: Received Set Peer Bw', snum, ltype);
    this.chunk.peerBw = snum;
    this.chunk.lType = ltype;
    this.chunk.msgTypeText = "setPeerBw";
    this.chunk.msg = { peerBw: snum, lType: ltype };
    // this.chunk.chunkSize.rcvWinSize = snum;
    this.sendSetWindowSize(snum); // We do a reply and automatically set our ack
};

/**
 * Send request to set Peer Bandwidth
 * @param peerBw
 * @param lType
 * @returns {*}
 */
RtmpChunkMsgClass.prototype.sendSetPeerBw = function (peerBw, lType) {  // Broke the lType the way MIST does!!!
    this.log('CHUNK: Send Set Peer Bw', peerBw, lType);
    var data = new Buffer(4);
    data.writeUInt32BE(peerBw, 0);
    if (typeof lType != 'undefined') {
        var lTypeData = new Buffer(1);
        lTypeData.writeInt8(lType, 0);
        data = Buffer.concat([data, lTypeData]);
    }
    return this.rtmpMsgSend({ msgType: 6, data: data, msgStreamId: 0, streamId: 2 });
};

/**
 * Receive User Control Message
 */
RtmpChunkMsgClass.prototype.rcvUserControlMsg = function () {
    this.log('CHUNK: Received User Control Message', this.chunk);
    this.chunk.msgTypeText = "userControl";
    var eventType = this.chunk.data.readUInt16BE(0);
    this.chunk.msg = {
        evenType: eventType
    };
    switch (eventType) {
        case 0: // Stream begin
            this.chunk.msg.streamId = this.chunk.data.readUInt32BE(2);
            break;
        case 1: // Stream EOF
            this.chunk.msg.streamId = this.chunk.data.readUInt32BE(2);
            break;
        case 2: // Stream Dry
            this.chunk.msg.streamId = this.chunk.data.readUInt32BE(2);
            break;
        case 3: // Set Buffer Length
            this.chunk.msg.streamId = this.chunk.data.readUInt32BE(2);
            this.chunk.msg.buffLenMs = this.chunk.data.readUInt32BE(6);
            break;
        case 4: // Stream is recorded
            this.chunk.msg.streamId = this.chunk.data.readUInt32BE(2);
            break;
        case 5: // Ping Request
            this.chunk.msg.timestamp = this.chunk.data.readUInt32BE(2);
            this.sendUserControlMsg(6); // Respond immediately with ping response
            break;
        case 6: // Ping response
            this.chunk.msg.timestamp = this.chunk.data.readUInt32BE(2);
            break;
        default:
            this.log('CHUNK: UNKNOWN User Control Message Event Type', eventType, this.chunk);
    }
};

/**
 * Receive User Control Message
 */
RtmpChunkMsgClass.prototype.sendUserControlMsg = function (eventType, streamId, buffLenMs) {
    this.log('CHUNK: Sending User Control Message', eventType, streamId, buffLenMs);
    var data = new Buffer(6);
    data.writeUInt16BE(eventType, 0);
    data.writeUInt32BE(streamId || 0, 2);
    this.chunk.msgTypeText = "userControl";
    var eventType = this.chunk.data.readUInt16BE(0);
    if (eventType == 3)
        data = Buffer.concat([data, (new Buffer(4)).writeUInt32BE(buffLenMs, 6)]);
    return this.rtmpMsgSend({ msgType: 4, data: data, msgStreamId: 0, streamId: 2 }); // User control messages has always CS2 and S0
};

/**
 * Receive Audio Message
 */
RtmpChunkMsgClass.prototype.rcvAudioMsg = function () {
    this.log('CHUNK: Received Audio Message', this.chunk);
    this.chunk.msgTypeText = "audio";
    this.chunk.msg = {};
    // TODO: Implement Audio Message
};

/**
 * Receive Video Message
 */
RtmpChunkMsgClass.prototype.rcvVideoMsg = function () {
    this.log('CHUNK: Received Video Message', this.chunk);
    this.chunk.msgTypeText = "video";
    this.chunk.msg = {};
    // TODO: Implement Video Message
};

/**
 * Receive AMF3 Meta Message
 */
RtmpChunkMsgClass.prototype.rcvAmf3MetaMsg = function () {
    this.log('CHUNK: Received Meta Message AMF3', this.chunk);
    this.chunk.msgTypeText = "amf3meta";
    this.chunk.msg = {};
    // TODO: Implement Meta Message AMF3
};

/**
 * Receive AMF0 Meta Message
 */
RtmpChunkMsgClass.prototype.rcvAmf0MetaMsg = function () {
    this.log('CHUNK: Received Meta Message AMF0', this.chunk);
    var c = this.chunk;
    c.msgTypeText = "amf0meta";
    var data = c.data;
    var dec = amf.amf0Decode(data);
    c.msg = {
        cmd: dec[0],
        event: dec[1],
        parms: dec[2],
        dec: dec
    }
};

/**
 * Receive AM3 SObjMessage
 */
RtmpChunkMsgClass.prototype.rcvAmf3SObjMsg = function () {
    this.log('CHUNK: Received Shared Object Message AMF3', this.chunk);
    this.chunk.msgTypeText = "amf3sobject";
    this.chunk.msg = {};
    // TODO: Implement SOBJ Message AMF3
};

/**
 *
 */
RtmpChunkMsgClass.prototype.rcvAmf0SObjMsg = function () {
    this.log('CHUNK: Received Shared Object Message AMF0', this.chunk);
    this.chunk.msgTypeText = "amf0sobject";
    this.chunk.msg = {};
    // TODO: Implement SOBJ Message AMF0
};

/**
 *
 */
RtmpChunkMsgClass.prototype.rcvAmf3EncCmdMsg = function () {
    this.log('CHUNK: Received CMD Message AMF3', this.chunk);
    this.chunk.msgTypeText = "amf3cmd";
    this.chunk.msg = amf.decodeAmf3Cmd(this.chunk.data);
};

/**
 *
 */
RtmpChunkMsgClass.prototype.rcvAmf0EncCmdMsg = function () {
    this.log('CHUNK: Received CMD Message AMF0', this.chunk);
    this.chunk.msgTypeText = "amf0cmd";
    this.chunk.msg = amf.decodeAmf0Cmd(this.chunk.data);
};

/**
 * Send AMF0 encoded command message
 * @param s
 * @returns {*}
 */
RtmpChunkMsgClass.prototype.sendAmf0EncCmdMsg = function (s) {
    var data = amf.encodeAmf0Cmd(s); // TODO: Check the CSid and Sid
    this.log('CHUNK: Send encoded AMF0 cmd', s, data);
    return this.rtmpMsgSend({ msgType: 20, data: data }); // Force the CMD message into CS2, although it is not required by the standard
};

/**
 *
 */
RtmpChunkMsgClass.prototype.rcvAggMsg = function () {
    this.log('CHUNK: Received Aggreg Message', this.chunk);
    this.chunk.msg = {};
    this.chunk.msgTypeText = "agg";
    // TODO: Implement Aggreg Message
};

/**
 * Auto decide which type of chunk header type to use
 * @param msg
 */
RtmpChunkMsgClass.prototype.rtmpMsgSend = function (msg) {
    var me = this;
    var c = this.chunk;
    var Q = me.Q;

    // We will avoid sending data trough the read queue in general to avoid event based blocking

    msg.sendData = msg.data.slice(0, c.chunkSize.snd); // The lower layer uses different transport variable - sendData instead data
    me.rtmpMsg0Send(msg);

    for (var i = c.chunkSize.snd; msg.data.length - i > 0; i += c.chunkSize.snd) {
        msg.sendData = msg.data.slice(i, i + c.chunkSize.snd);
        me.rtmpMsg2Send(msg);
    }
};

/**
 * Format chunk.data into Type 0 RTMP message
 * @param msg
 * @param ts
 */
RtmpChunkMsgClass.prototype.rtmpMsg0Send = function (msg, ts) {
    var me = this;
    var c = me.chunk;
    if (!ts) ts = me.getTs();
    var eTs = (ts > 0xFFFFFF) ? 4 : 0;
    var buffer = new Buffer(11 + eTs);
    if (eTs) {
        buffer.writeUInt32BE(ts, 11); // Extended Timestamp at Byte 11
        ts = 0x7FFFFF;
    }
    buffer.writeUInt16BE(ts >> 8, 0);
    buffer.writeUInt8(ts & 0xFF, 2); // Write the Timestamp
    buffer.writeUInt16BE(msg.sendData.length >> 8, 3);
    buffer.writeUInt8(msg.sendData.length & 0xFF, 5); // Write the message length
    buffer.writeUInt8(msg.msgType || c.msgType, 6); // Write the message type
    buffer.writeUInt32LE(msg.msgStreamId || c.msgStreamId, 7); // Write the message stream id
    return me.rtmpChunkSend(0, msg.streamId || c.streamId, Buffer.concat([buffer, msg.sendData])); // Send the concatenated header
};

/**
 * Format the chunk.data into Type 1 RTMP message
 * @param msg
 * @param ts
 */
RtmpChunkMsgClass.prototype.rtmpMsg1Send = function (msg, ts) {
    var me = this;
    var c = me.chunk;
    if (!ts) ts = me.getTs();
    var eTs = (ts > 0x7FFFFF) ? 4 : 0;
    var buffer = new Buffer(7 + eTs);
    if (eTs) {
        buffer.writeUInt32BE(ts, 7); // Extended Timestamp at Byte 7
        ts = 0xFFFFFF;
    }
    buffer.writeUInt16BE(ts >> 8, 0);
    buffer.writeUInt8(ts & 0xFF, 2); // Write the Timestamp
    buffer.writeUInt16BE(msg.sendData.length >> 8, 3);
    buffer.writeUInt8(msg.sendData.length & 0xFF, 5); // Write the message length
    buffer.writeUInt8(msg.msgType || c.msgType, 6); // Write the message type
    return me.rtmpChunkSend(1, msg.streamId || c.streamId, Buffer.concat([buffer, msg.sendData])); // Send the concatenated header
};

/**
 * Format the chunk into Type 2 RTMP message
 * @param msg
 * @param ts
 */
RtmpChunkMsgClass.prototype.rtmpMsg2Send = function (msg, ts) {
    var me = this;
    var c = me.chunk;
    if (!ts) ts = me.getTs();
    var eTs = (ts > 0x7FFFFF) ? 4 : 0;
    var buffer = new Buffer(3 + eTs);
    if (eTs) {
        buffer.writeUInt32BE(ts, 3); // Extended Timestamp at Byte 3
        ts = 0x7FFFFF;
    }
    buffer.writeUInt16BE(ts >> 8, 0);
    buffer.writeUInt8(ts & 0xFF, 2); // Write the Timestamp
    return me.rtmpChunkSend(2, msg.streamId || c.streamId, Buffer.concat([buffer, msg.sendData])); // Send the concatenated header
};

/**
 * Send the chunk into Type 3 RTMP message. If eh is set, then it sets extended timestamp, if not, no header
 * @param msg
 * @param ts
 */
RtmpChunkMsgClass.prototype.rtmpMsg3Send = function (msg, ts) {
    var me = this;
    var c = me.chunk;
    if (!ts) ts = me.getTs();
    var eTs = (ts > 0x7FFFFF) ? 4 : 0;
    var buffer = new Buffer(eTs);
    if (eTs) buffer.writeUInt32BE(ts, 0); // Extended Timestamp at Byte 0
    return me.rtmpChunkSend(3, msg.streamId || c.streamId, Buffer.concat([buffer, msg.sendData])); // Send the concatenated header
};

// Send RTMP message
/**
 * Generates chunk basic header and add it to the data
 * @param type chunk message type
 * @param streamId chunk streamId
 * @param data chunk data
 * @returns {*}
 */
RtmpChunkMsgClass.prototype.rtmpChunkSend = function (type, streamId, data) {
    var bhLen = 1;
    if (streamId > 63 && streamId < 320) bhLen = 2;
    if (streamId > 319) bhLen = 3;
    var bHdr = new Buffer(bhLen);
    switch (bhLen) {
        case 1:
            bHdr.writeUInt8(streamId, 0);
            break;
        case 2:
            bHdr.writeUInt16BE(streamId, 0);
            break;
        case 3:
            bHdr.writeUInt16BE(streamId >> 8, 0);
            bHdr.writeUInt8(streamId & 0xFF, 2);
            break;
        default:
    }
    bHdr.writeUInt8(bHdr.readUInt8(0) | (type << 6), 0);
    return this.sock.write(Buffer.concat([bHdr, data])); // Send it immediately over the socket
};

/**
 * Create RtmpChunkClass
 * @param opt
 * @returns {RtmpChunkClass}
 */
function RtmpChunkClass(opt) {
    if (!(this instanceof RtmpChunkClass)) return new RtmpChunkClass(opt);
    var me = this;
    me.opt = {};
    me.sock = null;
    me.Q = function () {
    }; // Empty queue
    if (typeof opt == 'object') me.opt = opt;
    if (opt.Q) {
        me.Q = opt.Q;
        me.sock = opt.Q.sock;
    }
    if (opt.sock) me.sock = opt.sock;
    me.log = Log(opt.debug, (me.sock ? me.sock.remoteAddress : '') + ':' + (me.sock ? me.sock.remotePort : '')).log;
    me.cStreams = {};

    if (me.sock) {
        me.sock.on('close', function () {
            me.log('CHUNK: ChunkClass destroyed!');
            me.opt = null;
            me.sock = null;
            me.Q = null;
            me.log = null;
            me.cStreams = null;
        });
    }
}

/**
 * Read the Chunk Basic Header
 * @param cb
 */
RtmpChunkClass.prototype.rtmpReadChunkBasicHdr = function (cb) {
    var me = this;

    function chunkClass(chunk) {
        if (!me.cStreams[chunk.streamId]) me.cStreams[chunk.streamId] = new RtmpChunkMsgClass(chunk, me.opt);
        me.cStreams[chunk.streamId].chunk.fmt = chunk.fmt; // Lets not forget the fmt!
        me.cStreams[chunk.streamId].chunk.hdrData = chunk.hdrData; // Debug purposes
        return me.cStreams[chunk.streamId];
    }

    me.Q.Q(1, function (data) {
        var chunk = {};
        var b = data.readUInt8(0);
        chunk.fmt = b >> 6; // The first bytes
        chunk.streamId = b & 0x3F;
        chunk.hdrData = data;
        me.log('CHUNK: First byte of the chunk', chunk.fmt, chunk.streamId);
        if (chunk.streamId == 0 || chunk.streamId == 1) {
            me.Q.Q(1 + chunk.streamId, function (data2) {
                me.log('CHUNK: Large Chunk StreamId', data2.length, data2);
                chunk.streamId = 64 + (data2.length == 1) ? data2.readUInt8(0) : data2.readUInt16LE(0); // the 2 byte version is in LE
                chunk.hdrData = Buffer.concat([chunk.hdrData, data2]);
                return cb(chunkClass(chunk));
            });
        } else return cb(chunkClass(chunk));
    });
};

/**
 * does one rtmpChunk read and execute a callback
 * @param cb
 */
RtmpChunkClass.prototype.read = function (cb) {
    var me = this;
    var log = me.log;
    me.rtmpReadChunkBasicHdr(function (chunk) {
        me.rtmpReadChunkMessageHdr(chunk, function (chunk) {
            me.rtmpReadChunkMessagePCM(chunk, function (chunk) {
                log('CHUNK: Call back the callback');
                if (cb) cb(chunk);
            });
        });
    });
};

RtmpChunkClass.prototype.getTs = function () {
    return getTs();
};


/**
 * Read the Chunk Message Header if present
 * @param chunk
 * @param cb
 */

RtmpChunkClass.prototype.rtmpReadChunkMessageHdr = function (chunk, cb) {
    var me = this;
    //var log = me.log;
    var Q = me.Q;
    var c = chunk.chunk;
    var oc = chunk.oldChunk;

    function copyChunk(n, o) {
        n.fmt = o.fmt;
    }

    if (c.fmt == 0)
        Q.Q(3, function (data) { // Get the timestamp, fmt 0 only
            c.tmpTimestamp = data.readUInt16BE(0) * 256 + data.readUInt8(2);
            if (c.tmpTimestamp != 0xFFFFFF) c.timestamp = c.tmpTimestamp;
            c.hdrData = Buffer.concat([c.hdrData, data]);
        });

    if (c.fmt == 1 || c.fmt == 2)
        Q.Q(3, function (data) { // Set the timestampDelta, fmt 1, 2
            c.tmpTimestamp = data.readUInt16BE(0) * 256 + data.readUInt8(2);
            if (c.tmpTimestamp != 0xFFFFFF) c.timestamp += c.tmpTimestamp;
            c.hdrData = Buffer.concat([c.hdrData, data]);
        });

    if (c.fmt == 0 || c.fmt == 1)
        Q.Q(4, function (data) { // Set msgLen, fmt 0, 1
            c.msgLen = data.readUInt16BE(0) * 256 + data.readUInt8(2);
            c.msgLeft = c.msgLen; // We still have to receive so much
            c.msgType = data.readUInt8(3);
            c.data = new Buffer(0); // It was a test to avoid a certain bug
            c.hdrData = Buffer.concat([c.hdrData, data]);
        });

    if (c.fmt == 0) Q.Q(4, function (data) { // streamId
        c.msgStreamId = data.readUInt32LE(0);
    });

    Q.Q(0, function () {  // Lets read the extended timestamp
        if (c.tmpTimestamp == 0xFFFFFF) {
            Q.Q(4, function (data) {
                var ts = data.readUInt32BE(0);
                if (oc.fmt == 0) c.timestamp = ts;
                else c.timestamp += ts;
                c.hdrData = Buffer.concat([c.hdrData, data]);
                if (c.msgLeft == 0) c.msgLeft = c.msgLen; // We still have to receive so much. This is in order for buggy handling of the T3 header by Orban coders
                copyChunk(chunk.oldChunk, chunk.chunk);
                // console.log('Got chunk fmt:', c.fmt, 'timestamp:', c.timestamp, 'type:', c.msgType, 'CS:', c.streamId, 'streamId:', c.msgStreamId, 'Len:', c.msgLen, 'Left:', c.msgLeft, 'HDR:', c.hdrData.toString('hex'));
                return cb(chunk); // Try to keep the stack small
            });
        } else {
            if (c.fmt == 3) {
                // console.log('fmt is 3, adjust timestamp if msgLeft is 0. FMT:', c.fmt, 'oFMT:', oc.fmt, 'TS Delta:', c.tmpTimestamp, 'msgLeft', c.msgLeft);
                if (c.msgLeft == 0 && oc.fmt != 0) c.timestamp += c.tmpTimestamp; // we need to update the ts, in case we have type3 header
            }
            if (c.msgLeft == 0) c.msgLeft = c.msgLen; // We still have to receive so much. This is in order for buggy handling of the T3 header by Orban coders
            copyChunk(chunk.oldChunk, chunk.chunk);
            // console.log('Got chunk fmt:', c.fmt, 'timestamp:', c.timestamp, 'type:', c.msgType, 'CS:', c.streamId, 'streamId:', c.msgStreamId, 'Len:', c.msgLen, 'Left:', c.msgLeft, 'HDR:', c.hdrData.toString('hex'));
            return cb(chunk); // Try to keep the stack small
        }
    });
};

/**
 * This function implements the receiving of the message body
 * @param chunk
 * @param cb
 */
RtmpChunkClass.prototype.rtmpReadChunkMessagePCM = function (chunk, cb) {
    var me = this;
    var log = me.log;
    var Q = me.Q;
    var c = chunk.chunk; // Chunk from the chunk class
    var size = Math.min(c.chunkSize.rcv, c.msgLeft);

    if (size == 0) {
        log('CHUNK: Somethins is wrong', size, c.chunkSize.rcv, c.msgLeft, c);
        console.error(size, c.chunkSize.rcv, c.msgLeft, c);
        console.trace();
        throw new Error('Wrong, wrong!');
    }

    //log('CHUNK: We need to receive',size);

    Q.Q(size, function (data) {
        if (size == 0) data = new Buffer(0);
        c.msgLeft -= data.length;
        c.msgComplete = (c.msgLeft <= 0) ? 1 : 0;
        c.data = Buffer.concat([c.data, data]); // Add the data we just received
        log('CHUNK: Got the chunk data', c);
        if (c.msgComplete) {
            log('CHUNK: We have received complete message to process');
            switch (c.msgType) {
                case 1:
                    chunk.rcvSetChunkSize();
                    break;
                case 2:
                    chunk.rcvAbortMsg();
                    break;
                case 3:
                    chunk.rcvAckMsg();
                    break;
                case 4:
                    chunk.rcvUserControlMsg();
                    break;
                case 5:
                    chunk.rcvSetWindowSize();
                    break;
                case 6:
                    chunk.rcvSetPeerBw();
                    break;
                case 8:
                    chunk.rcvAudioMsg();
                    break;
                case 9:
                    chunk.rcvVideoMsg();
                    break;
                case 15:
                    chunk.rcvAmf3MetaMsg();
                    break;
                case 16:
                    chunk.rcvAmf3SObjMsg();
                    break;
                case 17:
                    chunk.rcvAmf3EncCmdMsg();
                    break;
                case 18:
                    chunk.rcvAmf0MetaMsg();
                    break;
                case 19:
                    chunk.rcvAmf0SObjMsg();
                    break;
                case 20:
                    chunk.rcvAmf0EncCmdMsg();
                    break;
                case 22:
                    chunk.rcvAggMsg();
                    break;
                default:
                    log('CHUNK: ERROR! Unknown msg type!', c);
            }
        }
        return cb(chunk); // Implement the callback
    });
};

module.exports = RtmpChunkClass;