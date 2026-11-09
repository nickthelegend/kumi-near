// Shared helpers for the testnet scripts. Keys are read from gitignored .near-credentials/ and are
// never printed. Every transaction is recorded with its hash in the evidence file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Account, Connection, InMemorySigner, KeyPair, keyStores } from 'near-api-js';
import { txFailure, txUrl, TESTNET_RPC, type TxStatus } from '@kumi/sdk';

export const ROOT = resolve(import.meta.dirname, '..');
export const RPC = process.env.NEAR_RPC_URL ?? TESTNET_RPC;
export const ONE = 10n ** 24n;
export const TGAS = 10n ** 12n;
export const near = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
export const fmt = (y: bigint) => (Number(y / 10n ** 21n) / 1000).toFixed(3);

if (existsSync(resolve(ROOT, '.env'))) process.loadEnvFile(resolve(ROOT, '.env'));
mkdirSync(resolve(ROOT, '.near-credentials'), { recursive: true, mode: 0o700 });

export type Creds = { account_id: string; private_key: string };
export const credPath = (id: string) => resolve(ROOT, '.near-credentials', `${id}.json`);
export function readCreds(path: string): Creds {
  const c = JSON.parse(readFileSync(path, 'utf8')) as Partial<Creds> & { id?: string; key?: string; accounts?: unknown };
  const out = { account_id: c.account_id ?? c.id ?? '', private_key: c.private_key ?? c.key ?? '' };
  if (!out.account_id || !out.private_key) throw new Error(`No account key in ${path}`);
  return out;
}
export function saveCreds(c: Creds) { writeFileSync(credPath(c.account_id), JSON.stringify(c), { mode: 0o600, flag: 'wx' }); }

export function account(c: Creds): Account {
  const ks = new keyStores.InMemoryKeyStore();
  ks.setKey('testnet', c.account_id, KeyPair.fromString(c.private_key as `ed25519:${string}`));
  const connection = Connection.fromConfig({ networkId: 'testnet', provider: { type: 'JsonRpcProvider', args: { url: RPC } }, signer: new InMemorySigner(ks), jsvmAccountId: 'jsvm.testnet' });
  return new Account(connection, c.account_id);
}

export type Evidence = {
  network: 'testnet'; rpc: string; started_at: string; updated_at?: string;
  accounts: Record<string, string>; config: Record<string, unknown>;
  transactions: { step: string; hash: string; signer: string; receiver: string; explorer: string; note?: string }[];
  state?: Record<string, unknown>;
};

export function evidenceFile(): string { return resolve(ROOT, process.env.KUMI_EVIDENCE ?? 'deployments/testnet-2026-11-09.json'); }
export function loadEvidence(): Evidence {
  const f = evidenceFile();
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8')) as Evidence;
  return { network: 'testnet', rpc: RPC, started_at: new Date().toISOString(), accounts: {}, config: {}, transactions: [] };
}
export function saveEvidence(e: Evidence) {
  mkdirSync(resolve(ROOT, 'deployments'), { recursive: true });
  e.updated_at = new Date().toISOString();
  writeFileSync(evidenceFile(), JSON.stringify(e, null, 2) + '\n');
}
export const done = (e: Evidence, step: string) => e.transactions.some(t => t.step === step);

/** Records a finished transaction and throws (after recording) if any receipt failed. */
export function record(e: Evidence, step: string, outcome: unknown, note?: string): string {
  const tx = outcome as TxStatus;
  const hash = tx.transaction.hash;
  const failure = txFailure(tx);
  e.transactions.push({ step, hash, signer: tx.transaction.signer_id, receiver: tx.transaction.receiver_id, explorer: txUrl(hash), ...(note || failure ? { note: failure ? `FAILED: ${failure}` : note } : {}) });
  saveEvidence(e);
  if (failure) throw new Error(`${step} failed on testnet (${hash}): ${failure}`);
  console.log(`  ok  ${step.padEnd(30)} ${hash}`);
  return hash;
}
