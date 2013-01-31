var dns = require('dns');
var fs = require('fs');
var https = require('https');
var tls = require('tls');
var ws = require('ws');

var config = require('./config');

var opts = {
  key: fs.readFileSync(config.key),
  cert: fs.readFileSync(config.cert),
};

var server = https.createServer(opts, function (req, res) {
  res.statusCode = 302;
  res.setHeader("Location", config.redirectUrl);
  res.end();
});

var wsserver = new ws.Server({
  server: server,
  verifyClient: function (info) {
    return true;
  },
});

wsserver.on('connection', ws_client_connect);

server.listen(config.port);

function ws_client_connect(client) {
  console.log(client._socket.remoteAddress);
  var ip = client._socket.remoteAddress;
  dns.reverse(ip, function (err, domains) {
    if (err) {
      ws_client_resolved(client, ip, ip);
      return;
    }
    var domain = domains[0];
    dns.resolve(domain, function (err, addresses) {
      if (err || addresses[0] !== ip) {
        ws_client_resolved(client, ip, ip);
        return;
      } else {
        ws_client_resolved(client, ip, domain);
      }
    });
  });
};

function ws_client_resolved(client, ip, host) {
  var remote = tls.connect(config.ircPort, config.ircHost, function () {
    // WEBIRC <password> <user> <host> <ip>
    var cmd = ['WEBIRC', config.password, 'someuser', host, ip].join(' ');
    console.log('sending', cmd);
    remote.write(cmd + '\r\n');
  });

  remote.on('data', function (d) {
    client.send(d.toString('ascii'));
  });

  remote.on('end', function () {
    client.close();
  });

  client.on('message', function (msg) {
    remote.write(msg);
  });

  client.on('end', function () {
    remote.close();
  });
}
