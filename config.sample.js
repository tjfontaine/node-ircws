var fs = require('fs');
var path = require('path');

module.exports = {
  listeners: [
    {
      host: '0.0.0.0',
      type: 'plain',
      port: 6667,
    },
    {
      host: '0.0.0.0',
      type: 'tls',
      port: 6697,
      key: fs.readFileSync(path.join(__dirname, 'key.pem')),
      cert: fs.readFileSync(path.join(__dirname, 'cert.pem')),
    },
  ],
  destination: {
    host: 'irc.example.com',
    port: 6667,
    type: 'plain',
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
