#!/usr/bin/env node
/* ==========================================================================
   scripts/serve.js — zero-dependency local preview server
   --------------------------------------------------------------------------
   Serves dist/ over HTTP so you can preview the built site exactly as a static
   host would serve it (correct MIME types, directory index, 404 fallback).

   RUN
       npm run dev            (or: npm run preview)
       node scripts/serve.js --port 5000

   WHY NOT `npx serve`?
   That pulls a package from the network. This project is deliberately
   dependency-free, so the preview server is too — it uses only Node built-ins
   and works offline, in CI, and on a machine with no npm registry access.

   It serves dist/, so run `npm run build` first (or use `npm run verify`).
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

/* --port 5000  (default 4173, the Vite-preview convention) */
const argPort = process.argv.indexOf('--port');
const PORT = argPort !== -1 ? parseInt(process.argv[argPort + 1], 10) : 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(function (req, res) {
  /* Strip the query string, decode, and refuse to escape dist/. */
  let urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  let filePath = path.join(DIST, urlPath);

  if (!filePath.startsWith(DIST)) {
    return send(res, 403, 'Forbidden');
  }

  /* Directory -> index.html */
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  /* Extensionless clean URL -> <path>.html (mirrors the host rewrites) */
  if (!fs.existsSync(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  if (!fs.existsSync(filePath)) {
    const notFound = path.join(DIST, '404.html');
    if (fs.existsSync(notFound)) {
      return send(res, 404, fs.readFileSync(notFound), MIME['.html']);
    }
    return send(res, 404, 'Not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  send(res, 200, fs.readFileSync(filePath), MIME[ext] || 'application/octet-stream');
});

server.listen(PORT, function () {
  console.log('  Edulife IT School — preview server');
  console.log('  serving dist/ at  http://localhost:' + PORT + '/');
  console.log('  press Ctrl+C to stop');
});
