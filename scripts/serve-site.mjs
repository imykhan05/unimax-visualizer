#!/usr/bin/env node
// Tiny static server for the assembled site. No dependencies on purpose — this
// has to run on the shop PC with nothing but Node installed.

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const port = Number(process.env.PORT || 5175);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';

    // Resolve inside the site directory only — never serve outside it.
    const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const headers = {
      'content-type': TYPES[ext] || 'application/octet-stream',
      'content-length': info.size,
    };
    if (ext === '.apk') {
      headers['content-disposition'] = 'attachment; filename="unimax-visualizer.apk"';
    }
    res.writeHead(200, headers);
    createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('Server error');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Site:     http://localhost:${port}/`);
  console.log(`Download: http://localhost:${port}/download.html`);
});
