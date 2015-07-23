var fs = require('fs');
var path = require('path');

var key = fs.readFileSync(path.join(__dirname, 'key.pem'));
var cert = fs.readFileSync(path.join(__dirname, 'cert.pem'));

module.exports = {
  listeners: [
    {
      host: '0.0.0.0',
      type: 'plain',
      port: 6667,
      enabled: false,
    },
    {
      host: '0.0.0.0',
      type: 'tls',
      port: 6697,
      key: key,
      cert: cert,
      enabled: true,
    },
    {
      host: '0.0.0.0',
      type: 'socketio',
      port: 8443,
      key: key,
      cert: cert,
      enabled: true,
      redirectUrl: 'https://webchat.example.com',
    },
    {
      host: '0.0.0.0',
      type: 'websocket',
      port: 8444,
      key: key,
      cert: cert,
      enabled: true,
      redirectUrl: 'https://webchat.example.com',
    },
  ],
  destination: {
    host: 'irc.example.com',
    port: 6667,
    type: 'plain',
    // you can specify TLS valid config options, see:
    // https://nodejs.org/api/tls.html#tls_tls_connect_port_host_options_callback
    ca: [ fs.readFileSync(path.join(__dirname, 'spi-cacert.crt')) ],
  },
  cloaks: [
    path.join(__dirname, 'spi-cacert.crt'),
  ],
  reconnectTime: 15 * 1000,
  blockTor: false,
  dnsbl: {
    maxScore: 1,
    servers: {
      'somednsbl': {
        zone: 'dnsbl.example.com',
        defaultScore: 1,
      },
    },
  },
};
