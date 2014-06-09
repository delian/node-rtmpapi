/**
 * Created by delian on 3/11/14.
 *
 * This little module should provide interface that will allow processing of an RTMP message
 */

var chunk = require('./rtmpChunk.js');
var Log = require('./log.js');

/**
 * Create RtmpMessageClass
 * @param rSess rtmpSession object
 * @returns {RtmpMessageClass}
 */
function RtmpMessageClass(opt) {
    if (!(this instanceof RtmpMessageClass)) return new RtmpMessageClass(rSess);
    this.opt = {};
    this.Q = {};
    this.sock = null;
    if (opt.Q) { this.Q = opt.Q; this.sock = opt.Q.sock; }
    if (opt.sock) this.sock = opt.sock;
    if (opt) this.opt = opt;
    this.log = Log(opt.debug,(this.sock?this.sock.remoteAddress:'')+':'+(this.sock?this.sock.remotePort:'')).log;
    this.chunk = new chunk(opt);
    this.getTs = this.chunk.getTs;
}

/**
 * Define READ one message operation
 * @param cb
 * @param cbOpts an object defining specific callbacks per message
 */
RtmpMessageClass.prototype.read = function(cb,cbOpts) {
    var me = this;
    var rtmpMsgProc = function(chunkObj) {
        if (chunkObj.chunk.msgComplete) {
            if (cb) cb(chunkObj);
            if ((typeof cbOpts == 'object')&&(typeof cbOpts[chunkObj.chunk.msgTypeText] == 'function')) cbOpts[chunkObj.chunk.msgTypeText](chunkObj); // Call the specific callback
            if ((chunkObj.Q.recvBytes - chunkObj.Q.ackBytes)>=chunkObj.Q.chunkSize.rcvWinSize) chunkObj.sendAckMsg();
        } else {
            me.log('We received one chunk, but the message is incomplete',chunkObj.chunk);
            return me.chunk.read(rtmpMsgProc);
        }
    };
    return me.chunk.read(rtmpMsgProc);
};

/**
 * Define LOOP between multiple reads operation
 * @param cb
 * @param cbOpts an object defining specific callbacks per message
 */
RtmpMessageClass.prototype.loop = function(cb,cbOpts) {
    var me = this;
    me.Q.defaultCb = function() {
        me.log('Message Loop default callback!');
        return me.read(cb,cbOpts);
    };
    me.read(cb,cbOpts);
};

module.exports = RtmpMessageClass;
