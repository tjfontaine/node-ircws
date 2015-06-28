#!/usr/bin/env node

"use strict";

var net = require('net');
var tls = require('tls');

var CertCloak = require('./lib/certcloak');
var ConnectStream = require('./lib/connectstream');
var DNSFilter = require('./lib/dnsfilter');
var IRCProxy = require('./lib/ircproxy');
var Throttle = require('./lib/throttle');
var config = require('./config');

config.listeners.forEach(function eachListener(listener) {
  var proto = undefined;

  var listenOptions = {
    host: listener.host,
    port: listener.port,
  };

  var serverOptions = {};

  switch (listener.type) {
    case 'plain':
      proto = net;
      break;
    case 'tls':
      proto = tls;
      serverOptions = listener;
      break;
    case 'websocket':
    case 'socketio':
      throw new Error('Not Implemented Yet');
      break;
    default:
      throw new Error(
        'Must define listener type: [plain, ssl, websocket, socketio]'
      );
      break;
  }

  var server = proto.createServer(serverOptions);

  server.listen(listenOptions);

  server.on('listening', function serverListening() {
    ConnectStream(server)
      .pipe(Throttle(config))
      .pipe(DNSFilter(config))
      .pipe(CertCloak(config))
      .pipe(IRCProxy(config))
      .resume(); // Don't stop accepting new clients
  });

  server.on('error', function serverError(err) {
    console.error('listener failed', err);
    // TODO restart listener?
  });
});
