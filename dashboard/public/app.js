// Godfather dashboard front end. Plain JS module, no build step.
import { step, noticeFor } from './watch.mjs';

let data = null;
let selected = null;
let memory = null;          // settled states and "done, unseen" between refreshes
let searchResult = null;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('godfather.' + k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('godfather.' + k, JSON.stringify(v)); } catch { /* private window */ } },
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n);
function ago(iso) {
  if (!iso) return '—';
  const m = (new Date(data.generatedAt) - new Date(iso)) / 60000;
  if (m < 60) return Math.round(m) + 'm ago';
  if (m < 1440) return Math.round(m / 60) + 'h ago';
  return Math.round(m / 1440) + 'd ago';
}
const dot = st => `<span class="dot s-${st}"></span>${st}`;
const isUnseen = id => memory?.unseen.includes(id);
const badge = id => isUnseen(id) ? ' <span class="pill new">new</span>' : '';

function windowCard(w) {
  const pct = w.percent;
  return `<div class="card kpi"><div class="l">${esc(w.label)}</div><div class="v">${fmt(w.used)}${pct == null ? '' : ` <span class="muted" style="font-size:15px">${pct.toFixed(0)}%</span>`}</div>
    ${pct == null ? '<div class="muted" style="font-size:12px">tokens · set a limit to see %</div>' : `<div class="meter"><div style="width:${pct}%" class="${pct > 80 ? 'hot' : ''}"></div></div>`}</div>`;
}

function bars(rows, label = r => r.name) {
  const max = Math.max(1, ...rows.map(r => r.tokens));
  return rows.map(r => `<div class="barrow"><span class="n" title="${esc(label(r))}">${esc(label(r))}</span><div class="bar" style="width:${(r.tokens / max * 100).toFixed(1)}%"></div><span class="num muted">${fmt(r.tokens)}</span></div>`).join('');
}

function dayChart(days, w = 640) {
  const h = 180, pad = 24;
  const max = Math.max(1, ...days.map(d => d.tokens));
  const bw = (w - pad * 2) / Math.max(1, days.length);
  const rects = days.map((d, i) => {
    const bh = (d.tokens / max) * (h - pad * 2);
    return `<rect x="${pad + i * bw + 2}" y="${h - pad - bh}" width="${Math.max(2, bw - 4)}" height="${bh}" rx="3" fill="#c9a24b"><title>${d.day}: ${fmt(d.tokens)}</title></rect>` +
      (i % Math.ceil(days.length / 8) === 0 ? `<text x="${pad + i * bw + bw / 2}" y="${h - 6}" text-anchor="middle">${d.day.slice(5)}</text>` : '');
  }).join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Tokens per day">${rects}</svg>`;
}

function sessionRows(list) {
  return `<table><tr><th>State</th><th>Session</th><th>Project</th><th>Model</th><th class="num">Tokens</th><th>Last active</th></tr>` +
    list.map(s => `<tr class="click ${selected === s.id ? 'sel' : ''}" data-id="${esc(s.id)}"><td class="st">${dot(s.state)}</td><td>${esc(s.title)}${badge(s.id)}</td><td class="muted">${esc(s.project)}</td><td class="muted">${esc((s.model || '').replace('claude-', ''))}</td><td class="num">${fmt(s.total)}</td><td class="muted">${ago(s.lastAt)}</td></tr>`).join('') + `</table>`;
}

