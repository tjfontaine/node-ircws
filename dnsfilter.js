"use strict";

var dns = require('dns');
var stream = require('stream');
var util = require('util');

var vasync = require('vasync');

var DNSBLQuery = require('./dnsbl');

function DNSFilter(config) {
  if (!(this instanceof DNSFilter))
    return new DNSFilter(config);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMark: 0,
  });

  this.dnsfltr_config = config.dnsbl;
}
util.inherits(DNSFilter, stream.Transform);


DNSFilter.prototype._transform = function dnsfltrTransform(client, enc, cb) {
  var self = this;

  var work = vasync.parallel({
    funcs: [
      function reverseDns(next) {
        dns.resolve(client.remoteAddress, 'PTR', function dnsResult(err,
          hostnames) {
          console.error('reverse dns result', err, hostnames);
          next(err, hostnames);
        });
      },
      function dnsblQuery(next) {
        DNSBLQuery({
          ip: client.remoteAddress,
          servers: self.dnsfltr_config.servers,
        }, next);
      },
    ],
  }, function (err, results) {
    var reverse = results.operations[0].result;

    if (reverse && reverse.length)
      client.hostname = reverse[0];
    else
      client.hostname = client.remoteAddress;

    var score = results.operations[1].result;

    console.error('dnsbl results', score);

    if (score) {
      client.score = score;

      if (score.total > self.dnsfltr_config.maxScore) {
        // TODO log
        client.end('Administratively refused');
        return client.destroy();
      }

      if (score.cloak)
        client.cloak = score.cloak;
    }

    self.push(client);
  });

  return cb();
};

module.exports = DNSFilter;
