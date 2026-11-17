import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settle, finishedUnseen, step, noticeFor, CONFIRM_AFTER } from '../dashboard/public/watch.mjs';

test('settle shows a slowdown only after it is seen twice in a row', () => {
  let s = settle(null, 'working');
  s = settle(s, 'waiting');
  assert.equal(s.shown, 'working', 'one reading is not enough');
  s = settle(s, 'waiting');
  assert.equal(s.shown, 'waiting');
  assert.equal(CONFIRM_AFTER, 2);
});

test('settle ignores a one-refresh flicker', () => {
  let s = settle(null, 'waiting');
  s = settle(s, 'idle');
  s = settle(s, 'waiting');
  s = settle(s, 'idle');
  assert.equal(s.shown, 'waiting');
});

test('settle shows working at once', () => {
  assert.equal(settle(settle(null, 'idle'), 'working').shown, 'working');
});

test('finishedUnseen only for working -> waiting/idle while not watching', () => {
  assert.equal(finishedUnseen('working', 'waiting', false), true);
  assert.equal(finishedUnseen('working', 'idle', false), true);
  assert.equal(finishedUnseen('working', 'waiting', true), false);
  assert.equal(finishedUnseen('idle', 'waiting', false), false);
});

test('step marks a finished session unseen, clears it when watched or working again', () => {
  const a = { id: 'a', title: 'A' };
  let m = step(null, [{ ...a, state: 'working' }]).memory;
  m = step(m, [{ ...a, state: 'waiting' }]).memory;
  const r = step(m, [{ ...a, state: 'waiting' }]);
  assert.deepEqual(r.memory.unseen, ['a']);
  assert.deepEqual(r.changes, [{ id: 'a', title: 'A', from: 'working', to: 'waiting' }]);
  assert.equal(noticeFor(r.changes[0]), 'Finished, waiting on you: A');
  assert.deepEqual(step(r.memory, [{ ...a, state: 'waiting' }], 'a').memory.unseen, []);
  assert.deepEqual(step(r.memory, [{ ...a, state: 'working' }]).memory.unseen, []);
});

test('step forgets sessions that are gone', () => {
  const m = step(null, [{ id: 'a', state: 'idle' }]).memory;
  assert.deepEqual(Object.keys(step(m, []).memory.settled), []);
});
