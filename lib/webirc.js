"use strict";

var stream = require('stream');
var util = require('util');

function WebIRC(client, config) {
  if (!(this instanceof WebIRC))
    return new WebIRC(client, config);

  stream.Transform.call(this, {});

  this.webirc_firstLine = false;

  // coerce to number and treat as boolean
  // undefined, 0, and NaN will result in false
  // otherwise true
  this.webirc_disabled = !!(+process.env.WEBIRC_DISABLED);

  this.webirc_password = config.destination.webirc_password || 'secret';
  this.webirc_ip = client.remoteAddress;
  this.webirc_host = client.hostname;
  this.webirc_cloak = client.cloak;

  if (client.fingerprint)
    this.webirc_fingerprint = client.fingerprint.split(':').join('');
}
util.inherits(WebIRC, stream.Transform);

WebIRC.prototype._transform = function webircTransform(chunk, enc, cb) {
  // We have already sent the WEBIRC command, fast path
  if (!this.webirc_disabled && !this.webirc_firstLine) {
    this.webirc_firstLine = true;

    var msg = [
      'WEBIRC',
      this.webirc_password,
      this.webirc_host,
      this.webirc_ip,
      this.webirc_cloak, // TODO new field for the module
    ].join(' ');

    console.error('WEBIRC', msg);
    this.push(msg);

    if (this.webirc_fingerprint) {
      msg = [
        'WEBIRCFP', // TODO new command for module
        this.webirc_password,
        this.webirc_fingerprint,
      ].join(' ');

      console.error('CERTFP', msg);
      this.push(msg);
    }
  }

  this.push(chunk);
  cb();
};

module.exports = WebIRC;
