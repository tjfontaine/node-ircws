#!/usr/bin/env node

'use strict';

var net = require('net');
var tls = require('tls');
var util = require('util');

var bunyan = require('bunyan');

var CertCloak = require('./lib/certcloak');
var ConnectStream = require('./lib/connectstream');
var DNSFilter = require('./lib/dnsfilter');
var IRCProxy = require('./lib/ircproxy');
var socketio = require('./lib/sanesocketio');
var Throttle = require('./lib/throttle');
var TorFilter = require('./lib/torfilter');

var config = require('./config');

var logConfig = util._extend({
  name: 'webirc',
}, config.loggingConfig);

var LOG = bunyan.createLogger(logConfig);

LOG.addSerializers({
  client: function clientSerializer(client) {
    return util.format('%d:[%s:%d] (isTor: %s)',
      client.clientId,
      client.remoteAddress,
      client.remotePort,
      client.isTor);
  },
});

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
    serverOptions.requestCert = true;
    eventName = 'secureConnection';
    break;
  case 'socketio':
    proto = socketio;
    serverOptions = listener;
    serverOptions.requestCert = true;
    serverOptions.sio_type = 'socketio';
    break;
  case 'websocket':
    proto = socketio;
    serverOptions = listener;
    serverOptions.requestCert = true;
    serverOptions.sio_type = 'ws';
    break;
  default:
    throw new Error(
      'Must define listener type: [plain, tls, websocket, socketio]'
    );
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
    LOG.error('trying to enable undefined listener', key);
    return;
  }

  if (listener.server) {
    LOG.error('trying to renable enabled listener', key);
    return;
  }

  LOG.info('starting listener', key);

  var server = listener.proto.createServer(listener.serverOptions);

  server.listen(listener.listenOptions.port, listener.listenOptions.host);

  server.on('listening', function serverListening() {
    ConnectStream(server, { eventName: listener.eventName, logger: LOG })
      .pipe(Throttle(config, LOG))
      .pipe(DNSFilter(config, LOG))
      .pipe(CertCloak(config, LOG))
      .pipe(TorFilter(config, LOG))
      .pipe(IRCProxy(config, LOG))
      .resume(); // Don't stop accepting new clients
  });

  server.on('error', function serverError(err) {
    LOG.error('listener failed', err);
    // TODO restart listener?
  });

  listener.server = server;
}

function disableListener(key) {
  var listener = definedListeners[key];

  if (!listener) {
    LOG.error(key, 'trying to disable undefined listener');
    return;
  }

  if (!listener.server) {
    LOG.error(key, 'listener already disabled');
    return;
  }

  listener.server.close();

  listener.server.removeAllListeners('connection');
  listener.server.removeAllListeners('secureConnection');

  listener.server = undefined;
}

process.on('SIGHUP', function configReload() {
  Object.keys(require.cache).forEach(function (key) { delete require.cache[key]; });
  var newConfig = require('./config');
  LOG.info('SIGHUP received, reloading config');

  try {
    newConfig.listeners.forEach(function enableDisable(listener) {
      var key = listener.host + ':' + listener.port;
      var definedListener = definedListeners[key];

      if (!definedListener) {
        LOG.error('cannot add new listeners with reload, ignoring', key);
        return;
      }

      if (listener.enabled && definedListener.server &&
        ('cert' in definedListener.serverOptions) &&
        (JSON.stringify(listener.cert) != JSON.stringify(definedListener.serverOptions.cert))) {
        LOG.info('certificate for', key, 'changed, reopening');
        disableListener(key);
        definedListener.serverOptions.key = listener.key;
        definedListener.serverOptions.cert = listener.cert;
        enableListener(key);
      }
      else if (listener.enabled && !definedListener.server) {
        LOG.info('enabling', key, 'listener');
        definedListener.serverOptions.key = listener.key;
        definedListener.serverOptions.cert = listener.cert;
        enableListener(key);
      }
      else if (!listener.enabled && definedListener.server) {
        LOG.info('disabling', key, 'listener');
        disableListener(key);
      }

    });
    config.blockTor = !!newConfig.blockTor;
    config.blockTorMessage = newConfig.blockTorMessage;
  } catch (e) {
    LOG.error(e, 'Failed to parse configuration file');
  }
});
