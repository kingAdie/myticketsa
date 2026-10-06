#!/usr/bin/env node
'use strict';

/* Local dev server: serves frontend/ and runs netlify/functions/* the way Netlify does,
 * with no dependencies. Reads .env (same variables you set in Netlify).
 *
 *   npm run dev          ->  http://localhost:8888
 *   PORT=3000 npm run dev
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, 'frontend');
const FUNCTIONS = path.join(__dirname, 'netlify', 'functions');
const PORT      = Number(process.env.PORT) || 8888;

// ── .env loader ──────────────────────────────────────────
try {
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    if (line.trim().startsWith('#')) return;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  });
} catch { /* no .env: fine for page-only testing */ }

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain',
  '.xml': 'application/xml', '.woff2': 'font/woff2',
};

function resolveFile(urlPath) {
  let clean;
  try { clean = decodeURIComponent(urlPath).replace(/\0/g, ''); } catch { return null; }
  const target = path.normalize(path.join(ROOT, clean));
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;   // no path traversal
  for (const c of [target, target + '.html', path.join(target, 'index.html')]) {
    try { if (fs.statSync(c).isFile()) return c; } catch { /* try next */ }
  }
  return null;
}

async function runFunction(name, req, res, body) {
  const file = path.join(FUNCTIONS, name + '.js');
  if (!/^[a-z0-9-]+$/i.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Function not found'); }
  delete require.cache[require.resolve(file)];                      // pick up edits without a restart
  try {
    const out = await require(file).handler({
      httpMethod: req.method, headers: req.headers, body, isBase64Encoded: false,
      path: req.url, queryStringParameters: Object.fromEntries(new URL(req.url, 'http://x').searchParams),
    });
    res.writeHead(out.statusCode || 200, out.headers || {});
    res.end(out.body || '');
  } catch (e) {
    console.error(`[${name}]`, e);
    res.writeHead(500); res.end('Function error');
  }
}

// Mirrors the rewrites in netlify.toml
const ALIASES = {
  '/events': '/browse', '/experiences': '/browse',
  '/sell/event': '/sell-event', '/sell/accommodation': '/sell-accommodation',
  '/sell/experience': '/sell-experience', '/sell/equipment': '/sell-equipment',
  '/sell/merchandise': '/sell-merchandise',
};

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');

  if (pathname.startsWith('/.netlify/functions/')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => runFunction(pathname.split('/')[3], req, res, Buffer.concat(chunks).toString('utf8')));
    return;
  }

  const file = resolveFile(ALIASES[pathname] || pathname);
  if (!file) {
    const nf = path.join(ROOT, '404.html');
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  const have = k => (process.env[k] ? 'set' : 'MISSING');
  console.log(`\n  TicketsSA running at http://localhost:${PORT}\n`);
  console.log(`  RESEND_API_KEY=${have('RESEND_API_KEY')}  SUPABASE_SERVICE_ROLE_KEY=${have('SUPABASE_SERVICE_ROLE_KEY')}`);
  if (!process.env.RESEND_API_KEY) console.log('  (no RESEND_API_KEY: pages work, emails will not send)');
  console.log('');
});
