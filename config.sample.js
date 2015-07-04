var fs = require('fs');
var path = require('path');

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
      key: fs.readFileSync(path.join(__dirname, 'key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
      enabled: true,
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
  reconnectTime: 15 * 1000,
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
