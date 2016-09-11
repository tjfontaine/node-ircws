'use strict';

var stream = require('stream');
var util = require('util');

var CONNECTIONS = {};

function Throttle(config, logger) {
  if (!(this instanceof Throttle))
    return new Throttle(config, logger);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMakr: 0,
  });

  this.log = logger.child({ pipeline: 'throttle' });
  this.thrt_timeout = config.reconnectTime;

  var self = this;

  this.thrt_gc = setInterval(function throttleGC() {
    var now = Date.now();
    var maxAge = 5 * self.thrt_timeout;
    var ip, time;

    for (ip in CONNECTIONS) {
      time = CONNECTIONS[ip];
      if ((now - time) > maxAge)
        delete CONNECTIONS[ip];
    }
  }, 5 * this.thrt_timeout);
}
util.inherits(Throttle, stream.Transform);


Throttle.prototype._transform = function thrtlTransform(client, enc, cb) {
  this.log.trace({ client: client }, 'got client');

  var time = CONNECTIONS[client.remoteAddress];
  var cur = Date.now();
  var timeout = this.thrt_timeout;

  if (time && (cur - time) < timeout) {
    this.log.error('throttling client', {
      remoteAddress: client.remoteAddress,
      ts: cur,
      prev: time,
      timeout: timeout,
    });
    client.end('ERROR :Trying to reconnect too fast.\r\n');
    client.destroy();
    return cb();
  }

  this.log.trace('client time registered', { remoteAddress: client.remoteAddress, ts: cur });
  CONNECTIONS[client.remoteAddress] = cur;
  this.push(client);
  return cb();
};


module.exports = Throttle;
