import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { buildDemo } from '../demo/generate.mjs';
import { collect } from '../dashboard/lib/collect.mjs';
import { overview } from '../dashboard/lib/stats.mjs';
import { createServer } from '../dashboard/server.mjs';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-test-'));
const now = buildDemo(home);
const ov = overview(collect(home), now);

test('demo data has every session state', () => {
  for (const st of ['working', 'waiting', 'idle', 'stale']) assert.ok(ov.states[st] > 0, st);
  assert.equal(ov.sessions.length, 9);
});

test('collisions find a file edited by two live sessions', () => {
  assert.ok(ov.collisions.some(c => c.file === 'src/settings/Page.tsx' && c.sessions.length === 2));
});

test('stale sessions are left out of collisions', () => {
  assert.ok(!ov.collisions.some(c => c.file === 'db/migrate.sql'));
});

test('advisor flags waiting, stale and opus quick questions', () => {
  const text = ov.advice.map(a => a.text).join(' ');
  assert.match(text, /waiting on your answer/);
  assert.match(text, /untouched for a week/);
  assert.match(text, /ran on Opus/);
});

test('open tasks exclude completed steps', () => {
  assert.ok(ov.openTasks.length > 0);
  assert.ok(ov.openTasks.every(t => t.status !== 'completed'));
});

test('setup lists skills, memory and hooks', () => {
  assert.ok(ov.skills.some(s => s.name === 'godfather'));
  assert.equal(ov.memory.length, 4);
  assert.equal(ov.hooks.length, 2);
});

test('server serves the API and the page, and blocks path escape', async () => {
  const srv = createServer({ home, demo: true, now: () => now }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const api = await (await fetch(base + '/api/overview')).json();
    assert.equal(api.demo, true);
    assert.equal(api.sessions.length, 9);
    assert.match(await (await fetch(base + '/')).text(), /<title>Godfather<\/title>/);
    assert.equal((await fetch(base + '/..%2f..%2fpackage.json')).status, 404);
  } finally { srv.close(); }
});
