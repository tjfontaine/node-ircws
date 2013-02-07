var dns = require('dns');
var fs = require('fs');
var https = require('https');
var tls = require('tls');

var config = require('./config');

config.reconnectTime = config.reconnectTime || 15 * 1000;

var opts = {
  key: fs.readFileSync(config.key),
  cert: fs.readFileSync(config.cert),
};

var server = https.createServer(opts, function (req, res) {
  res.statusCode = 302;
  res.setHeader("Location", config.redirectUrl);
  res.end();
});

server.listen(config.port);

switch (config.module) {
  case 'socket.io':
    var io = require('socket.io').listen(server);
    io.set('log level', 1);
    io.sockets.on('connection', function (client) {
      can_connect(client, client.handshake.address.address);
    });
    break;
  case 'ws':
  default:
    var ws = require('ws');
    var wsserver = new ws.Server({
      server: server,
      verifyClient: function (info) {
        return true;
      },
    }).on('connection', function (client) {
      can_connect(client, client._socket.remoteAddress);
    });
    break;
}

var last_connect = {};

setInterval(function () {
  var k, now = Date.now(), maxAge = 5 * config.reconnectTime;
  for (k in last_connect) {
    if ((now - last_connect[k]) > maxAge) {
      delete last_connect[k];
    }
  }
}, 5 * config.reconnectTime);

function can_connect(client, ip) {
  var time = last_connect[ip];
  if (time !== undefined && (Date.now() - time) < config.reconnectTime) {
    console.log('client connecting too fast', ip, time, Date.now());
    client.send('ERROR :Trying to reconnect too fast.\r\n');
    if (client.close)
      client.close();
    else
      client.disconnect();
  } else {
    ws_client_connect(client, ip);
  }
}

function ws_client_connect(client, ip) {
  last_connect[ip] = Date.now();
  console.log('client connected', ip);
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
  var webirc = false;

  console.log('client connecting to irc', ip);

  var remote = tls.connect(config.ircPort, config.ircHost, function () {
    console.log('client connected to irc', ip);
  });

  remote.on('data', function (d) {
    if (client.readyState !== undefined && client.readyState == ws.CLOSED)
      remote.end();
    else
      client.send(d.toString('ascii'));
  });

  remote.on('end', function () {
    console.log('irc server hungup', ip);

    if(client.close)
      client.close();
    else
      client.disconnect();
  });

  remote.on('error', function (err) {
    console.log('irc server connection error', err, ip);
  });

  client.on('message', function (msg) {
    if (!webirc) {
      webirc = true;
      // WEBIRC <password> <user> <host> <ip>
      var cmd = ['WEBIRC', config.password, 'someuser', host, ip].join(' ');
      console.log('sending', cmd);
      remote.write(cmd + '\r\n');
    }

    if (remote.writable)
      remote.write(msg);
  });

  client.on('end', function () {
    console.log('client hungup', ip);
    remote.end();
  });

  client.on('disconnect', function () {
    console.log('client hungup', ip);
    remote.end();
  });
}
