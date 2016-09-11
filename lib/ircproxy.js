"use strict";

var net = require('net');
var stream = require('stream');
var tls = require('tls');
var util = require('util');

var lstream = require('lstream');

var WebIRC = require('./webirc');

function IRCProxy(config, logger) {
  if (!(this instanceof IRCProxy))
    return new IRCProxy(config, logger);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMark: 0,
  });

  this.ircp_config = config;
  this.ircp_connect_event = 'connect';

  switch (config.destination.type) {
    case 'plain':
      this.ircp_proto = net;
      break;
    case 'tls':
      this.ircp_proto = tls;
      this.ircp_connect_event = 'secureConnect';
      break;
    default:
      throw new Error('Must define an outbound protocol');
      break;
  }

  this.log = logger.child({ pipeline: 'ircproxy' });

  this.ircp_options = util._extend({}, config.destination);
}
util.inherits(IRCProxy, stream.Transform);

IRCProxy.prototype._transform = function ircProxyTransform(client, enc, cb) {
  this.log.trace({ client: client }, 'got client');

  client.log.trace({
    opts: this.ircp_options,
    proto: this.ircp_proto,
  }, 'connecting to irc');

  var outbound = this.ircp_proto.connect(this.ircp_options);

  var self = this;

  outbound.on(this.ircp_connect_event, function outboundConnected() {
    client.log.info('connected to irc');
    client
      .pipe(WebIRC(client, self.ircp_config))
      .pipe(outbound)
      .pipe(client);
  });

  client.on('close', function clientClosed() {
    client.log.info('client closed');
    outbound.destroy();
  });

  outbound.on('close', function outboundClosed() {
    client.log.info('outbound closed');
    client.destroy();
  });

  outbound.on('error', function outboundError(err) {
    // TODO relay error
    client.log.error(err, 'outbound connection error');
    client.destroy();
  });

  client.on('error', function clientError(err) {
    // TODO relay error
    client.log.error({ err: err }, 'client connection error');
  });

  cb();
};

module.exports = IRCProxy;
