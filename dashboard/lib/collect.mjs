// Reads Claude Code's local files (read-only) and turns them into plain objects.
// Sources, per Claude home folder:
//   <home>/projects/<project>/<session>.jsonl   one transcript per session
//   <home>/projects/<project>/memory/*.md       file-based memory
//   <home>/skills/<name>/SKILL.md               installed skills
//   <home>/settings.json                        hooks
// Several homes can be read at once (for example a personal and a second profile);
// one unreadable home or file never stops the rest.
import fs from 'node:fs';
import path from 'node:path';

/** Parse one JSONL transcript. Bad lines are skipped, never fatal. */
export function parseTranscript(text) {
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch { /* partial line while Claude is writing */ }
  }
  return events;
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SAID_LIMIT = 4000; // characters kept per message, enough for search, handover and export

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter(c => c.type === 'text' && c.text).map(c => c.text).join('\n');
}

/** Summarise one session's events. Pure: same events in, same summary out. */
export function summariseSession(events, { id, project, source = '' } = {}) {
  const s = {
    id: id || events.find(e => e.sessionId)?.sessionId || 'unknown',
    project: project || '',
    source,
    cwd: '',
    title: '',
    model: '',
    firstAt: null,
    lastAt: null,
    lastRole: null,
    pendingTool: false,
    turns: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    byModel: {},
    byDay: {},
    usage: [],
    filesEdited: [],
    todos: [],
    tools: {},
    skills: [],
    subagents: 0,
    said: [],
  };
  const files = new Set();
  const skills = new Set();
  const openTools = new Set();
  for (const e of events) {
    if (e.cwd && !s.cwd) s.cwd = e.cwd;
    if (e.type === 'summary' && e.summary) s.title = e.summary;
    if (e.type !== 'user' && e.type !== 'assistant') continue;
    const at = e.timestamp ? new Date(e.timestamp) : null;
    const validAt = at && !Number.isNaN(at.getTime()) ? at : null;
    const msg = e.message || {};
    const content = Array.isArray(msg.content) ? msg.content : [];
    // A "user" event that only carries tool results is Claude's own work, not you speaking.
    const toolResultsOnly = e.type === 'user' && content.length > 0 && content.every(c => c.type === 'tool_result');
    const role = toolResultsOnly ? 'assistant' : e.type;
    if (validAt) {
      if (!s.firstAt || validAt < s.firstAt) s.firstAt = validAt;
      if (!s.lastAt || validAt >= s.lastAt) { s.lastAt = validAt; s.lastRole = role; }
    }
    for (const c of content) if (c.type === 'tool_result' && c.tool_use_id) openTools.delete(c.tool_use_id);

    const text = textOf(msg.content);
    const isPrompt = e.type === 'user' && typeof msg.content === 'string';
    if (isPrompt) {
      s.turns++;
      if (!s.title) s.title = text.slice(0, 80);
    }
    if (text && (isPrompt || e.type === 'assistant')) {
      s.said.push({ role: e.type, at: validAt ? validAt.toISOString() : null, text: text.slice(0, SAID_LIMIT) });
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
    if (validAt) {
      const day = validAt.toISOString().slice(0, 10);
      s.byDay[day] = (s.byDay[day] || 0) + total;
      if (total) s.usage.push({ at: validAt.toISOString(), tokens: total });
    }
    for (const c of content) {
      if (c.type !== 'tool_use') continue;
      if (c.id) openTools.add(c.id);
      s.tools[c.name] = (s.tools[c.name] || 0) + 1;
      if (EDIT_TOOLS.has(c.name) && c.input?.file_path) files.add(c.input.file_path);
      if (c.name === 'TodoWrite' && Array.isArray(c.input?.todos)) s.todos = c.input.todos;
      if (c.name === 'Task' || c.name === 'Agent') s.subagents++;
      if (c.name === 'Skill' && c.input?.skill) skills.add(c.input.skill);
    }
  }
  s.pendingTool = openTools.size > 0 && s.lastRole === 'assistant';
  s.filesEdited = [...files].sort();
  s.skills = [...skills].sort();
  return s;
}

// The rules for session states. Kept in one table so the README and the tests can point at it.
export const STATE_RULES = {
  workingMinutes: 5,          // any activity this recent counts as working
  pendingToolMinutes: 30,     // a tool call still running (no result yet) counts as working this long
  waitingMinutes: 24 * 60,    // Claude spoke last, within a day: waiting for you
  idleMinutes: 7 * 24 * 60,   // quiet up to a week: idle; older: stale
};

/** working / waiting / idle / stale, from the last event's age, who spoke last and open tool calls. */
export function sessionState(s, now = new Date(), rules = STATE_RULES) {
  if (!s.lastAt) return 'stale';
  const mins = (now - new Date(s.lastAt)) / 60000;
  if (mins < rules.workingMinutes) return 'working';
  if (s.pendingTool && mins < rules.pendingToolMinutes) return 'working';
  if (s.lastRole === 'user' && mins < rules.pendingToolMinutes) return 'working';
  if (mins < rules.waitingMinutes && s.lastRole === 'assistant') return 'waiting';
  if (mins < rules.idleMinutes) return 'idle';
  return 'stale';
}

function readDirSafe(p) {
  try { return fs.readdirSync(p, { withFileTypes: true }); } catch { return []; }
}

/** Read frontmatter `name:`, `description:` and `type:` from a SKILL.md or memory file. */
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^\s*(\w+):\s*(.*)$/.exec(line);
    if (kv && kv[2] !== '') out[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

// A transcript is re-parsed only when its size or modified time changes.
// Large Claude folders hold hundreds of transcripts; most do not change between refreshes.
const cache = new Map();
export const cacheStats = { parsed: 0, reused: 0 };
export function clearCache() { cache.clear(); cacheStats.parsed = 0; cacheStats.reused = 0; }

export function readSession(file, meta) {
  const st = fs.statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) { cacheStats.reused++; return hit.summary; }
  const summary = summariseSession(parseTranscript(fs.readFileSync(file, 'utf8')), meta);
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, summary });
  cacheStats.parsed++;
  return summary;
}

