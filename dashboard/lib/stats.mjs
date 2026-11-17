// Turns collected sessions into the numbers the dashboard shows.
import { sessionState } from './collect.mjs';

const total = t => t.input + t.output + t.cacheRead + t.cacheWrite;

// Fields the overview sends to the page. Full message text stays on the server (search, handover, export).
const LIGHT = ({ said, usage, ...rest }) => rest;

export function overview(data, now = new Date(), opts = {}) {
  const sessions = data.sessions.map(s => ({ ...s, state: sessionState(s, now), total: total(s.tokens) }));
  const states = { working: 0, waiting: 0, idle: 0, stale: 0 };
  for (const s of sessions) states[s.state]++;

  const byDay = {}, byModel = {}, byProject = {};
  let all = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const s of sessions) {
    for (const [d, v] of Object.entries(s.byDay)) byDay[d] = (byDay[d] || 0) + v;
    for (const [m, v] of Object.entries(s.byModel)) byModel[m] = (byModel[m] || 0) + v;
    byProject[s.project] = (byProject[s.project] || 0) + s.total;
    for (const k of Object.keys(all)) all[k] += s.tokens[k];
  }
  const inputSide = all.input + all.cacheRead + all.cacheWrite;
  const cacheHit = inputSide ? all.cacheRead / inputSide : 0;

  return {
    generatedAt: now.toISOString(),
    states,
    tokens: { ...all, total: total(all), cacheHit },
    byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, tokens]) => ({ day, tokens })),
    byModel: rank(byModel),
    byProject: rank(byProject),
    windows: usageWindows(sessions, now, opts.limits),
    sessions: sessions.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).map(LIGHT),
    collisions: collisions(sessions),
    openTasks: openTasks(sessions),
    advice: advice(sessions, cacheHit),
    skills: data.skills,
    memory: data.memory,
    hooks: data.hooks,
    skipped: data.skipped || [],
    sources: data.sources || [],
  };
}

const rank = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name, tokens]) => ({ name, tokens }));

/** Files edited by two or more sessions that are not stale. */
export function collisions(sessions) {
  const map = new Map();
  for (const s of sessions) {
    if (s.state === 'stale') continue;
    for (const f of s.filesEdited) {
      if (!map.has(f)) map.set(f, []);
      map.get(f).push({ id: s.id, title: s.title, state: s.state });
    }
  }
  return [...map].filter(([, list]) => list.length > 1).map(([file, sessions]) => ({ file, sessions }));
}

export function openTasks(sessions) {
  const out = [];
  for (const s of sessions) {
    for (const t of s.todos) if (t.status !== 'completed') out.push({ session: s.id, title: s.title, task: t.content, status: t.status });
  }
  return out;
}

/** Plain, rule-based suggestions. Nothing here calls a model. */
export function advice(sessions, cacheHit) {
  const tips = [];
  const big = sessions.filter(s => s.state !== 'stale' && s.tokens.cacheRead > 5_000_000);
  if (big.length) tips.push({ level: 'save', text: `${big.length} live session(s) re-read over 5M tokens of context. Hand them off to a fresh session with a short brief.` });
  const opusQuick = sessions.filter(s => /opus/.test(s.model) && s.turns <= 2 && s.total < 200_000);
  if (opusQuick.length) tips.push({ level: 'save', text: `${opusQuick.length} short Q&A session(s) ran on Opus. A smaller model is fine for quick questions.` });
  const stale = sessions.filter(s => s.state === 'stale');
  if (stale.length) tips.push({ level: 'tidy', text: `${stale.length} session(s) untouched for a week. Archive them to keep the sidebar clean.` });
  const waiting = sessions.filter(s => s.state === 'waiting');
  if (waiting.length) tips.push({ level: 'act', text: `${waiting.length} session(s) are waiting on your answer.` });
  if (cacheHit && cacheHit < 0.8) tips.push({ level: 'save', text: `Cache hit is ${(cacheHit * 100).toFixed(0)}%. Long pauses between turns let the cache expire.` });
  return tips;
}

// Claude plans limit use over a rolling 5-hour window and a 7-day window.
// Plan limits are not stored locally, so the numbers are tokens; set a limit to also see a percentage.
export const WINDOWS = [
  { key: 'fiveHour', label: '5-hour window', hours: 5 },
  { key: 'sevenDay', label: '7-day window', hours: 24 * 7 },
];

/** Tokens used inside each rolling window, and which sessions used them. */
export function usageWindows(sessions, now = new Date(), limits = {}) {
  return WINDOWS.map(w => {
    const since = +now - w.hours * 3600 * 1000;
    const per = [];
    for (const s of sessions) {
      let n = 0;
      for (const u of s.usage || []) { const t = +new Date(u.at); if (t > since && t <= +now) n += u.tokens; }
      if (n) per.push({ id: s.id, title: s.title, tokens: n });
    }
    per.sort((a, b) => b.tokens - a.tokens);
    const used = per.reduce((a, b) => a + b.tokens, 0);
    const limit = Number(limits?.[w.key]) || 0;
    return { ...w, used, limit, percent: limit ? Math.min(100, (used / limit) * 100) : null, top: per.slice(0, 5) };
  });
}

/** Case-insensitive search over titles, projects, files and message text. Returns a snippet per hit. */
export function search(sessions, query, max = 30) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const hits = [];
  for (const s of sessions) {
    const where = [];
    if ((s.title || '').toLowerCase().includes(q)) where.push({ kind: 'title', text: s.title });
    if ((s.project || '').toLowerCase().includes(q)) where.push({ kind: 'project', text: s.project });
    for (const f of s.filesEdited || []) if (f.toLowerCase().includes(q)) where.push({ kind: 'file', text: f });
    for (const m of s.said || []) {
      const i = m.text.toLowerCase().indexOf(q);
      if (i < 0) continue;
      const start = Math.max(0, i - 50);
      where.push({ kind: m.role, text: (start ? '…' : '') + m.text.slice(start, i + q.length + 70).replace(/\s+/g, ' ') + '…' });
    }
    const seen = new Set();
    const snippets = where.filter(w => !seen.has(w.text) && seen.add(w.text)).slice(0, 3); // a repeated reply shows once
    if (where.length) hits.push({ id: s.id, title: s.title, project: s.project, lastAt: s.lastAt, matches: where.length, snippets });
  }
  return hits.sort((a, b) => b.matches - a.matches || (new Date(b.lastAt) - new Date(a.lastAt))).slice(0, max);
}

/** Sessions still working, for "wait until everything is idle" before housekeeping. */
export function stillWorking(sessions, now = new Date()) {
  return sessions.filter(s => sessionState(s, now) === 'working').map(s => ({ id: s.id, title: s.title }));
}

/** Progress of a wait: who is still working and how many seconds are left before giving up. */
export function pauseProgress(working, startedAt, now, timeoutSeconds) {
  const left = Math.max(0, Math.ceil(timeoutSeconds - (now - startedAt) / 1000));
  return { waitingOn: working, secondsLeft: left, done: working.length === 0 || left === 0, timedOut: working.length > 0 && left === 0 };
}
