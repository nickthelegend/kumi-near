import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeFor } from '../lib/links.ts';

test('a join code opens the crew with /invite drafted', () => {
  assert.deepEqual(routeFor('kumi://invite/0/aki.kumi-77b50457fb.testnet'), { path: '/chat/c-0', params: { draft: '/invite aki.kumi-77b50457fb.testnet' } });
});
test('a crew link and a bare crew id open the room', () => {
  assert.deepEqual(routeFor('kumi://crew/3'), { path: '/chat/c-3' });
  assert.deepEqual(routeFor(' c-0 '), { path: '/chat/c-0' });
});
test('a pasted testnet account drafts an invite to crew 0', () => {
  assert.deepEqual(routeFor('mika.kumi-77b50457fb.testnet'), { path: '/chat/c-0', params: { draft: '/invite mika.kumi-77b50457fb.testnet' } });
});
test('anything else is refused', () => {
  for (const bad of ['', 'kumi://invite/0/0xabc', 'kumi://join/l-0', 'https://evil.example/aki.testnet', 'kumi://invite/x/aki.testnet', 'aki.near']) assert.equal(routeFor(bad), null, bad);
});
