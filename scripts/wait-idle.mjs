#!/usr/bin/env node
// Waits until no Claude Code session is working, then exits 0. Exits 1 if the time runs out.
// Use it before housekeeping (archiving, cleaning worktrees, updating skills) so nothing
// is changed under a session that is still busy.
//   node scripts/wait-idle.mjs                 wait up to 10 minutes
//   node scripts/wait-idle.mjs --timeout 120   wait up to 2 minutes
//   GODFATHER_HOME=/path/.claude node scripts/wait-idle.mjs
import os from 'node:os';
import path from 'node:path';
import { collect, parseHomes } from '../dashboard/lib/collect.mjs';
import { stillWorking, pauseProgress } from '../dashboard/lib/stats.mjs';

const arg = name => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const timeout = Number(arg('--timeout') || 600);
const every = Number(arg('--every') || 5);
const homes = parseHomes(process.env.GODFATHER_HOME, path.join(os.homedir(), '.claude'));
const startedAt = Date.now();

function tick() {
  const now = Date.now();
  const p = pauseProgress(stillWorking(collect(homes).sessions, new Date(now)), startedAt, now, timeout);
  if (p.done) {
    if (p.timedOut) {
      console.log(`Gave up after ${timeout}s. Still working:\n${p.waitingOn.map(s => `  - ${s.title}`).join('\n')}`);
      process.exit(1);
    }
    console.log('Every session is idle. Safe to tidy up.');
    process.exit(0);
  }
  console.log(`${p.secondsLeft}s left · waiting on ${p.waitingOn.length}: ${p.waitingOn.map(s => s.title).join(', ')}`);
  setTimeout(tick, every * 1000);
}
tick();
