// NEAR RPC reads for the Kumi hub, its pools and the crew DAOs. Works in Node 22 and browsers.
import { Buffer } from 'buffer';

export const TESTNET_RPC = 'https://test.rpc.fastnear.com';
let defaultRpc = 'https://test.rpc.fastnear.com';
/** Browsers point reads at a same-origin proxy (the Kumi server) to avoid public-RPC CORS and rate limits. */
export function setDefaultRpc(url: string) { defaultRpc = url; }
export const rpcUrl = () => defaultRpc;
export const SPUTNIK_TESTNET_FACTORY = 'sputnikv2.testnet';
export const EXPLORER = 'https://testnet.nearblocks.io';
export const ONE_NEAR = 10n ** 24n;

export const txUrl = (hash: string) => `${EXPLORER}/txns/${hash}`;
export const accountUrl = (id: string) => `${EXPLORER}/address/${id}`;

export class ChainError extends Error {}

/** Tried in order when the primary public RPC rate-limits (HTTP 429) or errors. */
export const TESTNET_RPC_FALLBACKS = ['https://near-testnet.drpc.org', 'https://rpc.testnet.near.org'];

/** Providers that answered 429 recently are skipped for 30 s, so a burst spreads across the public RPCs. */
const cooling = new Map<string, number>();
export async function rpc<T>(method: string, params: unknown, url = rpcUrl()): Promise<T> {
  // A same-origin proxy (the Kumi server) falls back to the public RPCs if it is down.
  const all = url === TESTNET_RPC || TESTNET_RPC_FALLBACKS.includes(url) ? [url, ...[TESTNET_RPC, ...TESTNET_RPC_FALLBACKS].filter(u => u !== url)]
    : url.includes('/api/rpc') ? [url, TESTNET_RPC, ...TESTNET_RPC_FALLBACKS] : [url];
  const fresh = all.filter(u => (cooling.get(u) ?? 0) < Date.now());
  const urls = fresh.length ? fresh : all;
  let response: Response | undefined;
  let used = url;
  // A rate-limited provider is skipped at once (and cooled); other errors back off, then fall back, then fail loudly.
  outer: for (const u of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      used = u;
      try {
        response = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'kumi', method, params }), signal: AbortSignal.timeout(12000) });
      } catch { response = undefined; }
      if (response && response.status === 429) { cooling.set(u, Date.now() + 30_000); continue outer; }
      if (response && response.ok && urls.length > 1) {
        // Some providers report rate limits inside a 200/400 body; treat those like a 429.
        const text = await response.clone().text();
        if (/rate limit|Rate limits exceeded|-429|free plan/i.test(text) && !/"result"/.test(text.slice(0, 60))) { cooling.set(u, Date.now() + 30_000); response = undefined; continue outer; }
      }
      if (response && response.status === 400 && urls.length > 1) {
        const text = await response.clone().text();
        if (/rate limit|free plan|not available/i.test(text)) { cooling.set(u, Date.now() + 30_000); response = undefined; continue outer; }
      }
      if (response && response.status !== 408 && response.status < 500 && response.status !== 404) break outer;
      if (response && (response.status === 502 || response.status === 404) && u.includes('/api/rpc')) break;
      await new Promise(r => setTimeout(r, 600 * 2 ** attempt));
    }
  }
  if (!response) throw new ChainError(`NEAR RPC unreachable: ${urls.join(', ')}`);
  if (!response.ok) throw new ChainError(`NEAR RPC HTTP ${response.status} from ${used}`);
  const body = await response.json() as { result?: T & { error?: string }; error?: { cause?: { name?: string }; data?: unknown; message?: string } };
  if (body.error) throw new ChainError(`NEAR RPC: ${[body.error.cause?.name, body.error.message, body.error.data ? JSON.stringify(body.error.data).slice(0, 200) : ''].filter(x => x && x !== 'ERROR').join(' ') || 'error'}`);
  if (body.result && typeof body.result === 'object' && 'error' in body.result && body.result.error) throw new ChainError(`NEAR RPC: ${body.result.error}`);
  if (body.result === undefined) throw new ChainError('NEAR RPC returned no result');
  return body.result;
}

export async function query<T>(params: Record<string, unknown>, url = rpcUrl()): Promise<T> {
  return rpc<T>('query', { finality: 'final', ...params }, url);
}

export async function view<T>(contractId: string, methodName: string, args: Record<string, unknown> = {}, url = rpcUrl()): Promise<T> {
  const result = await query<{ result: number[] }>({
    request_type: 'call_function', account_id: contractId, method_name: methodName,
    args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
  }, url);
  const text = Buffer.from(result.result).toString('utf8');
  return (text ? JSON.parse(text) : null) as T;
}

export type AccountView = { amount: string; code_hash: string; storage_usage: number };
export const viewAccount = (accountId: string, url = rpcUrl()) => query<AccountView>({ request_type: 'view_account', account_id: accountId }, url);

export async function accountExists(accountId: string, url = rpcUrl()): Promise<boolean> {
  try { await viewAccount(accountId, url); return true; }
  catch (e) { if (/UNKNOWN_ACCOUNT|does not exist/i.test(String(e))) return false; throw e; }
}

export type AccessKeyView = { nonce: number | string; permission: 'FullAccess' | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } } };
export const viewAccessKey = (accountId: string, publicKey: string, url = rpcUrl()) =>
  query<AccessKeyView & { block_height: number; block_hash: string }>({ request_type: 'view_access_key', account_id: accountId, public_key: publicKey }, url);
export const viewAccessKeys = (accountId: string, url = rpcUrl()) =>
  query<{ keys: { public_key: string; access_key: AccessKeyView }[] }>({ request_type: 'view_access_key_list', account_id: accountId }, url);

export async function latestBlock(url = rpcUrl()): Promise<{ height: number; hash: string; timestamp: string }> {
  const b = await rpc<{ header: { height: number; hash: string; timestamp_nanosec: string } }>('block', { finality: 'final' }, url);
  return { height: b.header.height, hash: b.header.hash, timestamp: b.header.timestamp_nanosec };
}

export type TxStatus = { status: { SuccessValue?: string; Failure?: unknown }; transaction: { hash: string; signer_id: string; receiver_id: string }; receipts_outcome: { outcome: { status: { SuccessValue?: string; Failure?: unknown }; logs: string[]; executor_id: string } }[] };

export async function txStatus(hash: string, sender: string, url = rpcUrl()): Promise<TxStatus> {
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