const views = {
  overview() {
    if (!data.sessions.length) return firstRun();
    const st = data.states, t = data.tokens;
    const live = data.sessions.filter(s => s.state !== 'stale').slice(0, 6);
    return `
    <div class="grid kpis">
      <div class="card kpi"><div class="l">Working now</div><div class="v">${st.working}</div></div>
      <div class="card kpi"><div class="l">Waiting on you</div><div class="v">${st.waiting}</div></div>
      <div class="card kpi"><div class="l">Idle / stale</div><div class="v">${st.idle} / ${st.stale}</div></div>
      <div class="card kpi"><div class="l">Done, unseen</div><div class="v">${memory?.unseen.length || 0}</div></div>
      ${data.windows.map(windowCard).join('')}
      <div class="card kpi"><div class="l">Collisions</div><div class="v">${data.collisions.length}</div></div>
    </div>
    <div class="grid two">
      <div class="card"><h2>Live sessions</h2>${sessionRows(live)}</div>
      <div class="card"><h2>Advisor</h2>${data.advice.map(a => `<div class="tip ${a.level}">${esc(a.text)}</div>`).join('') || '<p class="muted">Nothing to suggest.</p>'}
        <h2 style="margin-top:18px">Tokens per day</h2>${dayChart(data.byDay)}</div>
    </div>`;
  },
  sessions() {
    const s = data.sessions.find(x => x.id === selected);
    return `<div class="card"><h2>All sessions <span class="muted">(${data.sessions.length}) · click one for detail</span></h2>${sessionRows(data.sessions)}</div>` +
      (s ? `<div class="card detail"><div class="row"><h2>${esc(s.title)}</h2>
          <div class="actions"><button data-act="handover">Draft handover brief</button><button data-act="export">Export to Markdown</button></div></div>
        <div class="muted" style="margin:-6px 0 12px">${esc(s.cwd || s.project)}${s.skills.length ? ' · skills: ' + s.skills.map(esc).join(', ') : ''}${s.pendingTool ? ' · a tool call is still running' : ''}</div>
        <div class="grid kpis">
          <div class="card kpi"><div class="l">State</div><div class="v" style="font-size:18px">${dot(s.state)}</div></div>
          <div class="card kpi"><div class="l">Turns</div><div class="v">${s.turns}</div></div>
          <div class="card kpi"><div class="l">Subagents</div><div class="v">${s.subagents}</div></div>
          <div class="card kpi"><div class="l">Context re-read</div><div class="v">${fmt(s.tokens.cacheRead)}</div></div>
        </div>
        <div class="grid two">
          <div><h2>Files changed</h2>${s.filesEdited.map(f => `<div class="file">${esc(f)}</div>`).join('') || '<p class="muted">None</p>'}</div>
          <div><h2>Plan</h2>${s.todos.map(t => `<div>${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '○'} ${esc(t.content)}</div>`).join('') || '<p class="muted">No plan</p>'}</div>
        </div><pre id="brief" class="brief hidden"></pre></div>` : '');
  },
  search() {
    const r = searchResult;
    if (!r) return '<div class="card"><p class="muted">Type in the search box: titles, projects, files and what was said.</p></div>';
    return `<div class="card"><h2>${r.hits.length} session(s) match “${esc(r.query)}”</h2>
      <table>${r.hits.map(h => `<tr class="click" data-id="${esc(h.id)}"><td><b>${esc(h.title)}</b> <span class="muted">· ${esc(h.project)} · ${ago(h.lastAt)}</span>
        ${h.snippets.map(x => `<div class="snip"><span class="pill">${esc(x.kind)}</span> ${mark(x.text, r.query)}</div>`).join('')}</td></tr>`).join('')}</table></div>`;
  },
  usage() {
    const t = data.tokens;
    return `<div class="grid kpis">
      <div class="card kpi"><div class="l">Input</div><div class="v">${fmt(t.input)}</div></div>
      <div class="card kpi"><div class="l">Output</div><div class="v">${fmt(t.output)}</div></div>
      <div class="card kpi"><div class="l">Cache read</div><div class="v">${fmt(t.cacheRead)}</div></div>
      <div class="card kpi"><div class="l">Cache write</div><div class="v">${fmt(t.cacheWrite)}</div></div>
    </div>
    <div class="grid two" style="margin-bottom:16px">
      ${data.windows.map(w => `<div class="card"><h2>${esc(w.label)} <span class="muted">· ${fmt(w.used)} tokens${w.percent == null ? '' : ` · ${w.percent.toFixed(0)}% of limit`}</span></h2>
        ${w.percent == null ? '' : `<div class="meter" style="margin-bottom:12px"><div style="width:${w.percent}%" class="${w.percent > 80 ? 'hot' : ''}"></div></div>`}
        <div class="muted" style="font-size:12px;margin-bottom:4px">What is using it</div>${bars(w.top.map(x => ({ name: x.title, tokens: x.tokens }))) || '<p class="muted">Nothing in this window.</p>'}</div>`).join('')}
    </div>
    <div class="card" style="margin-bottom:16px"><h2>Tokens per day</h2>${dayChart(data.byDay, 1280)}</div>
    <div class="grid two">
      <div class="card"><h2>By project</h2>${bars(data.byProject)}</div>
      <div class="card"><h2>By model</h2>${bars(data.byModel, r => r.name.replace('claude-', ''))}</div>
      <div class="card"><h2>Top sessions</h2>${bars([...data.sessions].sort((a, b) => b.total - a.total).slice(0, 6).map(s => ({ name: s.title, tokens: s.total })))}</div>
    </div>
    <p class="muted">Cache reads are context re-sent each turn. A high cache hit is good; the cost driver is how big that context is.</p>`;
  },
  tasks() {
    return `<div class="grid two">
      <div class="card"><h2>Open plan steps <span class="muted">(${data.openTasks.length})</span></h2>
        <table><tr><th></th><th>Step</th><th>Session</th></tr>${data.openTasks.map(t => `<tr><td>${t.status === 'in_progress' ? '▸' : '○'}</td><td>${esc(t.task)}</td><td class="muted">${esc(t.title)}</td></tr>`).join('')}</table></div>
      <div class="card"><h2>Collisions <span class="muted">· two live sessions editing the same file</span></h2>
        ${data.collisions.map(c => `<div class="tip act"><div class="file">${esc(c.file)}</div>${c.sessions.map(s => `<div>${dot(s.state)} ${esc(s.title)}</div>`).join('')}</div>`).join('') || '<p class="muted">No collisions.</p>'}</div>
    </div>`;
  },
  setup() {
    return `<div class="grid two">
      <div class="card"><h2>Skills <span class="muted">(${data.skills.length})</span></h2><table>${data.skills.map(s => `<tr><td><b>${esc(s.name)}</b><div class="muted">${esc(s.description)}</div></td></tr>`).join('')}</table></div>
      <div class="card"><h2>Memory <span class="muted">(${data.memory.length})</span></h2><table><tr><th>Type</th><th>Memory</th></tr>${data.memory.map(m => `<tr><td><span class="pill">${esc(m.type)}</span></td><td><b>${esc(m.name)}</b><div class="muted">${esc(m.description)}</div></td></tr>`).join('')}</table></div>
      <div class="card"><h2>Hooks <span class="muted">(${data.hooks.length})</span></h2><table><tr><th>Event</th><th>Runs</th></tr>${data.hooks.map(h => `<tr><td>${esc(h.event)}<div class="muted">${esc(h.matcher)}</div></td><td class="file">${esc(h.command)}</td></tr>`).join('')}</table></div>
      <div class="card"><h2>Folders read</h2><table>${data.sources.map(x => `<tr><td class="file">${data.demo ? 'demo data (a temporary folder)' : esc(x.home)}</td><td class="num">${x.sessions} sessions</td></tr>`).join('')}</table>
        ${data.skipped.length ? `<h2 style="margin-top:14px">Skipped <span class="muted">(${data.skipped.length}) · could not be read</span></h2>${data.skipped.map(k => `<div class="file">${esc(k.path)} <span class="muted">${esc(k.reason)}</span></div>`).join('')}` : '<p class="muted">Every file was readable.</p>'}</div>
    </div>`;
  },
};

