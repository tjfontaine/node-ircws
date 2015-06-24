module.exports = {
  listeners: {
    '0.0.0.0': {
      type: 'plain',
      port: 6667,
    },
  },
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
