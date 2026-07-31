const WebSocket = require('ws');
const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 10000;
const APP_URL = 'https://conexao-sempre.onrender.com/ping';

// PAINEL DE CONTROLE DE ATUALIZAÇÃO
const UPDATE_CONFIG = {
  latestVersion: 2, // Aumente este número para forçar a atualização
  downloadUrl: 'https://seu-link-de-download-aqui.com/app.apk', // Link do novo APK
  message: 'Nova atualização disponível! Melhore sua conexão agora.'
};

// Servidor HTTP para o Render (Health Check, Keep-Alive e Update Check)
const server = http.createServer((req, res) => {
  if (req.url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('pong');
  } else if (req.url === '/update-check') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(UPDATE_CONFIG));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Novo dispositivo conectado');

  ws.on('message', (data, isBinary) => {
    // Reencaminha mensagens de áudio e sinais (TALK_START/STOP)
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

// Mecanismo Keep-Alive
setInterval(() => {
  https.get(APP_URL, (res) => {
    console.log(`Self-ping: Status ${res.statusCode}`);
  }).on('error', (err) => {
    console.error(`Erro no Self-ping: ${err.message}`);
  });
}, 600000);
