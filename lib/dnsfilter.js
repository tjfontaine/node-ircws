'use strict';

var dns = require('dns');
var net = require('net');
var stream = require('stream');
var util = require('util');

var ipaddr = require('ipaddr.js');
var vasync = require('vasync');

var DNSBLQuery = require('./dnsbl');

function DNSFilter(config, logger) {
  if (!(this instanceof DNSFilter))
    return new DNSFilter(config, logger);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMark: 0,
  });

  this.log = logger.child({ pipeline: 'dnsfilter' });

  this.dnsfltr_config = config.dnsbl;
}
util.inherits(DNSFilter, stream.Transform);


function validateReverseDns(client, next) {
  dns.reverse(client.remoteAddress, function reverseCb(err, reverseResults) {
    if (err) {
      client.log.error(err, 'reverse dns error');
      return next(err);
    }

    if (reverseResults.length == 0) {
      client.log.trace('no reverse dns results');
      return next(err, null);
    }

    client.log.trace(reverseResults, 'reverse results');

    var dnsType = net.isIPv6(client.remoteAddress) ? 'AAAA' : 'A';
    var parsedIp = ipaddr.parse(client.remoteAddress);

    dns.resolve(reverseResults[0], dnsType, function forwardCb(err, forwardResults) {
      if (err) {
        client.log.error(err, 'forward dns error');
        return next(err);
      }

      var matchFn = parsedIp.match.bind(parsedIp);
      var parsedResults = forwardResults.map(ipaddr.parse).filter(matchFn);

      client.log.trace({
        forwardResults: forwardResults,
        parsedResults: parsedResults.length,
      }, 'forward dns results');

      if (parsedResults.length === 1)
        return next(err, reverseResults[0]);
      else
        return next(err, null);
    });
  });
}


DNSFilter.prototype._transform = function dnsfltrTransform(client, enc, cb) {
  var self = this;

  this.log.trace({ client: client }, 'got client');

  vasync.parallel({
    funcs: [
      function reverseDns(next) {
        validateReverseDns(client, next);
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

    if (reverse)
      client.hostname = reverse;
    else
      client.hostname = client.remoteAddress;

    var score = results.operations[1].result;

    if (score) {
      client.score = score.total;

      if (score.total > self.dnsfltr_config.maxScore) {
        self.log.error({
          client: client,
          score: score,
          config: self.dnsfltr_config
        }, 'client exceeded dnsbl score');
        client.end('Administratively refused');
        return client.destroy();
      }

      if (score.cloak)
        client.cloak = score.cloak;

      client.isTor = !!score.isTor;
    }

    self.push(client);
  });

  return cb();
};

module.exports = DNSFilter;
