"use strict";

var stream = require('stream');
var util = require('util');

function WebIRC(client, config) {
  if (!(this instanceof WebIRC))
    return new WebIRC(client, config);

  stream.Transform.call(this, {
    objectMode: true,
    decodeStrings: false,
    highWaterMark: 0,
  });

  this.webirc_firstLine = false;

  this.webirc_password = config.destination.webirc_password || 'secret';
  this.webirc_ip = client.remoteAddress;
  this.webirc_host = client.hostname;
  this.webirc_cloak = client.cloak;
}
util.inherits(WebIRC, stream.Transform);

WebIRC.prototype._transform = function webircTransform(chunk, enc, cb) {
  // We have already sent the WEBIRC command, fast path
  if (!this.webirc_firstLine) {
    this.webirc_firstLine = true;

    var msg = [
      'WEBIRC',
      this.webirc_password,
      this.webirc_host,
      this.webirc_ip,
      this.webirc_cloak,
    ].join(' ');

    this.push(msg);
  }

  this.push(chunk);
  cb();
};

module.exports = WebIRC;
