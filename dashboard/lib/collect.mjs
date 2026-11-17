// Reads Claude Code's local files (read-only) and turns them into plain objects.
// Sources:
//   <claudeHome>/projects/<project>/<session>.jsonl   one transcript per session
//   <claudeHome>/skills/<name>/SKILL.md               installed skills
//   <claudeHome>/settings.json                        hooks and settings
//   <claudeHome>/projects/<project>/memory/*.md        file-based memory
import fs from 'node:fs';
import path from 'node:path';

/** Parse one JSONL transcript. Bad lines are skipped, never fatal. */
export function parseTranscript(text) {
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* skip partial line */ }
  }
  return events;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/** Summarise one session's events. */
export function summariseSession(events, { id, project } = {}) {
  const s = {
    id: id || events.find(e => e.sessionId)?.sessionId || 'unknown',
    project: project || '',
    cwd: '',
    title: '',
    model: '',
    firstAt: null,
    lastAt: null,
    lastRole: null,
    turns: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    byModel: {},
    byDay: {},
    filesEdited: [],
    todos: [],
    tools: {},
    subagents: 0,
  };
  const files = new Set();
  for (const e of events) {
    if (e.cwd && !s.cwd) s.cwd = e.cwd;
    if (e.type === 'summary' && e.summary) s.title = e.summary;
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    const at = e.timestamp ? new Date(e.timestamp) : null;
    if (at && !Number.isNaN(at.getTime())) {
      if (!s.firstAt || at < s.firstAt) s.firstAt = at;
      if (!s.lastAt || at >= s.lastAt) { s.lastAt = at; s.lastRole = e.type; }
    }
    const msg = e.message || {};
    if (e.type === 'user' && typeof msg.content === 'string') {
      s.turns++;
      if (!s.title) s.title = msg.content.slice(0, 80);
    }
    if (e.type !== 'assistant') continue;
    if (msg.model) s.model = msg.model;
    const u = msg.usage || {};
    const t = {
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
      cacheWrite: u.cache_creation_input_tokens || 0,
    };
    for (const k of Object.keys(t)) s.tokens[k] += t[k];
    const total = t.input + t.output + t.cacheRead + t.cacheWrite;
    if (msg.model) s.byModel[msg.model] = (s.byModel[msg.model] || 0) + total;
    if (at) {
      const day = at.toISOString().slice(0, 10);
      s.byDay[day] = (s.byDay[day] || 0) + total;
    }
    for (const c of Array.isArray(msg.content) ? msg.content : []) {
      if (c.type !== 'tool_use') continue;
      s.tools[c.name] = (s.tools[c.name] || 0) + 1;
      if (EDIT_TOOLS.has(c.name) && c.input?.file_path) files.add(c.input.file_path);
      if (c.name === 'TodoWrite' && Array.isArray(c.input?.todos)) s.todos = c.input.todos;
      if (c.name === 'Task' || c.name === 'Agent') s.subagents++;
    }
  }
  s.filesEdited = [...files].sort();
  return s;
}

/** Working / waiting / idle / stale, from the last event's age and who spoke last. */
export function sessionState(s, now = new Date()) {
  if (!s.lastAt) return 'stale';
  const mins = (now - s.lastAt) / 60000;
  if (mins < 5 && s.lastRole === 'user') return 'working';
  if (mins < 5) return 'working';
  if (mins < 24 * 60 && s.lastRole === 'assistant') return 'waiting';
  if (mins < 7 * 24 * 60) return 'idle';
  return 'stale';
}

function readDirSafe(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; }
}

/** Read frontmatter `name:` and `description:` from a SKILL.md or memory file. */
export function frontmatter(text) {
  const m = /^---\n([\s\S]*?)\n---/.exec(text);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Collect everything under a Claude home folder. */
export function collect(claudeHome) {
  const sessions = [];
  const memory = [];
  const projectsDir = path.join(claudeHome, 'projects');
  for (const proj of readDirSafe(projectsDir)) {
    if (!proj.isDirectory()) continue;
    const pdir = path.join(projectsDir, proj.name);
    for (const f of readDirSafe(pdir)) {
      if (f.isFile() && f.name.endsWith('.jsonl')) {
        const text = fs.readFileSync(path.join(pdir, f.name), 'utf8');
        sessions.push(summariseSession(parseTranscript(text), {
          id: f.name.replace(/\.jsonl$/, ''), project: proj.name,
        }));
      }
    }
    for (const f of readDirSafe(path.join(pdir, 'memory'))) {
      if (!f.isFile() || !f.name.endsWith('.md') || f.name === 'MEMORY.md') continue;
      const fm = frontmatter(fs.readFileSync(path.join(pdir, 'memory', f.name), 'utf8'));
      memory.push({ project: proj.name, file: f.name, name: fm.name || f.name, description: fm.description || '', type: fm.type || '' });
    }
  }
  const skills = [];
  for (const d of readDirSafe(path.join(claudeHome, 'skills'))) {
    const p = path.join(claudeHome, 'skills', d.name, 'SKILL.md');
    if (!fs.existsSync(p)) continue;
    const fm = frontmatter(fs.readFileSync(p, 'utf8'));
    skills.push({ name: fm.name || d.name, description: fm.description || '' });
  }
  let hooks = [];
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(claudeHome, 'settings.json'), 'utf8'));
    for (const [event, list] of Object.entries(settings.hooks || {})) {
      for (const entry of list) for (const h of entry.hooks || []) hooks.push({ event, matcher: entry.matcher || '*', command: h.command || '' });
    }
  } catch { hooks = []; }
  return { sessions, memory, skills, hooks };
}
