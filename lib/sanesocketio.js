"use strict";

var EE = require('events').EventEmitter;
var https = require('https');
var stream = require('stream');
var util = require('util');

var socketio = require('socket.io');

function SIOServer(options) {
  if (!(this instanceof SIOServer))
    return new SIOServer(options || {});

  EE.call(this);

  this.sio_server = https.createServer(options);

  var self = this;

  this.sio_server.on('request', function sioRequest(req, res) {
    var url = req.url || '';
    res.statusCode = 302;
    res.setHeader('Location', options.redirectUrl + url);
    res.end();
  });

  this.sio_server.on('listening', function sioListen() {
    self.emit('listening');
  });

  this.sio_server.on('error', function sioError(err) {
    self.emit('error', err);
  });

  this.sio_instance = socketio.listen(this.sio_server);

  this.sio_instance.on('connection', function sioConnection(client) {
    self.emit('connection', new SIOClient(client));
  });
}
util.inherits(SIOServer, EE);

SIOServer.createServer = function SIOcreateServer(options) {
  return new SIOServer(options || {});
};


SIOServer.prototype.listen = function SIOlisten(options) {
  this.sio_server.listen(options);
};


SIOServer.prototype.close = function SIOclose(cb) {
  this.sio_server.close(cb);
};


function SIOClient(client) {
  if (!(this instanceof SIOClient))
    return new SIOClient(client);

  stream.Transform.call(this);

  this.sioc_client = client;

  var self = this;

  this.sioc_client.on('message', function SIOCmessage(message) {
    self.push(message);
  });
}
util.inherits(SIOClient, stream.Duplex);


SIOClient.prototype._read = function SIOread() {
};


SIOClient.prototype._write = function SIOwrite(chunk, enc, cb) {
  this.sioc_client.send(chunk.toString('utf8'));
  cb();
};


module.exports = SIOServer;
