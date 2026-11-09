// NEAR RPC reads for the Kumi hub, its pools and the crew DAOs. Works in Node 22 and browsers.
import { Buffer } from 'buffer';

export const TESTNET_RPC = 'https://test.rpc.fastnear.com';
export const SPUTNIK_TESTNET_FACTORY = 'sputnikv2.testnet';
export const EXPLORER = 'https://testnet.nearblocks.io';
export const ONE_NEAR = 10n ** 24n;

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;

export class ChainError extends Error {}

export async function rpc<T>(method: string, params: unknown, url = TESTNET_RPC): Promise<T> {
  const response = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'kumi', method, params }),
  });
  if (!response.ok) throw new ChainError(`NEAR RPC HTTP ${response.status} from ${url}`);
  const body = await response.json() as { result?: T & { error?: string }; error?: { cause?: { name?: string }; data?: unknown; message?: string } };
  if (body.error) throw new ChainError(`NEAR RPC: ${body.error.cause?.name ?? body.error.message ?? 'error'} ${JSON.stringify(body.error.data ?? '').slice(0, 200)}`);
  if (body.result && typeof body.result === 'object' && 'error' in body.result && body.result.error) throw new ChainError(`NEAR RPC: ${body.result.error}`);
  if (body.result === undefined) throw new ChainError('NEAR RPC returned no result');
  return body.result;
}

export async function query<T>(params: Record<string, unknown>, url = TESTNET_RPC): Promise<T> {
  return rpc<T>('query', { finality: 'final', ...params }, url);
}

export async function view<T>(contractId: string, methodName: string, args: Record<string, unknown> = {}, url = TESTNET_RPC): Promise<T> {
  const result = await query<{ result: number[] }>({
    request_type: 'call_function', account_id: contractId, method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  }, url);
  const text = Buffer.from(result.result).toString('utf8');
  return (text ? JSON.parse(text) : null) as T;
}

export type AccountView = { amount: string; code_hash: string; storage_usage: number };
export const viewAccount = (accountId: string, url = TESTNET_RPC) => query<AccountView>({ request_type: 'view_account', account_id: accountId }, url);

export async function accountExists(accountId: string, url = TESTNET_RPC): Promise<boolean> {
  try { await viewAccount(accountId, url); return true; }
  catch (e) { if (/UNKNOWN_ACCOUNT|does not exist/i.test(String(e))) return false; throw e; }
}

export type AccessKeyView = { nonce: number | string; permission: 'FullAccess' | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } } };
export const viewAccessKey = (accountId: string, publicKey: string, url = TESTNET_RPC) =>
  query<AccessKeyView & { block_height: number; block_hash: string }>({ request_type: 'view_access_key', account_id: accountId, public_key: publicKey }, url);
export const viewAccessKeys = (accountId: string, url = TESTNET_RPC) =>
  query<{ keys: { public_key: string; access_key: AccessKeyView }[] }>({ request_type: 'view_access_key_list', account_id: accountId }, url);

export async function latestBlock(url = TESTNET_RPC): Promise<{ height: number; hash: string; timestamp: string }> {
  const b = await rpc<{ header: { height: number; hash: string; timestamp_nanosec: string } }>('block', { finality: 'final' }, url);
  return { height: b.header.height, hash: b.header.hash, timestamp: b.header.timestamp_nanosec };
}

export type TxStatus = { status: { SuccessValue?: string; Failure?: unknown }; transaction: { hash: string; signer_id: string; receiver_id: string }; receipts_outcome: { outcome: { status: { SuccessValue?: string; Failure?: unknown }; logs: string[]; executor_id: string } }[] };

export async function txStatus(hash: string, sender: string, url = TESTNET_RPC): Promise<TxStatus> {
  return rpc<TxStatus>('EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: sender, wait_until: 'FINAL' }, url);
}

/** First receipt failure in a finished transaction, if any. */
export function txFailure(tx: TxStatus): string | null {
  if (tx.status.Failure) return JSON.stringify(tx.status.Failure).slice(0, 400);
  const failed = tx.receipts_outcome.find(r => r.outcome.status.Failure);
  return failed ? JSON.stringify(failed.outcome.status.Failure).slice(0, 400) : null;
}

/** Kumi NEP-297 events in a transaction's receipts. */
export function kumiEvents(tx: TxStatus): { event: string; data: Record<string, unknown> }[] {
  const out: { event: string; data: Record<string, unknown> }[] = [];
  for (const r of tx.receipts_outcome) for (const log of r.outcome.logs) {
    if (!log.startsWith('EVENT_JSON:')) continue;
    try {
      const e = JSON.parse(log.slice(11)) as { standard: string; event: string; data: Record<string, unknown>[] };
      if (e.standard === 'kumi') out.push({ event: e.event, data: e.data[0] ?? {} });
    } catch { /* foreign event */ }
  }
  return out;
}

export function formatNear(yocto: bigint | string, digits = 3): string {
  const n = BigInt(yocto);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / ONE_NEAR;
  const frac = (abs % ONE_NEAR).toString().padStart(24, '0').slice(0, digits);
  return `${neg ? '-' : ''}${whole.toLocaleString('en-US')}${digits ? '.' + frac : ''}`;
}

export function formatUnits(amount: bigint | string, decimals: number, digits = 4): string {
  const n = BigInt(amount);
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, '0').slice(0, digits);
  return `${whole.toLocaleString('en-US')}${digits ? '.' + frac : ''}`;
}

export function parseNear(text: string): bigint {
  const t = text.trim();
  if (!/^\d+(\.\d{0,24})?$/.test(t)) throw new Error('Enter an amount like 0.25');
  const [w, f = ''] = t.split('.');
  return BigInt(w) * ONE_NEAR + BigInt(f.padEnd(24, '0'));
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** JSON with sorted keys, so a quote hashes the same everywhere. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as object).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
