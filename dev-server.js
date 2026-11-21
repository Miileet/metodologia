/* =========================================================
   npm run dev — Servidor estático del SITIO DE EXPOSICIÓN
   (las 7 páginas del TP: index, historias, casos de uso, etc.)
   Sin dependencias. Puerto 8090.
   ========================================================= */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 8090;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Sólo se sirven las carpetas/páginas del sitio de exposición.
function isAllowed(urlPath) {
  if (/^\/(css|js|assets)\//.test(urlPath)) return true;
  if (/^\/[^/]+\.html?$/.test(urlPath)) return true;
  if (urlPath === '/favicon.ico') return true;
  return false;
}

const server = http.createServer((req, res) => {
  try {
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    if (urlPath === '/') urlPath = '/index.html';

    if (!isAllowed(urlPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden');
    }

    const filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('403 Forbidden');
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('500 Internal Server Error');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────┐');
  console.log('  │  📄 SITIO DE EXPOSICIÓN (npm run dev)           │');
  console.log('  │  http://localhost:' + PORT + '                      │');
  console.log('  └─────────────────────────────────────────────────┘');
  console.log('  App funcional (login + turnos): npm start  →  puerto 3000');
  console.log('');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('');
    console.log('  ✗ El puerto ' + PORT + ' ya está en uso.');
    console.log('    ¿Ya tenés un "npm run dev" corriendo en otra terminal?');
    console.log('    Cerrá esa terminal (Ctrl+C) y volvé a ejecutar npm run dev,');
    console.log('    o usá otro puerto:  $env:PORT=8091; npm run dev');
    console.log('');
    console.log('    Para ver qué proceso lo usa:  netstat -ano | findstr :' + PORT);
    console.log('');
    process.exit(1);
  }
  console.error('[dev-server] Error inesperado:', err.message);
  process.exit(1);
});
