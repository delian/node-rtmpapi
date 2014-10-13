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

Another thing, the RTMP protocol consist of 3 distinct layers:

- Chunk layer (chunk frames and commands that just exchange data in chunk fragments)
- Transport layer (transport related commands and streams who uses the chunk layer for data exchange, but adds on top of it some control commands, encoding schemes and a mechanism for exchange of control commands)
- Application layer - the layer that uses the transport layer to exchange messages, real data and triger remote procedures

The specs I've been using from Adobe covers only the chunk and the transport layer. There is no clear specification on the application layer that I have seen. But the application layer is the one that essentially implement the client-server comminication flow.
All the RTMP libraries implement mainly the Chunk and the Transport layer, as the rest is not clearly specified and should be reverse engineered. This library implement Chunk and Transport layer as well. It does not focus on the application layer. So all the provided examples may not be very correct and may not follow very correctly the communication flow between client and server.
For you to implement a RTMP client or a RTMP server, you need to have already working client/server, listen to their communication with Wireshark and then replicate it using eventually this library.

Usage
==

To use this library is simple.
To implement a server you just have to do something like:

    
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

In the example provided above, I am copying the application flow control of a server as it has been implemented in Mist Server, version 1.1.

This flow control essentially expect RTMP client to connect to this RTMP server and to PUBLISH a stream to the server (not the server to publish a stream to the client).

Basically, I expect to receive first transport amf0 encoded command with "connect" and I set the Chunk Size to 4k, the Ack window Size to 10MB, Peer Bandwidth Control to Loose 10MB, and reply with _result Connect.Success and send UserControl to 1 (saying to the client to start playing the stream).

Then I expect FCPublish, or createStream, or publish, or releaseStream commands, where you would get some parameters saying something about the streams (if you are expecting to receive more streams you have to check this values and store it in a dictionary and then associate the audio/video chunks with the correct stream).

Then I am expecting to receive "audio"/"video" chunks containing the stream data.

In the next example (To Be Done) I am writing the RTMP Client part - assuming this is the RTMP client who is publishing stream data to the RTMP Server:

TBD


rtmpChunk
====

To use it do:

    var rtmpChunk = require('node-rtmpapi').rtmpChunk();


rtmpServer
====

To use it do:

    var rtmpServer = require('node-rtmpapi').rtmpServer();
    

