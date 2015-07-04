#!/usr/bin/env node

"use strict";

var child_process = require('child_process');
var net = require('net');
var tls = require('tls');

var CertCloak = require('./lib/certcloak');
var ConnectStream = require('./lib/connectstream');
var DNSFilter = require('./lib/dnsfilter');
var IRCProxy = require('./lib/ircproxy');
var socketio = require('./lib/sanesocketio');
var Throttle = require('./lib/throttle');

var config = require('./config');

var definedListeners = {};

config.listeners.forEach(function eachListener(listener) {
  var proto = undefined;

  var listenOptions = {
    host: listener.host,
    port: listener.port,
  };

  var serverOptions = {};

  var eventName = 'connection';
  switch (listener.type) {
    case 'plain':
      proto = net;
      break;
    case 'tls':
      proto = tls;
      serverOptions = listener;
      eventName = 'secureConnection';
      break;
    case 'socketio':
      proto = socketio;
      serverOptions = listener;
      break;
    case 'websocket':
      throw new Error('Not Implemented Yet');
      break;
    default:
      throw new Error(
        'Must define listener type: [plain, ssl, websocket, socketio]'
      );
      break;
  }

  var listenerKey = listener.host + ':' + listener.port;

  definedListeners[listenerKey] = {
    listenOptions: listenOptions,
    serverOptions: serverOptions,
    proto: proto,
    eventName: eventName,
  };

  if (listener.enabled)
    enableListener(listenerKey);
});

function enableListener(key) {
  var listener = definedListeners[key];

  if (!listener) {
    console.error('trying to enable undefined listener', key);
    return;
  }

  if (listener.server) {
    console.error('trying to renable enabled listener', key);
    return;
  }

  var server = listener.proto.createServer(listener.serverOptions);

  server.listen(listener.listenOptions);

  server.on('listening', function serverListening() {
    ConnectStream(server, { eventName: listener.eventName })
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

  listener.server = server;
}

function disableListener(key) {
  var listener = definedListeners[key];

  if (!listener) {
    console.error('trying to disable undefined listener', key);
    return;
  }

  if (!listener.server) {
    console.error('listener already disabled', key);
    return;
  }

  listener.server.close();

  listener.server.removeAllListeners('connection');
  listener.server.removeAllListeners('secureConnection');

  listener.server = undefined;
}

process.on('SIGHUP', function configReload() {
  child_process.execFile(process.execPath,
    ['-pe', 'JSON.stringify(require("./config"))'],
    {
      encoding: 'utf8',
    },
    function readConifg(error, stdout, stderr) {
      if (error) {
        console.error('Failed to read configuration file');
        console.error(stderr);
      } else {
        try {
          var newConfig = JSON.parse(stdout);
          newConfig.listeners.forEach(function enableDisable(listener) {
            var key = listener.host + ':' + listener.port;
            var definedListener = definedListeners[key];

            if (!definedListener) {
              console.error('cannot add new listeners with reload, ignoring', key);
              return;
            }

            if (listener.enabled && !definedListener.server) {
              console.error('enabling', key, 'listener');
              enableListener(key);
            }

            if (!listener.enabled && definedListener.server) {
              console.error('disabling', key, 'listener');
              disableListener(key);
            }
          });
        } catch (e) {
          console.error('Failed to parse configuration file');
          console.error(e);
        }
      }
    });
});
