// Builds a handover brief and a Markdown export from a session summary.
// A brief is what a fresh session needs to carry on: goal, where, what was asked last,
// what Claude said last, open plan steps, files changed, skills used and recent commits.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const clip = (s, n) => (s.length > n ? s.slice(0, n).trimEnd() + ' …' : s);

/** Last 5 commits in the session's folder, or [] when it is not a git repo. Never throws. */
export function recentCommits(cwd, count = 5) {
  try {
    if (!cwd || !fs.existsSync(cwd)) return [];
    const out = execFileSync('git', ['-C', cwd, 'log', `-${count}`, '--pretty=format:%h %s'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}

/** Pure: everything except git comes from the summary. */
export function handoverFacts(s) {
  const prompts = s.said.filter(m => m.role === 'user');
  const replies = s.said.filter(m => m.role === 'assistant');
  return {
    goal: prompts[0]?.text || s.title,
    lastAsked: prompts.at(-1)?.text || '',
    lastReply: replies.at(-1)?.text || '',
    open: s.todos.filter(t => t.status !== 'completed'),
    done: s.todos.filter(t => t.status === 'completed'),
    files: s.filesEdited,
    skills: s.skills,
  };
}

export function handoverBrief(s, commits = []) {
  const f = handoverFacts(s);
  const lines = [
    `# Handover: ${s.title}`,
    '',
    `**Goal:** ${clip(f.goal, 400)}`,
    `**Where:** \`${s.cwd || s.project}\``,
    '',
    '## Where it stands',
    `- Last thing asked: ${clip(f.lastAsked, 300) || '—'}`,
    `- Last reply: ${clip(f.lastReply, 400) || '—'}`,
  ];
  if (f.done.length) lines.push('', '## Done', ...f.done.map(t => `- [x] ${t.content}`));
  if (f.open.length) lines.push('', '## Still to do', ...f.open.map(t => `- [ ] ${t.content}`));
  if (f.files.length) lines.push('', '## Files changed', ...f.files.map(p => `- \`${p}\``));
  if (f.skills.length) lines.push('', '## Skills used', `- ${f.skills.join(', ')}`);
  if (commits.length) lines.push('', '## Recent commits', ...commits.map(c => `- ${c}`));
  lines.push('', '## Rules', '- Read the files above before changing them.', '- Ask before deleting anything or pushing.',
    '', '## Report back', '- Start your last message with the commit or PR link, then what is left.');
  return lines.join('\n') + '\n';
}

/** The whole conversation as Markdown (text only; tool output is left out). */
export function exportMarkdown(s) {
  const head = [`# ${s.title}`, '', `- Project: ${s.project}`, `- Folder: ${s.cwd || '—'}`, `- Model: ${s.model || '—'}`,
    `- From ${s.firstAt ? new Date(s.firstAt).toISOString() : '—'} to ${s.lastAt ? new Date(s.lastAt).toISOString() : '—'}`, ''];
  const body = s.said.map(m => `## ${m.role === 'user' ? 'You' : 'Claude'}${m.at ? ` · ${m.at.slice(0, 16).replace('T', ' ')}` : ''}\n\n${m.text}\n`);
  return head.concat(body).join('\n');
}
