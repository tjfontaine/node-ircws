"use strict";

var net = require('net');
var stream = require('stream');
var tls = require('tls');
var util = require('util');

var lstream = require('lstream');

var WebIRC = require('./webirc');

function IRCProxy(config) {
  if (!(this instanceof IRCProxy))
    return new IRCProxy(config);

  stream.Transform.call(this, {
    objectMode: true,
    highWaterMark: 0,
  });

  this.ircp_config = config;

  switch (config.destination.type) {
    case 'plain':
      this.ircp_proto = net;
      break;
    case 'ssl':
      this.ircp_proto = tls;
      break;
  }

  this.ircp_options = {
    host: config.destination.host,
    port: config.destination.port,
    //TODO TLS
  };
}
util.inherits(IRCProxy, stream.Transform);

IRCProxy.prototype._transform = function ircProxyTransform(client, enc, cb) {
  var outbound = this.ircp_proto.connect(this.ircp_options);

  var self = this;

  outbound.on('connect', function outboundConnected() {
    client
      .pipe(WebIRC(client, self.ircp_config))
      .pipe(outbound)
      .pipe(client);
  });

  client.on('close', function clientClosed() {
    outbound.destroy();
  });

  outbound.on('close', function outboundClosed() {
    client.destroy();
  });

  outbound.on('error', function outboundError(err) {
    // TODO relay error
    console.error('outbound connection error', client, err);
  });

  client.on('error', function clientError(err) {
    // TODO relay error
    console.error('client connection error', client, err);
  });

  cb();
};

module.exports = IRCProxy;
