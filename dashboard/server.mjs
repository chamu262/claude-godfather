#!/usr/bin/env node
// Godfather dashboard: a tiny local web server. No dependencies, no model calls.
//   node dashboard/server.mjs            reads ~/.claude
//   node dashboard/server.mjs --demo     reads the bundled demo data
//   GODFATHER_PORT=4417 GODFATHER_HOME=/path/to/.claude
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect } from './lib/collect.mjs';
import { overview } from './lib/stats.mjs';
import { buildDemo } from '../demo/generate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

export function createServer({ home, demo = false, now } = {}) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/overview') {
      const clock = now ? now() : new Date();
      const body = JSON.stringify({ demo, ...overview(collect(home), clock) });
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(body);
    }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC, rel));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes('--demo');
  let home = process.env.GODFATHER_HOME || path.join(os.homedir(), '.claude');
  let now;
  if (demo) {
    home = path.join(os.tmpdir(), 'godfather-demo');
    const anchor = buildDemo(home);
    now = () => anchor; // freeze the clock so demo states stay stable
  }
  const port = Number(process.env.GODFATHER_PORT || 4417);
  createServer({ home, demo, now }).listen(port, '127.0.0.1', () => {
    console.log(`Godfather dashboard on http://127.0.0.1:${port}  (${demo ? 'demo data' : home})`);
  });
}
