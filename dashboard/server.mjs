#!/usr/bin/env node
// Godfather dashboard: a tiny local web server. No dependencies, no model calls, read-only.
//   node dashboard/server.mjs            reads ~/.claude
//   node dashboard/server.mjs --demo     reads the bundled demo data
// Settings (environment variables):
//   GODFATHER_PORT        port, default 4417
//   GODFATHER_HOME        Claude folder(s) to read, default ~/.claude; separate several with ':'
//   GODFATHER_LIMIT_5H    optional token limit for the 5-hour window, to show a percentage
//   GODFATHER_LIMIT_7D    optional token limit for the 7-day window
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, parseHomes } from './lib/collect.mjs';
import { overview, search } from './lib/stats.mjs';
import { handoverBrief, exportMarkdown, recentCommits } from './lib/handover.mjs';
import { buildDemo } from '../demo/generate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

export function createServer({ home, homes, demo = false, now, limits = {}, commits = recentCommits } = {}) {
  const folders = homes || [home];
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const clock = now ? now() : new Date();
    try {
      if (url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET') return send(res, 405, { error: 'read-only' });
        const data = collect(folders);
        if (url.pathname === '/api/overview') return send(res, 200, { demo, ...overview(data, clock, { limits }) });
        if (url.pathname === '/api/search') return send(res, 200, { query: url.searchParams.get('q') || '', hits: search(data.sessions, url.searchParams.get('q')) });
        const m = /^\/api\/session\/([\w.-]+)\/(handover|export)$/.exec(url.pathname);
        if (m) {
          const s = data.sessions.find(x => x.id === m[1]);
          if (!s) return send(res, 404, { error: 'That session is no longer on disk.' });
          const md = m[2] === 'handover' ? handoverBrief(s, demo ? [] : commits(s.cwd)) : exportMarkdown(s);
          return send(res, 200, md, 'text/markdown; charset=utf-8');
        }
        return send(res, 404, { error: 'not found' });
      }
      const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found', 'text/plain');
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      send(res, 500, { error: err.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demo = process.argv.includes('--demo');
  let homes = parseHomes(process.env.GODFATHER_HOME, path.join(os.homedir(), '.claude'));
  let now;
  if (demo) {
    const home = path.join(os.tmpdir(), 'godfather-demo');
    const anchor = buildDemo(home);
    homes = [home];
    // The demo clock starts on the first page load and runs 10x fast for up to 8 demo minutes,
    // so after about 15 seconds a working session finishes and you see the "finished, waiting
    // on you" notice. Then it holds still. Restart the demo to see it again.
    let started = null;
    now = () => { started ??= Date.now(); return new Date(+anchor + Math.min((Date.now() - started) * 10, 8 * 60000)); };
  }
  const limits = { fiveHour: process.env.GODFATHER_LIMIT_5H, sevenDay: process.env.GODFATHER_LIMIT_7D };
  if (demo) { limits.fiveHour ||= 14_000_000; limits.sevenDay ||= 320_000_000; }
  const port = Number(process.env.GODFATHER_PORT || 4417);
  createServer({ homes, demo, now, limits }).listen(port, '127.0.0.1', () => {
    console.log(`Godfather dashboard on http://127.0.0.1:${port}  (${demo ? 'demo data' : homes.join(', ')})`);
  });
}
