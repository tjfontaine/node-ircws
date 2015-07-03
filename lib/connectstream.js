"use strict";

var stream = require('stream');
var util = require('util');

var CLIENT_ID = 0;

function ConnectStream(socket, options) {
  if (!(this instanceof ConnectStream))
    return new ConnectStream(socket, options);

  stream.Readable.call(this, {
    objectMode: true,
  });

  this.cs_socket = socket;

  var self = this;

  options = options || {};
  var evt = options.eventName || 'connection';

  socket.on(evt, function socketOnConnect(client) {
    client.clientId = CLIENT_ID++;
    self.push(client);
  });

  socket.on('close', function socketClosing() {
    // We are no longer expecting new connections, so clear the pipeline
    // pushing null means EOF which closes the writeables along the way
    self.push(null);
  });
}
util.inherits(ConnectStream, stream.Readable);

// One day Node.js will allow me to accept here, for now we have no
// listen backpressure controls
ConnectStream.prototype._read = function connectStreamRead() {
}

module.exports = ConnectStream;
