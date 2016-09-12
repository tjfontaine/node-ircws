'use strict';

var EE = require('events').EventEmitter;
var https = require('https');
var stream = require('stream');
var util = require('util');

var socketio = require('socket.io');
var ws = require('ws');

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

  var type = options.sio_type || 'socketio';

  switch (type) {
  case 'socketio':
    this.sio_instance = socketio.listen(this.sio_server);
    break;
  case 'ws':
    this.sio_instance = new ws.Server({ server: this.sio_server });
    break;
  default:
    throw new Error('Type must be socketio or ws');
  }

  this.sio_instance.on('connection', function sioConnection(client) {
    self.emit('connection', new SIOClient(client));
  });
}
util.inherits(SIOServer, EE);

SIOServer.createServer = function SIOcreateServer(options) {
  return new SIOServer(options || {});
};


SIOServer.prototype.listen = function SIOlisten(port, host) {
  this.sio_server.listen(port, host);
};


SIOServer.prototype.close = function SIOclose(cb) {
  this.sio_server.close(cb);
};


function SIOClient(client) {
  if (!(this instanceof SIOClient))
    return new SIOClient(client);

  stream.Duplex.call(this, {});

  this.sioc_client = client;

  var self = this;

  this.sioc_client.on('message', function SIOCmessage(message) {
    self.push(message);
  });

  // socketio doesn't extend Socket it encapsulates it
  if (client.client && client.client.conn)
    self.remoteAddress = client.client.conn.remoteAddress;
}
util.inherits(SIOClient, stream.Duplex);


SIOClient.prototype._read = function SIOread() {
};


SIOClient.prototype._write = function SIOwrite(chunk, enc, cb) {
  this.sioc_client.send(chunk.toString('utf8'));
  cb();
};


SIOClient.prototype.destroy = function SIOdestroy() {
  // websockets extend so they actually have destroy, proxy to it
  // socketio has disconnect, proxy to that, otherwise NOP

  /* eslint no-console: off */
  var logger = this.log ? this.log.trace : console.error;

  if (this.sioc_client.destroy) {
    logger('using destroy for client');
    this.sioc_client.destroy();
  } else if (this.sioc_client.disconnect) {
    logger('using disconnect for client');
    this.sioc_client.disconnect();
  } else if (this.sioc_client.conn) {
    logger('using close for underlying connection');
    this.sioc_client.conn.close();
  } else {
    logger('leaking fd');
  }
};


module.exports = SIOServer;
