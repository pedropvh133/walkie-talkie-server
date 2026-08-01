const WebSocket = require('ws');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const formidable = require('formidable');

const STATS_FILE = path.join(__dirname, 'stats.json');

// Carregar estatísticas iniciais
let stats = { totalInstalls: 0 };
if (fs.existsSync(STATS_FILE)) {
  try {
    stats = JSON.parse(fs.readFileSync(STATS_FILE));
  } catch (e) {
    console.error("Erro ao ler stats.json", e);
  }
}

function saveStats() {
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats));
}

const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = 'pedropvh133@gmail.com/admin';
const APP_URL = 'https://conexao-sempre.onrender.com';

// Criar pasta de uploads se não existir
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// CONFIGURAÇÃO INICIAL
let UPDATE_CONFIG = {
  latestVersion: 1,
  downloadUrl: `${APP_URL}/download-apk`,
  message: 'Nova atualização disponível! Melhore sua conexão agora.'
};

const server = http.createServer((req, res) => {
  // 1. ENDPOINT DE DOWNLOAD DO APK
  if (req.url === '/download-apk') {
    const apkPath = path.join(UPLOAD_DIR, 'app.apk');
    if (fs.existsSync(apkPath)) {
      res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive' });
      return fs.createReadStream(apkPath).pipe(res);
    } else {
      res.writeHead(404);
      return res.end('Nenhum APK disponível. Faça o upload no painel admin.');
    }
  }

  // 2. ENDPOINT DE CHECK DE ATUALIZAÇÃO (USADO PELO APP)
  if (req.url.startsWith('/update-check')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const responseData = {
      ...UPDATE_CONFIG,
      totalInstalls: stats.totalInstalls,
      onlineUsers: wss ? wss.clients.size : 0
    };
    return res.end(JSON.stringify(responseData));
  }

  // 2.1 ENDPOINT PARA REGISTRAR NOVA INSTALAÇÃO/SESSÃO
  if (req.url === '/register-install') {
    stats.totalInstalls++;
    saveStats();
    broadcastStats(); // Notificar todos sobre o novo total
    res.writeHead(200);
    return res.end('ok');
  }

  // 3. PING PARA KEEP-ALIVE
  if (req.url === '/ping') {
    res.writeHead(200);
    return res.end('pong');
  }

  // 4. PAINEL ADMIN
  if (req.url === '/admin') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>ADMIN - CONEXÃO SEMPRE</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: sans-serif; background: #121212; color: white; text-align: center; padding: 20px; }
          .card { background: #1B5E20; padding: 20px; border-radius: 10px; display: inline-block; text-align: left; max-width: 400px; width: 100%; border: 2px solid #FBC02D; }
          input, button { width: 100%; padding: 10px; margin: 10px 0; border-radius: 5px; border: none; }
          button { background: #FBC02D; color: black; font-weight: bold; cursor: pointer; }
          .warning { color: #FBC02D; font-size: 0.8em; }
        </style>
      </head>
      <body>
        <h1>🛡️ Painel de Controle</h1>
        <div class="card">
          <h2>Estatísticas</h2>
          <p>Total de Instalações: <strong>${stats.totalInstalls}</strong></p>
          <p>Usuários Online: <strong>${wss ? wss.clients.size : 0}</strong></p>
          <hr>
          <form action="/admin/update" method="POST" enctype="multipart/form-data">
            <label>Senha Admin:</label>
            <input type="password" name="password" required>
            <hr>
            <label>Versão Obrigatória (Número):</label>
            <input type="number" name="version" value="${UPDATE_CONFIG.latestVersion}" required>
            <label>Mensagem para Usuários:</label>
            <input type="text" name="message" value="${UPDATE_CONFIG.message}">
            <label>Upload do novo APK:</label>
            <input type="file" name="apk">
            <p class="warning">⚠️ Nota: No Render grátis, você deve reenviar o APK se o servidor reiniciar.</p>
            <button type="submit">APLICAR MUDANÇAS E BLOQUEAR APP</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }

  // 5. PROCESSAR ATUALIZAÇÃO DO ADMIN
  if (req.url === '/admin/update' && req.method === 'POST') {
    const form = new formidable.IncomingForm();
    form.uploadDir = UPLOAD_DIR;
    form.keepExtensions = true;

    form.parse(req, (err, fields, files) => {
      if (err) { res.writeHead(500); return res.end('Erro no formulário'); }

      // Verificar Senha
      if (fields.password[0] !== ADMIN_PASSWORD) {
        res.writeHead(401);
        return res.end('Senha Incorreta!');
      }

      // Atualizar Configurações
      UPDATE_CONFIG.latestVersion = parseInt(fields.version[0]);
      UPDATE_CONFIG.message = fields.message[0];

      // Se houver arquivo, renomear para app.apk
      const uploadedFile = files.apk[0];
      if (uploadedFile && uploadedFile.size > 0) {
        const newPath = path.join(UPLOAD_DIR, 'app.apk');
        fs.renameSync(uploadedFile.filepath, newPath);
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>✅ Atualizado com sucesso!</h1><a href="/admin">Voltar</a>');
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

function broadcastStats() {
  const data = JSON.stringify({
    type: 'STATS_UPDATE',
    totalInstalls: stats.totalInstalls,
    onlineUsers: wss.clients.size
  });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

wss.on('connection', (ws) => {
  broadcastStats();

  ws.on('close', () => {
    broadcastStats();
  });

  ws.on('message', (data, isBinary) => {
    wss.clients.forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(data, { binary: isBinary });
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// Mecanismo Keep-Alive
setInterval(() => {
  https.get(`${APP_URL}/ping`, (res) => {}).on('error', (err) => {});
}, 600000);
