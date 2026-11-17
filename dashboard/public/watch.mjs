// Pure helpers the page uses between refreshes. Imported by the tests too, so no DOM here.
//
// Settling: a session's shown state only changes after the new state is seen on two refreshes
// in a row. Switching to "working" is shown at once (you want to know right away), so only
// slowing down is delayed. This stops a row flickering when a transcript is mid-write.
//
// Done, unseen: when a session goes from working to waiting while you are not looking at it,
// it is marked so you can see what finished since you last looked.

export const CONFIRM_AFTER = 2;

/** One settle step for one session. `prev` is { shown, candidate, streak }. */
export function settle(prev, observed) {
  if (!prev) return { shown: observed, candidate: observed, streak: CONFIRM_AFTER };
  if (observed === prev.shown) return { shown: prev.shown, candidate: observed, streak: CONFIRM_AFTER };
  if (observed === 'working') return { shown: 'working', candidate: observed, streak: CONFIRM_AFTER };
  const streak = observed === prev.candidate ? prev.streak + 1 : 1;
  return { shown: streak >= CONFIRM_AFTER ? observed : prev.shown, candidate: observed, streak };
}

export function finishedUnseen(from, to, watching) {
  return from === 'working' && (to === 'waiting' || to === 'idle') && !watching;
}

/**
 * Apply one refresh. `memory` is { settled: {id: settleState}, unseen: [ids] }.
 * Returns the new memory and the changes worth telling the user about.
 */
export function step(memory, sessions, watchingId = null) {
  const settled = { ...(memory?.settled || {}) };
  const unseen = new Set(memory?.unseen || []);
  const changes = [];
  for (const s of sessions) {
    const before = settled[s.id];
    const after = settle(before, s.state);
    settled[s.id] = after;
    if (before && before.shown !== after.shown) {
      changes.push({ id: s.id, title: s.title, from: before.shown, to: after.shown });
      if (finishedUnseen(before.shown, after.shown, watchingId === s.id)) unseen.add(s.id);
      if (after.shown === 'working') unseen.delete(s.id);
    }
  }
  if (watchingId) unseen.delete(watchingId);
  const ids = new Set(sessions.map(s => s.id));
  for (const id of Object.keys(settled)) if (!ids.has(id)) delete settled[id];
  for (const id of unseen) if (!ids.has(id)) unseen.delete(id);
  return { memory: { settled, unseen: [...unseen] }, changes };
}

/** What a change should say in a notification, or null for changes not worth a ping. */
export function noticeFor(change) {
  if (change.from === 'working' && change.to === 'waiting') return `Finished, waiting on you: ${change.title}`;
  if (change.from !== 'working' && change.to === 'working') return null;
  return null;
}