function mark(text, q) {
  const safe = esc(text);
  const i = safe.toLowerCase().indexOf(esc(q).toLowerCase());
  return i < 0 ? safe : safe.slice(0, i) + '<mark>' + safe.slice(i, i + esc(q).length) + '</mark>' + safe.slice(i + esc(q).length);
}

function firstRun() {
  return `<div class="card first"><h2>No Claude Code sessions found yet</h2>
    <p>The dashboard reads <span class="file">${esc(data.sources.map(x => x.home).join(', '))}</span>. Nothing there yet, which is normal on a new computer.</p>
    <ol><li>Run <span class="file">./install.sh --check</span> to see what is set up.</li>
    <li>Open Claude Code in any folder and say <b>"set up the Godfather"</b>.</li>
    <li>Or try it on made-up data: <span class="file">npm run demo</span>.</li></ol>
    <p class="muted">Reading a different folder? Set <span class="file">GODFATHER_HOME</span>.</p></div>`;
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 6000);
  if (store.get('notify', false) && 'Notification' in window && Notification.permission === 'granted') new Notification('Godfather', { body: text });
}

async function showText(kind) {
  const res = await fetch(`/api/session/${encodeURIComponent(selected)}/${kind}`);
  const text = await res.text();
  if (kind === 'export') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    a.download = `${selected}.md`; a.click();
    return;
  }
  const pre = $('#brief');
  pre.textContent = text; pre.classList.remove('hidden');
  try { await navigator.clipboard.writeText(text); toast('Handover brief copied. Paste it into a new session.'); } catch { /* clipboard blocked: the brief is shown below */ }
}

