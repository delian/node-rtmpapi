node-rtmpapi
============

A Node.JS module that provides easy RTMP API for implementation of RTMP Server or client.

This API provides both separate as well as hidden apis that provides sequencing, execution, encoding, decoding of chunk and messages of the RTMP protocol.
It is a "low level" protocol API, it does not implement the high-level operations of an RTMP server. It just provides tools you can use to implement your own RTMP Server (or Client).

The API has been tested against MISTServer, avconf and Orban Encoders.

Please keep in mind - the RTMP protocol is badly defined and has a lot of incorrect implementations.
For example some RTMP libraries (including the Adobe's one) crashes if you sequence the commands in unexpected order, even though this is allowed by the RTMP protocol specification!
Also the old versions of the Adobe's RTMP library has incorrect implementation of the SetWindow command.

You have to be careful and do a lot of tests to implement a stable server.

Usage
==

To use this library is simple. You just have to do:

    
    var rtmpApi = require('node-rtmpapi');
    var rtmpServer = rtmpApi.rtmpServer();
    
    var rtmpServer.createServer(function(rtmpSession) {
       rtmpSession.msg.loop(null,{
          "amf0cmd": function(chunk) {
             var msg = chunk.chunk.msg;
             switch(msg.cmd) {
                "connect":
                    chunk.sendSetChunkSize(4096);
                    chunk.sendSetWindowSize(10000000);
                    chunk.sendSetPeerBw(10000000,1);
                    chunk.sendAmf0EncCmdMsg({
                       cmd: "_result",
                       transId: msg.transId,
                       cmdObj: {
                          fmsVer: "FMS/3,5,5,2004",
                          capabilities: 31,
                          mode: 1
                       },
                       info: {
                          level: "status",
                          code: "NetConnection.Connect.Success",
                          description: "Connection succeeded.",
                          clientId: 1337,
                          objectEncoding: 0
                       }
                    });
                    chunk.sendUserControlMsg(0,1);
                    break;
                "FCPublish":
                    ....
                    break;
                "createStream":
                    ....
                    break;
                "publish":
                    ....
                    break;
                "releaseStream":
                    ....
                    break;
                default:
             }
          },
          "audio": function(chunk) {
             ....
          },
          "video": function(chunk) {
             ....
          }
       });
    }).listen(1935);



rtmpChunk
====

To use it do:

    var rtmpChunk = require('node-rtmpapi').rtmpChunk();


rtmpServer
====

To use it do:

    var rtmpServer = require('node-rtmpapi').rtmpServer();
    

