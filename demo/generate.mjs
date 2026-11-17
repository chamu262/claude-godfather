// Writes a made-up ~/.claude folder for demos and tests. Every name here is fictional.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_NOW = new Date('2026-03-12T15:00:00Z');

// Small seeded random so the demo looks the same every run.
function rng(seed) { return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31); }

const SESSIONS = [
  { project: 'home-hq', title: 'Godfather: morning status board', model: 'claude-opus-4-5', ageMin: 2, last: 'user', skill: 'godfather', pending: true, days: 9, scale: 9, files: ['~/hq/CLAUDE.md'], todos: [['Review overnight sessions', 'completed'], ['Archive finished work', 'in_progress'], ['Update skills index', 'pending']] },
  { project: 'acme-web', title: 'Add dark mode to settings page', model: 'claude-sonnet-4-5', ageMin: 3, last: 'assistant', skill: 'session-handoff', days: 4, scale: 6, files: ['src/theme.css', 'src/settings/Page.tsx'], todos: [['Add colour tokens', 'completed'], ['Wire toggle', 'in_progress'], ['Screenshot both themes', 'pending']] },
  { project: 'acme-web', title: 'Fix flaky login test', model: 'claude-sonnet-4-5', ageMin: 40, last: 'assistant', days: 2, scale: 3, files: ['src/settings/Page.tsx', 'tests/login.spec.ts'], todos: [['Reproduce flake', 'completed'], ['Pick fix approach', 'pending']] },
  { project: 'garden-api', title: 'Plan v2 sensor schema', model: 'claude-opus-4-5', ageMin: 180, last: 'assistant', days: 6, scale: 12, skill: 'tidy-memory', files: ['docs/schema.md', 'api/models.py'], todos: [['Draft schema', 'completed'], ['Migration plan', 'pending']] },
  { project: 'garden-api', title: 'Bump dependencies', model: 'claude-haiku-4-5', ageMin: 60 * 30, last: 'assistant', days: 1, scale: 1, files: ['requirements.txt'], todos: [] },
  { project: 'notes-app', title: 'What does the sync flag do?', model: 'claude-opus-4-5', ageMin: 60 * 50, last: 'assistant', days: 1, scale: 0.3, files: [], todos: [], turns: 1 },
  { project: 'notes-app', title: 'Offline mode spike', model: 'claude-sonnet-4-5', ageMin: 60 * 24 * 3, last: 'assistant', days: 5, scale: 4, files: ['app/sync.ts', 'app/store.ts'], todos: [['Spike IndexedDB cache', 'completed']] },
  { project: 'home-hq', title: 'Write weekly review skill', model: 'claude-sonnet-4-5', ageMin: 60 * 24 * 10, last: 'assistant', days: 3, scale: 2, files: ['skills/weekly-review/SKILL.md'], todos: [] },
  { project: 'acme-web', title: 'Old migration experiment', model: 'claude-sonnet-4-5', ageMin: 60 * 24 * 20, last: 'assistant', days: 2, scale: 2, files: ['db/migrate.sql'], todos: [] },
];

const PROMPTS = [
  'Carry on with the next step',
  'Run the tests and tell me what fails',
  'Why did that break? Keep it short',
  'Good. Commit it, but do not push',
  'Can you check the edge case with an empty list?',
  'Write a short note for the README about this',
];
const REPLIES = [
  'Updated {file}. The change is small and the tests pass.',
  'Found it: the timeout in {file} was shorter than the retry delay, so the second try never ran.',
  'I read {file} first. Nothing else depends on it, so the change is safe.',
  'Tests: 41 passed, 0 failed. Committed locally; nothing pushed.',
  'An empty list now returns an empty result instead of an error. Added a test in {file}.',
  'Added two sentences to the README in plain words.',
];

