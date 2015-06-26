"use strict";

var stream = require('stream');
var util = require('util');

function Throttle(config) {
  if (!(this instanceof Throttle))
    return new Throttle(config);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMakr: 0,
  });

  this.thrt_connections = {};
  this.thrt_timeout = config.reconnectTime;

  var self = this;

  this.thrt_gc = setInterval(function throttleGC() {
    var now = Date.now();
    var maxAge = 5 * self.thrt_timeout;
    var ip, time;

    for (ip in self.thrt_connctions) {
      time = self.thrt_connections[ip];
      if ((now - time) > maxAge)
        delete self.thrt_connections[ip];
    }
  }, 5 * this.thrt_timeout);
}
util.inherits(Throttle, stream.Transform);


Throttle.prototype._transform = function thrtlTransform(client, enc, cb) {
  var time = this.thrt_connections[client.remoteAddress];
  var cur = Date.now();
  var timeout = this.thrt_timeout;

  if (time && (cur - time) < timeout) {
    console.error('Throttling client', client.remoteAddress);
    client.end('ERROR :Trying to reconnect too fast.\r\n');
    client.destroy();
    return cb();
  }

  this.thrt_connections[client.remoteAddress] = cur;
  this.push(client);
  return cb();
};


module.exports = Throttle;
