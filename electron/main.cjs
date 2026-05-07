'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

// ws lives in node_modules alongside this file when packaged
let WebSocketServer;
try { ({ WebSocketServer } = require('ws')); } catch { WebSocketServer = null; }

const isDev = !app.isPackaged;

// ── MIME types for static file server ────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

const SECURITY_HEADERS = {
  'Cross-Origin-Opener-Policy':   'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin':  '*',
};

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      ...SECURITY_HEADERS,
    });
    res.end(data);
  });
}

// ── Start local HTTP + WebSocket server (production only) ────────────────────
function startServer(distDir, callback) {
  const viewers = new Set();
  let sender = null;

  const wss = WebSocketServer ? new WebSocketServer({ noServer: true }) : null;

  if (wss) {
    wss.on('connection', (ws, req) => {
      const qs = (req.url || '').replace(/^[^?]*/, '');
      const role = new URLSearchParams(qs).get('role');

      const broadcast = (msg) => {
        if (sender && sender.readyState === 1)
          sender.send(JSON.stringify({ type: 'viewers', count: viewers.size }));
      };

      if (role === 'sender') {
        sender = ws;
        broadcast();
        ws.on('message', (data) => {
          for (const v of viewers) if (v.readyState === 1) v.send(data);
        });
        ws.on('close', () => { sender = null; });
      } else {
        viewers.add(ws);
        broadcast();
        ws.on('close', () => { viewers.delete(ws); broadcast(); });
      }
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname === '/api/network-info') {
      const ifaces = os.networkInterfaces();
      const ips = [];
      for (const addrs of Object.values(ifaces)) {
        for (const a of addrs || []) {
          if (a.family === 'IPv4' && !a.internal) ips.push(a.address);
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ips }));
      return;
    }

    let filePath = path.join(distDir, url.pathname);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, 'index.html');
    }
    serveFile(res, filePath);
  });

  if (wss) {
    server.on('upgrade', (req, socket, head) => {
      if (req.url && req.url.startsWith('/ws/translation')) {
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      }
    });
  }

  server.listen(0, '0.0.0.0', () => {
    callback(server.address().port);
  });
}

// ── Create the main window ────────────────────────────────────────────────────
function createWindow(port) {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0a0a0f',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Open external links in the system browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadURL(`http://localhost:${port}`);
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  if (isDev) {
    createWindow(null);
  } else {
    const distDir = path.join(__dirname, '..', 'dist');
    startServer(distDir, (port) => createWindow(port));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
