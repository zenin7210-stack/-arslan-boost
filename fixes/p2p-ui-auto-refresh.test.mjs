import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const client = readFileSync(new URL('../public/assets/p2p.js', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../src/p2p.mjs', import.meta.url), 'utf8');

test('card invoice checks server status automatically without buyer claim', () => {
  assert.match(client, /const queueInvoicePoll = \(\) =>/);
  assert.match(client, /ui\.api\(`invoice\/\$\{invoice\.id\}\/status`, null, 'GET'\)/);
  assert.match(client, /if \(current\.status !== 'pending' \|\| current\.checkedAt\)/);
  assert.match(client, /renderCheck\(\)/);
  assert.match(client, /if \(document\.visibilityState !== 'hidden'\)/);
});
test('UI labels automatic bank confirmation separately from manual verification', () => {
  assert.match(backend, /verificationMode: env\.P2P_MODE === 'private' \? 'automatic' : 'manual'/);
  assert.match(client, /invoice\.verificationMode === 'automatic' \? 'checkingAuto' : 'checkingNote'/);
  assert.match(client, /invoice\.verificationMode === 'automatic' \? 'waitingAuto' : 'waiting'/);
});
test('claim button never changes balance, auto-poll is read-only', () => {
  assert.match(client, /ui\.api\(`invoice\/\$\{invoice\.id\}\/check`, \{\}\)/);
  assert.doesNotMatch(client, /options\.balance\s*\+=/);
  assert.doesNotMatch(client, /invoice\.status\s*=\s*['"]paid['"]/);
});
