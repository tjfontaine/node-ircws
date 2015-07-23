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

  this.cloak_config = {};
  var self = this;

  /* There really is no public API way to get the certificate object back
   * without instantiating and creating the context, and there's no way to
   * get the object version without connecting to it.
   */
  Object.keys(config.cloaks).forEach(function cloakKey(key) {
    var cloak = config.cloaks[key];
    var server = tls.createServer(cloak).listen().on('listening', function cloakLoad() {
      var address = this.address();
      address.rejectUnauthorized = false;
      var client = tls.connect(address).on('secureConnect', function () {
        var peer = client.getPeerCertificate()
        if (peer) {
          self.cloak_config[key] = peer;
        }
        client.destroy();
        server.close();
      });
    });
  });
}
util.inherits(CertCloak, stream.Transform);


function CertEqual(a, b) {
  // TODO going to want a lot more here.
  return a.fingerprint === b.fingerprint;
}


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

  if (!peerCert.issuer) {
    this.push(client);
    return cb();
  }

  for (var key in this.cloak_config) {
    var cloakCert = this.cloak_config[key];
    // TODO check CRL, for now let them through and let services
    // ban on account
    if (CertEqual(cloakCert, peerCert.issuer)) {
      client.cloak = peerCert.subject.cn;
      client.validCert = true;
      break;
    }
  }

  this.push(client);
  return cb();
};

module.exports = CertCloak;
