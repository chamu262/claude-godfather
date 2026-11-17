import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript, summariseSession, sessionState, frontmatter } from '../dashboard/lib/collect.mjs';

const lines = [
  { type: 'user', sessionId: 's1', cwd: '/w', timestamp: '2026-01-01T10:00:00Z', message: { content: 'Fix the bug' } },
  { type: 'assistant', timestamp: '2026-01-01T10:01:00Z', message: { model: 'claude-sonnet-4-5',
    usage: { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 100, cache_creation_input_tokens: 5 },
    content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.js' } },
              { type: 'tool_use', name: 'TodoWrite', input: { todos: [{ content: 'x', status: 'pending' }] } },
              { type: 'tool_use', name: 'Agent', input: {} }] } },
];
const text = lines.map(l => JSON.stringify(l)).join('\n') + '\n{broken json';

test('parseTranscript skips bad lines', () => {
  assert.equal(parseTranscript(text).length, 2);
});

test('summariseSession counts tokens, files, todos, subagents', () => {
  const s = summariseSession(parseTranscript(text), { id: 's1', project: 'p' });
  assert.equal(s.title, 'Fix the bug');
  assert.deepEqual(s.tokens, { input: 10, output: 20, cacheRead: 100, cacheWrite: 5 });
  assert.deepEqual(s.filesEdited, ['a.js']);
  assert.equal(s.todos.length, 1);
  assert.equal(s.subagents, 1);
  assert.equal(s.byDay['2026-01-01'], 135);
  assert.equal(s.lastRole, 'assistant');
});

test('sessionState buckets by age and last speaker', () => {
  const s = summariseSession(parseTranscript(text));
  const at = m => new Date(+new Date('2026-01-01T10:01:00Z') + m * 60000);
  assert.equal(sessionState(s, at(1)), 'working');
  assert.equal(sessionState(s, at(60)), 'waiting');
  assert.equal(sessionState(s, at(60 * 48)), 'idle');
  assert.equal(sessionState(s, at(60 * 24 * 8)), 'stale');
});

test('frontmatter reads name and description', () => {
  assert.deepEqual(frontmatter('---\nname: x\ndescription: "hi"\n---\nbody'), { name: 'x', description: 'hi' });
  assert.deepEqual(frontmatter('no frontmatter'), {});
});
