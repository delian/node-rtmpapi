/**
 * Created by delian on 3/11/14.
 * Easy implementation of Logging. Always print Data and some prefix in front of it
 */

module.exports = function(sDebug,sRaddr) {
    var debug = sDebug;
    var raddr = sRaddr||'none';

    return {
        log: function() {
            if (debug) {
                for (var z = [], k = arguments.length-1; k>=0; k--) z[k]=arguments[k];
                console.log.apply(this,[new Date,raddr,'>'].concat(z));
            }
        },
        debug: function(sDebug) {
            debug = sDebug;
        },
        raddr: function(sRaddr) {
            raddr = sRaddr;
        }
    };
}
