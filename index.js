#!/usr/bin/env node

'use strict';

var module = require('module');
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
  server.log = LOG.child({ server: key });

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
  /*
   * This is the worst. Don't do it, the module cache is off limits.
   *
   * Except, well -- we want to have "real" module semantics so we can define
   * some of our config in terms of JavaScript. This means that we need to
   * reevaluate the code, but we don't want to use `eval` and a `vm` sandbox is
   * not sufficient to avoid runaway configs from polluting the namespace.  The
   * cleanest thing is to use a child process to evaluate and send back the
   * results, but since that involves overhead and other complexity wouldn't it
   * be nice if we could just re-require the module outright? In order to do
   * that we must invalidate the require cache, but we should *only* invalidate
   * the entry for the config itself.
   *
   * The contract therefore becomes:
   *   - config should hold no external references
   *   - config should not create resources that cannot be implicitly collected
   *   - config evaluation cannot depend on lazy module loading behavior
   *
   * Holding to this contract, it's reasonably "safe" to muck with the require
   * cache. If you're reading this code however, you've probably violated one of
   * the contract stipulations, and I'm sorry.
   *
   * For the other passersby, if you invalidate the entire cache and are relying
   * on the "node module as a singleton" -- welp, there goes that. You'll likely
   * incur a performance penalty (require is after all synchronous), or
   * depending on how often you invalidate the cache, a memory leak.
   *
   * Best wishes.
   */
  var configRealPath = module._resolveFilename('./config');
  delete require.cache[configRealPath];

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
