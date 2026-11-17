// Turns collected sessions into the numbers the dashboard shows.
import { sessionState } from './collect.mjs';

const total = t => t.input + t.output + t.cacheRead + t.cacheWrite;

export function overview(data, now = new Date()) {
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
    sessions: sessions.sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)),
    collisions: collisions(sessions),
    openTasks: openTasks(sessions),
    advice: advice(sessions, cacheHit),
    skills: data.skills,
    memory: data.memory,
    hooks: data.hooks,
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