function transcript(def, i, now) {
  const r = rng(i + 7);
  const lines = [];
  const id = `demo-${String(i + 1).padStart(2, '0')}`;
  const end = new Date(now - def.ageMin * 60000);
  const turns = def.turns || Math.max(2, Math.round(def.days * 6));
  const span = def.days * 24 * 3600 * 1000;
  for (let t = 0; t < turns; t++) {
    const at = new Date(end - span * (1 - (t + 1) / turns) - 60000);
    const base = { sessionId: id, cwd: `~/code/${def.project}`, timestamp: at.toISOString() };
    const prompt = t === 0 ? def.title : PROMPTS[(i + t) % PROMPTS.length];
    lines.push({ ...base, type: 'user', message: { role: 'user', content: prompt } });
    const file = def.files[t % (def.files.length || 1)];
    const content = [{ type: 'text', text: REPLIES[(i * 3 + t) % REPLIES.length].replace('{file}', file || 'the notes') }];
    const uses = [];
    if (file) uses.push({ type: 'tool_use', id: `${id}-e${t}`, name: 'Edit', input: { file_path: file } });
    if (t % 5 === 4) uses.push({ type: 'tool_use', id: `${id}-a${t}`, name: 'Agent', input: { description: 'search the codebase' } });
    if (t === 1 && def.skill) uses.push({ type: 'tool_use', id: `${id}-s${t}`, name: 'Skill', input: { skill: def.skill } });
    if (t === turns - 1 && def.todos.length) uses.push({ type: 'tool_use', id: `${id}-t${t}`, name: 'TodoWrite', input: { todos: def.todos.map(([c, s]) => ({ content: c, status: s })) } });
    const k = def.scale * (0.6 + r());
    lines.push({ ...base, timestamp: new Date(+at + 30000).toISOString(), type: 'assistant', message: {
      role: 'assistant', model: def.model, content: content.concat(uses),
      usage: { input_tokens: Math.round(900 * k), output_tokens: Math.round(1800 * k), cache_read_input_tokens: Math.round(160000 * k), cache_creation_input_tokens: Math.round(9000 * k) },
    } });
    if (uses.length) lines.push({ ...base, timestamp: new Date(+at + 40000).toISOString(), type: 'user', message: { role: 'user', content: uses.map(u => ({ type: 'tool_result', tool_use_id: u.id, content: 'ok' })) } });
  }
  if (def.last === 'user') lines.push({ sessionId: id, cwd: `~/code/${def.project}`, type: 'user', timestamp: new Date(+end + 60000).toISOString(), message: { role: 'user', content: 'Looks good, keep going' } });
  if (def.pending) {
    const at = new Date(+end + 90000).toISOString();
    lines.push({ sessionId: id, cwd: `~/code/${def.project}`, type: 'assistant', timestamp: at, message: { role: 'assistant', model: def.model,
      content: [{ type: 'text', text: 'Checking every session before I archive anything.' }, { type: 'tool_use', id: `${id}-live`, name: 'Bash', input: { command: 'ls' } }],
      usage: { input_tokens: 400, output_tokens: 300, cache_read_input_tokens: 90000, cache_creation_input_tokens: 2000 } } });
  }
  lines.push({ type: 'summary', summary: def.title });
  return { id, text: lines.map(l => JSON.stringify(l)).join('\n') + '\n' };
}

/** Build the demo folder at `home`. Returns the frozen "now" for the demo. */
export function buildDemo(home, now = DEMO_NOW) {
  fs.rmSync(home, { recursive: true, force: true });
  SESSIONS.forEach((def, i) => {
    const dir = path.join(home, 'projects', def.project);
    fs.mkdirSync(dir, { recursive: true });
    const { id, text } = transcript(def, i, now);
    fs.writeFileSync(path.join(dir, `${id}.jsonl`), text);
  });
  const mem = path.join(home, 'projects', 'home-hq', 'memory');
  fs.mkdirSync(mem, { recursive: true });
  const memories = [
    ['prefers-plain-words', 'user', 'Wants short answers in plain words, no jargon without a gloss'],
    ['max-two-parallel', 'feedback', 'Run at most two sessions or subagents at once unless asked'],
    ['garden-api-freeze', 'project', 'garden-api schema is frozen until the v2 plan is approved'],
    ['ci-dashboard', 'reference', 'CI status lives on the project board, not in chat'],
  ];
  for (const [name, type, description] of memories) {
    fs.writeFileSync(path.join(mem, `${name}.md`), `---\nname: ${name}\ndescription: ${description}\nmetadata:\n  type: ${type}\n---\n\n${description}.\n`);
  }
  fs.writeFileSync(path.join(mem, 'MEMORY.md'), memories.map(([n, , d]) => `- [${n}](${n}.md) — ${d}`).join('\n') + '\n');
  const skillsSrc = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');
  for (const name of fs.readdirSync(skillsSrc)) {
    if (!fs.existsSync(path.join(skillsSrc, name, "SKILL.md"))) continue;
    fs.mkdirSync(path.join(home, 'skills', name), { recursive: true });
    fs.copyFileSync(path.join(skillsSrc, name, 'SKILL.md'), path.join(home, 'skills', name, 'SKILL.md'));
  }
  fs.writeFileSync(path.join(home, 'settings.json'), JSON.stringify({
    hooks: {
      SessionStart: [{ matcher: 'startup', hooks: [{ type: 'command', command: '~/.claude/godfather/hooks/session-start.sh' }] }],
      Stop: [{ hooks: [{ type: 'command', command: '~/.claude/godfather/hooks/notify-done.sh' }] }],
    },
  }, null, 2));
  return now;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] || 'demo-home';
  buildDemo(out);
  console.log(`Demo Claude home written to ${out}`);
}
