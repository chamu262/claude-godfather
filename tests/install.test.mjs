import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (home, ...args) => execFileSync('bash', [path.join(repo, 'install.sh'), ...args], { env: { ...process.env, CLAUDE_HOME: home }, encoding: 'utf8' });

test('install writes skills, templates and hooks', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-install-'));
  run(home);
  for (const p of ['skills/godfather/SKILL.md', 'skills/session-handoff/SKILL.md', 'skills/tidy-memory/SKILL.md',
    'godfather/CLAUDE.md', 'godfather/memory-template/MEMORY.md', 'godfather/hooks/session-start.sh']) {
    assert.ok(fs.existsSync(path.join(home, p)), p);
  }
  assert.ok(fs.statSync(path.join(home, 'godfather/hooks/notify-done.sh')).mode & 0o100);
  assert.ok(!fs.existsSync(path.join(home, 'settings.json')), 'never writes settings.json');
});

test('install keeps existing files unless --force', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-install-'));
  const f = path.join(home, 'godfather/CLAUDE.md');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, 'mine');
  assert.match(run(home), /keep/);
  assert.equal(fs.readFileSync(f, 'utf8'), 'mine');
  run(home, '--force');
  assert.notEqual(fs.readFileSync(f, 'utf8'), 'mine');
});

test('install --check reports missing pieces, then ok after install', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gf-check-'));
  let out = '';
  try { run(home, '--check'); assert.fail('should exit 1 before install'); } catch (e) { out = e.stdout; assert.equal(e.status, 1); }
  assert.match(out, /missing\s+skill godfather/);
  run(home);
  out = run(home, '--check');
  assert.match(out, /ok\s+skill godfather/);
  assert.doesNotMatch(out, /missing/);
  assert.equal(fs.readdirSync(home).sort().join(','), 'godfather,skills', '--check writes nothing');
});
