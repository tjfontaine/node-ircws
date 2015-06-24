#!/usr/bin/env node

"use strict";

var net = require('net');
var tls = require('tls');

var ConnectStream = require('./connectstream');
var DNSFilter = require('./dnsfilter');
var IRCProxy = require('./ircproxy');
var Throttle = require('./throttle');
var config = require('./config');

var throttle = new Throttle(config);

Object.keys(config.listeners).forEach(function eachListener(ip) {
  var listener = config.listeners[ip];
  var proto = undefined;

  var options = {
    host: ip,
    port: listener.port,
  };

  switch (listener.type) {
    case 'plain':
      proto = net;
      break;
    case 'ssl':
      proto = tls;
      break;
    case 'websocket':
    case 'socketio':
      throw new Exception('Not Implemented Yet');
      break;
    default:
      throw new Exception(
        'Must define listener type: [plain, ssl, websocket, socketio]'
      );
      break;
  }

  var server = proto.createServer();

  server.listen(options);

  server.on('listening', function serverListening() {
    ConnectStream(server)
      .pipe(throttle)
      .pipe(DNSFilter(config))
      .pipe(IRCProxy(config))
      .resume(); // Don't stop accepting new clients
  });

  server.on('error', function serverError(err) {
    console.error('listener failed', err);
    // TODO restart listener?
  });
});
