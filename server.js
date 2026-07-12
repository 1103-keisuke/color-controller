const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { networkInterfaces } = require('os');

function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'client.html'));
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'host.html'));
});

app.get('/api/client-url', (req, res) => {
  // クラウド上ではリクエストのホストから正しいURLを返す（ローカルでも動作）
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const baseUrl = `${proto}://${host}`;
  res.json({ url: baseUrl });
});

// Current color state
let currentColor = '#ffffff';
let clientCount = 0;

io.on('connection', (socket) => {
  const role = socket.handshake.query.role;

  if (role === 'client') {
    clientCount++;
    console.log(`Client joined. Total clients: ${clientCount}`);

    // Send current color to new client
    socket.emit('color', currentColor);

    // Notify host of updated count
    io.to('hosts').emit('clientCount', clientCount);

    socket.join('clients');

    socket.on('disconnect', () => {
      clientCount--;
      console.log(`Client left. Total clients: ${clientCount}`);
      io.to('hosts').emit('clientCount', clientCount);
    });
  }

  if (role === 'host') {
    socket.join('hosts');
    console.log('Host connected');

    // Send current state to host
    socket.emit('clientCount', clientCount);
    socket.emit('color', currentColor);

    socket.on('setColor', (color) => {
      currentColor = color;
      console.log(`Color set to: ${color}`);
      // Broadcast to all clients
      io.to('clients').emit('color', color);
    });

    socket.on('disconnect', () => {
      console.log('Host disconnected');
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`\n🎨 Color Controller Server running!`);
  console.log(`   Host page:   http://localhost:${PORT}/host`);
  console.log(`   Client page: http://${ip}:${PORT}/  ← スマホでアクセス or QRコードを使用\n`);
});
