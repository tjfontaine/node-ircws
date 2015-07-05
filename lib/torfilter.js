"use strict";

var stream = require('stream');
var util = require('util');

function TorFilter(options) {
  if (!(this instanceof TorFilter))
    return new TorFilter(options);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMark: 0,
  });

  this.tf_config = options;
}
util.inherits(TorFilter, stream.Transform);


TorFilter.prototype._transform = function tfTransform(client, e, cb) {
  if (!client.isTor || !this.tf_config.blockTor || client.validCert) {
    this.push(client);
    return cb();
  }

  if (!this.tf_config.blockTorMessage)
    this.tf_config.blockTorMessage = 'Anonymous TOR usage is unavailable';

  client.write('ERROR :' + this.tf_config.blockTorMessage + '\r\n');
  client.destroy();
  return cb();
};

module.exports = TorFilter;
