const WebSocket = require('ws');
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 10000;
const APP_URL = 'https://conexao-sempre.onrender.com/ping'; // Substitua pelo seu endereço real do Render

// Servidor HTTP para o Render (Health Check e Keep-Alive)
const server = http.createServer((req, res) => {
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Novo dispositivo conectado');

  ws.on('message', (data, isBinary) => {
    // Reencaminha o áudio para todos os outros conectados
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
  });

  ws.on('close', () => console.log('Dispositivo desconectado'));
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// Mecanismo Keep-Alive (Ping para si mesmo a cada 10 minutos)
setInterval(() => {
  https.get(APP_URL, (res) => {
    console.log(`Self-ping: Status ${res.statusCode}`);
  }).on('error', (err) => {
    console.error(`Erro no Self-ping: ${err.message}`);
  });
}, 600000); // 10 minutos
