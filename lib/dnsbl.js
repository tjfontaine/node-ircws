"use strict";

var dns = require('dns');
var EE = require('events').EventEmitter;
var util = require('util');

var vasync = require('vasync');


/*
{
  ip: '192.168.1.1',
  timeout: 4000,
  servers: {
    'dnsbl.example.com': {
      zone: 'dnsbl.example.com',
      defaultScore: 1,
      defaultCloak: 'exdnsbl.oftc.net',
      records: {
        '127.0.0.1': {
          score: 1,
          cloak: 'robot.exdnsbl.oftc.net',
          stop: true,
        },
      },
    },
  },
}
*/

function DNSBLQuery(options, cb) {
  if (!(this instanceof DNSBLQuery))
    return new DNSBLQuery(options, cb);

  if (cb)
    this.once('end', cb);

  this.score = {
    total: 0,
    results: {},
    errors: {},
  };

  var q = this.dnsbl_parallel = vasync.queue(dnsblQuery, options.parallel || 4);

  // TODO IPv6
  var revip = options.ip.split('.').reverse().join('.');

  var servers = Object.keys(options.servers);

  for (var s in servers) {
    q.push({
      revip: revip,
      server: options.servers[servers[s]],
      timeout: options.timeout || 4000,
      query: this,
    });
  }

  q.close();

  var self = this;

  q.on('end', function onQueueEnd() {
    self.emit('end', null, self.score);
  });
}
util.inherits(DNSBLQuery, EE);


function dnsblQuery(args, cb) {
  var server = args.server;
  var query = args.query;
  var name =  args.revip + '.' + server.zone;

  var timeout = setTimeout(endSingleQuery, args.timeout);

  function endSingleQuery() {
    clearTimeout(timeout);
    cb();
  }

  // TODO use native-dns
  dns.resolve(name, function dnsResult(err, hosts) {
    if (err && err.code != 'ENOTFOUND') {
      query.score.errors[server.zone] = err;
    } else {
      var ret = query.score.results[server.zone] = {};
      var anyScore = false;
      var anyCloak = false;

      for (var h in hosts) {
        var entry = server.records[h];
        if (entry) {
          anyScore = true;
          ret[h] = query.score.total;
          query.score.total += entry.score;


          if (entry.cloak) {
            anyCloak = true;
            query.score.cloak = entry.cloak;
          }
        }
      }

      if (!anyScore)
        query.score.total += server.defaultScore;

      if (!anyCloak && server.defaultCloak)
        query.score.cloak = server.defaultCloak;
    }
    endSingleQuery();
  });
}

module.exports = DNSBLQuery;
