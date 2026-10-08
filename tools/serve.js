// Local preview that behaves like GitHub Pages: the site is served at http://localhost:8080/komaira/
// Usage: npm start   (optional: PORT=3000 npm start)
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pglite = path.join(root, 'node_modules', '@electric-sql', 'pglite', 'dist');
const port = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.json': 'application/json', '.sql': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.data': 'application/octet-stream',
  '.gz': 'application/gzip', '.map': 'application/json',
};

function send(res, file, status = 200) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (url === '/' || url === '/komaira') { res.writeHead(302, { Location: '/komaira/' }); return res.end(); }
  if (!url.startsWith('/komaira/')) { res.writeHead(404); return res.end('Not found'); }
  let rel = url.slice('/komaira/'.length);
  // Local copy of the demo database engine (the live site loads it from a CDN).
  if (rel.startsWith('__pglite/')) {
    const f = path.join(pglite, rel.slice('__pglite/'.length));
    if (f.startsWith(pglite) && fs.existsSync(f) && fs.statSync(f).isFile()) return send(res, f);
    res.writeHead(404); return res.end();
  }
  let file = path.join(root, rel);
  if (!file.startsWith(root) || rel.split('/').some((p) => p.startsWith('.') || p === 'node_modules')) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!url.endsWith('/')) { res.writeHead(301, { Location: `${url}/` }); return res.end(); }
    file = path.join(file, 'index.html');
  }
  if (fs.existsSync(file) && fs.statSync(file).isFile()) return send(res, file);
  return send(res, path.join(root, '404.html'), 404);
}).listen(port, () => console.log(`Komaira Boutique preview: http://localhost:${port}/komaira/  ·  admin: http://localhost:${port}/komaira/admin/`));
