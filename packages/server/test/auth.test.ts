import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { KeyPair } from '@near-js/crypto';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import type { Relayer } from '../src/relayer.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it('lets a returning browser reuse its account key and keeps the stored handle', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kumi-auth-')); dirs.push(dir);
  const store = new Store(dir);
  const email = 'returning@example.test';
  const publicKey = KeyPair.fromRandom('ed25519').getPublicKey().toString();
  const accountId = 'returning.relayer.testnet';
  store.savePlayer({ accountId, handle: 'returning', publicKey,
    emailHash: createHash('sha256').update(`kumi:${email}`).digest('hex'), createdTx: 'recorded', createdAt: Date.now() });
  const relayer = { accountId: 'relayer.testnet', createPlayer: () => { throw new Error('A returning player must not create an account'); } } as unknown as Relayer;
  const app = createApp({ hub: 'hub.testnet', store, relayer, giftYocto: 0n });
  const start = await app.routes['POST /api/auth/start']({ email }, new URL('http://localhost')) as { accountId: string; previewCode: string };
  expect(start.accountId).toBe(accountId);
  const result = await app.routes['POST /api/auth/verify']({ email, code: start.previewCode, handle: 'different', publicKey }, new URL('http://localhost'));
  expect(result).toEqual({ accountId, handle: 'returning', created: false });
  const second = await app.routes['POST /api/auth/start']({ email }, new URL('http://localhost')) as { previewCode: string };
  await expect(app.routes['POST /api/auth/verify']({ email, code: second.previewCode, publicKey: KeyPair.fromRandom('ed25519').getPublicKey().toString() }, new URL('http://localhost'))).rejects.toThrow('another browser');
  app.server.close();
});