function render() {
  const [name, id, open] = (location.hash.slice(1) || 'overview').split('/');
  if (id) selected = decodeURIComponent(id);
  const view = views[name] ? name : 'overview';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + view));
  $('#view').innerHTML = views[view]();
  document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => { location.hash = '#sessions/' + encodeURIComponent(tr.dataset.id); });
  document.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => showText(b.dataset.act));
  if (open === 'handover' && $('#brief')?.classList.contains('hidden')) showText('handover'); // deep link: #sessions/<id>/handover
  const n = memory?.unseen.length || 0;
  document.title = n ? `(${n}) Godfather` : 'Godfather';
}

async function load() {
  data = await (await fetch('/api/overview')).json();
  $('#demo').classList.toggle('hidden', !data.demo);
  const watching = location.hash.startsWith('#sessions/') ? selected : null;
  const result = step(memory || store.get('memory', null), data.sessions, watching);
  const first = !memory;
  memory = result.memory;
  store.set('memory', memory);
  for (const s of data.sessions) s.state = memory.settled[s.id]?.shown || s.state;
  if (!first) for (const c of result.changes) { const n = noticeFor(c); if (n) toast(n); }
  render();
}

let typing;
$('#q').addEventListener('input', e => {
  clearTimeout(typing);
  const q = e.target.value.trim();
  typing = setTimeout(async () => {
    if (q.length < 2) { searchResult = null; if (location.hash === '#search') render(); return; }
    searchResult = await (await fetch('/api/search?q=' + encodeURIComponent(q))).json();
    location.hash === '#search' ? render() : (location.hash = '#search');
  }, 200);
});
addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== $('#q')) { e.preventDefault(); $('#q').focus(); }
  if (e.key === 'Escape') $('#q').blur();
});
const bell = $('#notify');
const paintBell = () => { bell.textContent = store.get('notify', false) ? 'Notifications on' : 'Notify me'; };
bell.onclick = async () => {
  const on = !store.get('notify', false);
  if (on && 'Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  store.set('notify', on); paintBell();
};
paintBell();
const startQuery = new URLSearchParams(location.search).get('q'); // link straight to a search: /?q=timeout
if (startQuery) { $('#q').value = startQuery; $('#q').dispatchEvent(new Event('input')); }
addEventListener('hashchange', render);
load();
setInterval(load, Number(new URLSearchParams(location.search).get('every')) || 15000);