/** Collect one Claude home. Files that cannot be read are listed in `skipped`, not thrown. */
export function collectHome(claudeHome, source = '') {
  const out = { sessions: [], memory: [], skills: [], hooks: [], skipped: [] };
  const skip = (p, err) => out.skipped.push({ path: p, reason: err?.code || err?.message || String(err) });
  const projectsDir = path.join(claudeHome, 'projects');
  if (!fs.existsSync(claudeHome)) { skip(claudeHome, 'folder not found'); return out; }

  for (const proj of readDirSafe(projectsDir)) {
    if (!proj.isDirectory()) continue;
    const pdir = path.join(projectsDir, proj.name);
    for (const f of readDirSafe(pdir)) {
      if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
      const file = path.join(pdir, f.name);
      try {
        out.sessions.push(readSession(file, { id: f.name.replace(/\.jsonl$/, ''), project: proj.name, source }));
      } catch (err) { skip(file, err); }
    }
    for (const f of readDirSafe(path.join(pdir, 'memory'))) {
      if (!f.isFile() || !f.name.endsWith('.md') || f.name === 'MEMORY.md') continue;
      const file = path.join(pdir, 'memory', f.name);
      try {
        const fm = frontmatter(fs.readFileSync(file, 'utf8'));
        out.memory.push({ project: proj.name, file: f.name, name: fm.name || f.name, description: fm.description || '', type: fm.type || '' });
      } catch (err) { skip(file, err); }
    }
  }
  for (const d of readDirSafe(path.join(claudeHome, 'skills'))) {
    const file = path.join(claudeHome, 'skills', d.name, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    try {
      const fm = frontmatter(fs.readFileSync(file, 'utf8'));
      out.skills.push({ name: fm.name || d.name, description: fm.description || '', source });
    } catch (err) { skip(file, err); }
  }
  const settingsFile = path.join(claudeHome, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      for (const [event, list] of Object.entries(settings.hooks || {})) {
        for (const entry of Array.isArray(list) ? list : []) {
          for (const h of entry.hooks || []) out.hooks.push({ event, matcher: entry.matcher || '*', command: h.command || '', source });
        }
      }
    } catch (err) { skip(settingsFile, err); }
  }
  return out;
}

/**
 * Collect from one or more Claude homes and merge them, newest session first.
 * Throws only when every home is missing, so a typo in one path is reported, not hidden.
 */
export function collect(homes) {
  const list = (Array.isArray(homes) ? homes : [homes]).filter(Boolean);
  const merged = { sessions: [], memory: [], skills: [], hooks: [], skipped: [], sources: [] };
  let found = 0;
  for (const home of list) {
    const source = list.length > 1 ? path.basename(home) : '';
    const part = collectHome(home, source);
    if (!part.skipped.some(s => s.path === home)) found++;
    merged.sources.push({ home, sessions: part.sessions.length });
    for (const k of ['sessions', 'memory', 'skills', 'hooks', 'skipped']) merged[k].push(...part[k]);
  }
  if (list.length && !found) throw new Error(`None of these Claude folders exist: ${list.join(', ')}`);
  merged.sessions.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  return merged;
}

/** GODFATHER_HOME may list several folders, separated by ':' (or ';' on Windows). */
export function parseHomes(value, fallback) {
  const parts = String(value || '').split(path.delimiter).map(s => s.trim()).filter(Boolean);
  return parts.length ? parts : [fallback];
}
