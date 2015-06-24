"use strict";

var stream = require('stream');
var util = require('util');

function ConnectStream(socket, options) {
  if (!(this instanceof ConnectStream))
    return new ConnectStream(socket, options);

  stream.Readable.call(this, {
    objectMode: true,
  });

  this.cs_socket = socket;

  var self = this;

  socket.on('connection', function socketOnConnect(client) {
    self.push(client);
  });
}
util.inherits(ConnectStream, stream.Readable);

// One day Node.js will allow me to accept here, for now we have no
// listen backpressure controls
ConnectStream.prototype._read = function connectStreamRead() {
}

module.exports = ConnectStream;
