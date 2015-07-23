"use strict";

var stream = require('stream');
var tls = require('tls');
var util = require('util');

function CertCloak(config) {
  if (!(this instanceof CertCloak))
    return new CertCloak(config);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMark: 0,
  });

  this.cloak_config = config.cloaks;
}
util.inherits(CertCloak, stream.Transform);


CertCloak.prototype._transform = function certCloakTransform(client, e, cb) {
  // We have a TLS Socket
  if (!client.getPeerCertificate) {
    this.push(client);
    return cb();
  }

  var peerCert = client.getPeerCertificate();

  if (!peerCert) {
    this.push(client);
    return cb();
  }

  client.fingerprint = peerCert.fingerprint;

  if (!peerCert.raw) {
    this.push(client);
    return cb();
  }

  var self = this;
  var cloaks = [].concat(this.cloak_config);

  function checkCloak() {
    if (cloaks.length === 0) {
      self.push(client);
      return cb();
    }

    var cloakCert = cloaks.pop();

    // TODO check CRL, for now let them through and let services
    // ban on account
    child_process.spawn('openssl', ['verify', '-CAfile', cloakCert], {
      stdio: ['pipe', 'ignore', 'ignore'],
    }).on('close', function verifyClose(err, signal) {
      if (!err || !signal) {
        client.cloak = peerCert.subject.cn;
        client.validCert = true;
      }
      checkCloak();
    }).stdin.write(peerCert.raw);
  });

  this.push(client);
  return cb();
};

module.exports = CertCloak;
