"use strict";

var child_process = require('child_process');
var stream = require('stream');
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
  var found = false;
  var cloaks = [].concat(this.cloak_config);

  function checkCloak() {
    if (found || cloaks.length === 0) {
      self.push(client);
      return cb();
    }

    var cloakCert = cloaks.pop();

    // TODO check CRL, for now let them through and let services
    // ban on account
    var toDer = child_process.spawn('openssl', [
      'x509', '-inform', 'der', '-in',
      '/dev/stdin', '-out', '/dev/stdout']
    );

    var toVerify = child_process.spawn('openssl', [
      'verify', '-CAfile', cloakCert]);

    toVerify.on('close', function verifyClose(err, signal) {
      if (!err || !signal) {
        found = true;
        client.cloak = peerCert.subject.cn;
        client.validCert = true;
      }
      checkCloak();
    });

    toDer.stdout.pipe(toVerify.stdin);
    toDer.stdin.end(peerCert.raw);
    toDer.stderr.pipe(process.stderr);
    toVerify.stdout.pipe(process.stdout);
    toVerify.stderr.pipe(process.stderr);
  }
  checkCloak();
};

module.exports = CertCloak;
