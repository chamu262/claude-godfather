// Godfather dashboard front end. Plain JS, no build step.
let data = null;
let selected = null;
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

function bars(rows, label = r => r.name) {
  const max = Math.max(1, ...rows.map(r => r.tokens));
  return rows.map(r => `<div class="barrow"><span class="n" title="${esc(label(r))}">${esc(label(r))}</span><div class="bar" style="width:${(r.tokens / max * 100).toFixed(1)}%"></div><span class="num muted">${fmt(r.tokens)}</span></div>`).join('');
}

function dayChart(days) {
  const w = 640, h = 180, pad = 24;
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
    list.map(s => `<tr class="click ${selected === s.id ? 'sel' : ''}" data-id="${esc(s.id)}"><td>${dot(s.state)}</td><td>${esc(s.title)}</td><td class="muted">${esc(s.project)}</td><td class="muted">${esc(s.model.replace('claude-', ''))}</td><td class="num">${fmt(s.total)}</td><td class="muted">${ago(s.lastAt)}</td></tr>`).join('') + `</table>`;
}

const views = {
  overview() {
    const st = data.states, t = data.tokens;
    const live = data.sessions.filter(s => s.state !== 'stale').slice(0, 6);
    return `
    <div class="grid kpis">
      <div class="card kpi"><div class="l">Working now</div><div class="v">${st.working}</div></div>
      <div class="card kpi"><div class="l">Waiting on you</div><div class="v">${st.waiting}</div></div>
      <div class="card kpi"><div class="l">Idle / stale</div><div class="v">${st.idle} / ${st.stale}</div></div>
      <div class="card kpi"><div class="l">Tokens (all time)</div><div class="v">${fmt(t.total)}</div></div>
      <div class="card kpi"><div class="l">Cache hit</div><div class="v">${(t.cacheHit * 100).toFixed(0)}%</div></div>
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
      (s ? `<div class="card detail"><h2>${esc(s.title)}</h2>
        <div class="grid kpis">
          <div class="card kpi"><div class="l">State</div><div class="v" style="font-size:18px">${dot(s.state)}</div></div>
          <div class="card kpi"><div class="l">Turns</div><div class="v">${s.turns}</div></div>
          <div class="card kpi"><div class="l">Subagents</div><div class="v">${s.subagents}</div></div>
          <div class="card kpi"><div class="l">Context re-read</div><div class="v">${fmt(s.tokens.cacheRead)}</div></div>
        </div>
        <div class="grid two">
          <div><h2>Files changed</h2>${s.filesEdited.map(f => `<div class="file">${esc(f)}</div>`).join('') || '<p class="muted">None</p>'}</div>
          <div><h2>Plan</h2>${s.todos.map(t => `<div>${t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '▸' : '○'} ${esc(t.content)}</div>`).join('') || '<p class="muted">No plan</p>'}</div>
        </div></div>` : '');
  },
  usage() {
    const t = data.tokens;
    return `<div class="grid kpis">
      <div class="card kpi"><div class="l">Input</div><div class="v">${fmt(t.input)}</div></div>
      <div class="card kpi"><div class="l">Output</div><div class="v">${fmt(t.output)}</div></div>
      <div class="card kpi"><div class="l">Cache read</div><div class="v">${fmt(t.cacheRead)}</div></div>
      <div class="card kpi"><div class="l">Cache write</div><div class="v">${fmt(t.cacheWrite)}</div></div>
    </div>
    <div class="card" style="margin-bottom:16px"><h2>Tokens per day</h2>${dayChart(data.byDay)}</div>
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
    </div>`;
  },
};

function render() {
  const [name, id] = (location.hash.slice(1) || 'overview').split('/');
  if (id) selected = decodeURIComponent(id);
  const view = views[name] ? name : 'overview';
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + view));
  $('#view').innerHTML = views[view]();
  document.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => { location.hash = '#sessions/' + encodeURIComponent(tr.dataset.id); });
}

async function load() {
  data = await (await fetch('/api/overview')).json();
  $('#demo').classList.toggle('hidden', !data.demo);
  render();
}
addEventListener('hashchange', render);
load();
setInterval(load, 15000);
