/**
 * Created by delian on 3/11/14.
 * This file implements a queue for read certain amount of bytes from the input stream
 */

var Log = require('./log.js');
var debug = 0;
var queueLength = 10000000;

/**
 * Read Queue implementation
 * @param sock
 * @returns {QueueClass}
 * @constructor
 */
function QueueClass(sock) {
    if (!(this instanceof QueueClass)) return new QueueClass(sock);

    var me = this;

    me.readQueue = [];
    me.sock = sock;

    me.lock = false;

    me.recvBytes = 0;
    me.ackBytes = 0;

    me.buffer = new Buffer(queueLength);
    me.readIndex = 0;
    me.writeIndex = 0;
    me.bufferEnd = me.buffer.length;

    me.defaultCb = null;

    me.log = Log(debug, sock.remoteAddress + ':' + sock.remotePort).log;
    me.log('QUEUE: Open Read Queue');

    sock.on('data',function(data) {
        var freespace = 0;

        function writeBuf() {
            data.copy(me.buffer,me.writeIndex);
            me.writeIndex+=data.length;
            me.bufferEnd=Math.max(me.writeIndex,me.bufferEnd);
            me.log('QUEUE: Readable event has been received');
            if (me.readQueue.length==0) {
                if (typeof me.defaultCb == 'function') {
                    me.log('QUEUE: The queue is empty. Call the default callback if any');
                    me.defaultCb();
                }
            }
            return me.tryRead();
        }

        if (me.writeIndex<me.readIndex) freespace=me.readIndex-me.writeIndex;
        else freespace=me.buffer.length-me.writeIndex;

        if (freespace>data.length) return writeBuf();

        // In case we have no enough freespace
        if (me.writeIndex>=me.readIndex) {
            me.bufferEnd=me.writeIndex;
            me.writeIndex=0;
        }

        freespace = me.readIndex-me.writeIndex;
        if (freespace>data.length) return writeBuf();

        // No enough data
        throw new Error('No enough data space, slow reading!');

    });

    sock.on('close', function() {
        me.log('QUEUE: Socket has been closed, remove the queue tasks!');
        me.readQueue = [];
        me.defaultCb = null;
        me.sock = null;
    })
}

/**
 * Add an element to the Queue and check for data
 * @param len
 * @param cb
 * @returns {undefined}
 * @constructor
 */
QueueClass.prototype.Q = function (len, cb) {
    var me = this;
    me.readQueue.push({ len: len, cb: cb });
    return me.tryRead(); // Immediate try, allowing us to keep the order
};

/**
 * Return how many bytes we can read
 * @returns {number}
 */
QueueClass.prototype.getBufLen = function() {
    if (this.writeIndex<this.readIndex) return this.bufferEnd-this.readIndex+this.writeIndex;
    return this.writeIndex-this.readIndex;
};

QueueClass.prototype.read = function(bytes) {
    var buf;
    if (bytes<1||bytes>this.getBufLen()) return null;
    if (this.readIndex<this.writeIndex || this.bufferEnd-this.readIndex>=bytes) {
        buf = this.buffer.slice(this.readIndex,this.readIndex+bytes);
        this.readIndex+=bytes;
        return buf;
    }

    // A special case, where the chunk is on the border

    console.log('Border copy, bytes',bytes,'readIndex',this.readIndex,'bufferEnd',this.bufferEnd,this.bufferEnd-this.readIndex,bytes-(this.bufferEnd-this.readIndex));
    buf = new Buffer(bytes);
    this.buffer.copy(buf,0,this.readIndex,this.bufferEnd);
    this.buffer.copy(buf,this.bufferEnd-this.readIndex, 0, bytes-(this.bufferEnd-this.readIndex));
    this.readIndex = bytes-(this.bufferEnd-this.readIndex);
    return buf;
};

/**
 * This function try to read all the tasks set in to the read queue, as long as there are enough data in the receive buffer
 * @returns {undefined}
 */
QueueClass.prototype.tryRead = function() {
    var data;
    var readQueue = this.readQueue;
    var sock = this.sock;
//    var log = this.log;

    if (this.lock || readQueue.length==0) return;
    if (readQueue[0].len>this.getBufLen()) return;

    this.lock = true;
    while (1) {
        var rq = readQueue.shift();
        if (!rq) {
            this.lock = false;
            return; // Nothing to do for now
        }

        if (rq.len == 0) {
            rq.cb();
        } else if (rq.len < 0) {
            if (this.getBufLen()<=0) {
                this.lock = false;
                return readQueue.unshift(rq);
            }
            rq.cb();
        } else {
            data = this.read(rq.len);
            if (!data) {
                this.lock = false;
                return readQueue.unshift(rq);
            } // Not enough data yet, push back the request and quit the queue
            this.recvBytes += data.length; // Increase the counter
            // log('Received enough data', data);
            rq.cb(data);
        }
    }
};

module.exports = QueueClass;