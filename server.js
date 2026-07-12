const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { networkInterfaces } = require('os');

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'client.html')));
app.get('/host', (req, res) => res.sendFile(path.join(__dirname, 'host.html')));
app.get('/api/client-url', (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  res.json({ url: proto + '://' + host });
});

let currentColor = '#ffffff';
let clientCount = 0;

io.on('connection', (socket) => {
  const role = socket.handshake.query.role;

  if (role === 'client') {
    clientCount++;
    socket.emit('color', currentColor);
    io.to('hosts').emit('clientCount', clientCount);
    socket.join('clients');
    socket.on('disconnect', () => {
      clientCount--;
      io.to('hosts').emit('clientCount', clientCount);
    });
  }

  if (role === 'host') {
    socket.join('hosts');
    socket.emit('clientCount', clientCount);
    socket.emit('color', currentColor);

    socket.on('setColor', (color) => {
      currentColor = color;
      io.to('clients').emit('color', color);
    });

    socket.on('splitGroups', ({ colors }) => {
      if (!Array.isArray(colors) || colors.length < 2) return;
      const numGroups = colors.length;
      const clientSockets = [...io.sockets.sockets.values()].filter(s => s.handshake.query.role === 'client');
      const shuffled = clientSockets.sort(() => Math.random() - 0.5);
      const groupCounts = new Array(numGroups).fill(0);
      shuffled.forEach((cs, i) => {
        const g = i % numGroups;
        cs.emit('color', colors[g]);
        groupCounts[g]++;
      });
      currentColor = colors[0];
      socket.emit('splitResult', { groupCounts });
    });

    socket.on('disconnect', () => {});
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('Color Controller running on port ' + PORT);
});
