import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDemo } from '../demo/generate.mjs';
import { collect, collectHome, summariseSession, parseTranscript, sessionState, parseHomes, clearCache, cacheStats } from '../dashboard/lib/collect.mjs';
import { search, usageWindows, stillWorking, pauseProgress, overview } from '../dashboard/lib/stats.mjs';
import { handoverBrief, handoverFacts, exportMarkdown, recentCommits } from '../dashboard/lib/handover.mjs';
import { createServer } from '../dashboard/server.mjs';

const tmp = p => fs.mkdtempSync(path.join(os.tmpdir(), p));
const home = tmp('gf-feat-');
const now = buildDemo(home);
const data = collect(home);
const byId = id => data.sessions.find(s => s.id === id);

test('a running tool call keeps a session working past 5 minutes', () => {
  const s = byId('demo-01');
  assert.equal(s.pendingTool, true);
  assert.equal(sessionState(s, new Date(+now + 20 * 60000)), 'working');
  assert.equal(sessionState(s, new Date(+now + 40 * 60000)), 'waiting', 'stuck tool, Claude spoke last: likely a permission prompt');
});

test('tool results do not count as you speaking last', () => {
  const ev = [
    { type: 'assistant', timestamp: '2026-01-01T10:00:00Z', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } },
    { type: 'user', timestamp: '2026-01-01T10:00:05Z', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } },
  ];
  const s = summariseSession(ev);
  assert.equal(s.lastRole, 'assistant');
  assert.equal(s.pendingTool, false);
  assert.equal(s.turns, 0);
});

test('skills used are read from Skill tool calls', () => {
  assert.deepEqual(byId('demo-02').skills, ['session-handoff']);
});

test('transcripts are re-read only when they change', () => {
  const h = tmp('gf-cache-');
  buildDemo(h);
  clearCache();
  collect(h);
  assert.equal(cacheStats.parsed, 9);
  collect(h);
  assert.equal(cacheStats.reused, 9, 'unchanged files come from the cache');
  const f = path.join(h, 'projects', 'notes-app', 'demo-06.jsonl');
  fs.appendFileSync(f, JSON.stringify({ type: 'user', timestamp: now.toISOString(), message: { content: 'one more' } }) + '\n');
  collect(h);
  assert.equal(cacheStats.parsed, 10, 'the changed file is parsed again');
});

test('an unreadable file is skipped and reported, the rest still load', () => {
  const h = tmp('gf-skip-');
  buildDemo(h);
  fs.mkdirSync(path.join(h, 'projects', 'broken', 'oops.jsonl'), { recursive: true }); // a folder named like a transcript
  fs.writeFileSync(path.join(h, 'settings.json'), '{ not json');
  const r = collectHome(h);
  assert.equal(r.sessions.length, 9);
  assert.ok(r.skipped.some(s => s.path.endsWith('settings.json')));
});

test('several Claude folders merge; only all-missing is an error', () => {
  const a = tmp('gf-a-'), b = tmp('gf-b-');
  buildDemo(a); buildDemo(b);
  const r = collect([a, b, path.join(a, 'does-not-exist')]);
  assert.equal(r.sessions.length, 18);
  assert.equal(r.sources.length, 3);
  assert.ok(r.skipped.some(s => s.reason === 'folder not found'));
  assert.throws(() => collect(['/nope/one', '/nope/two']), /None of these Claude folders exist/);
  assert.deepEqual(parseHomes(`${a}${path.delimiter}${b}`, 'x'), [a, b]);
  assert.deepEqual(parseHomes('', 'fallback'), ['fallback']);
});

test('usage windows count only tokens inside each window', () => {
  const s = [{ id: 'x', title: 'X', usage: [
    { at: new Date(+now - 1 * 3600e3).toISOString(), tokens: 100 },
    { at: new Date(+now - 6 * 3600e3).toISOString(), tokens: 50 },
    { at: new Date(+now - 9 * 86400e3).toISOString(), tokens: 999 },
  ] }];
  const [five, seven] = usageWindows(s, now, { fiveHour: 400 });
  assert.equal(five.used, 100);
  assert.equal(five.percent, 25);
  assert.equal(seven.used, 150);
  assert.equal(seven.percent, null, 'no limit set: no percentage');
});

test('search finds message text, files and titles with snippets', () => {
  const hits = search(data.sessions, 'timeout');
  assert.ok(hits.length > 0);
  assert.ok(hits[0].snippets.some(x => /timeout/i.test(x.text)));
  for (const h of hits) assert.equal(new Set(h.snippets.map(x => x.text)).size, h.snippets.length, 'no repeated snippets');
  assert.ok(search(data.sessions, 'Page.tsx').some(h => h.snippets.some(x => x.kind === 'file')));
  assert.deepEqual(search(data.sessions, 'a'), [], 'one letter is too short');
});

test('wait-idle helpers: who is working and when to stop waiting', () => {
  assert.deepEqual(stillWorking(data.sessions, now).map(s => s.id).sort(), ['demo-01', 'demo-02']);
  assert.deepEqual(pauseProgress([], 0, 1000, 60), { waitingOn: [], secondsLeft: 59, done: true, timedOut: false });
  const p = pauseProgress([{ id: 'a' }], 0, 61000, 60);
  assert.equal(p.done, true);
  assert.equal(p.timedOut, true);
});

test('handover brief carries goal, last exchange, open steps, files and skills', () => {
  const s = byId('demo-02');
  const f = handoverFacts(s);
  assert.equal(f.goal, 'Add dark mode to settings page');
  assert.ok(f.lastReply.length > 0);
  const md = handoverBrief(s, ['abc123 Add colour tokens']);
  for (const part of ['# Handover: Add dark mode', '- [ ] Wire toggle', '- [x] Add colour tokens', '`src/theme.css`', 'session-handoff', 'abc123', '## Report back']) {
    assert.ok(md.includes(part), part);
  }
});

test('export writes the conversation as Markdown', () => {
  const md = exportMarkdown(byId('demo-06'));
  assert.match(md, /^# What does the sync flag do\?/);
  assert.match(md, /## You/);
  assert.match(md, /## Claude/);
});

test('recentCommits returns [] outside a git repo and never throws', () => {
  assert.deepEqual(recentCommits(tmp('gf-nogit-')), []);
  assert.deepEqual(recentCommits('/does/not/exist'), []);
});

test('overview keeps message text on the server', () => {
  const o = overview(data, now);
  assert.ok(o.sessions.every(s => !('said' in s) && !('usage' in s)));
  assert.equal(o.windows.length, 2);
});

test('server: search, handover, export, unknown session, read-only', async () => {
  const srv = createServer({ home, demo: true, now: () => now, commits: () => ['c0ffee Demo commit'] }).listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const s = await (await fetch(base + '/api/search?q=dark%20mode')).json();
    assert.ok(s.hits.some(h => h.id === 'demo-02'));
    const brief = await fetch(base + '/api/session/demo-02/handover');
    assert.match(brief.headers.get('content-type'), /markdown/);
    assert.match(await brief.text(), /# Handover/);
    assert.match(await (await fetch(base + '/api/session/demo-02/export')).text(), /## You/);
    assert.equal((await fetch(base + '/api/session/nope/handover')).status, 404);
    assert.equal((await fetch(base + '/api/overview', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/watch.mjs')).status, 200);
  } finally { srv.close(); }
});
