/**
 * The phone's NEAR layer. Reads go to NEAR testnet through the Kumi server's cached RPC proxy (straight to the public
 * RPC when the server is down, so the fund still shows). Everything the phone does on-chain is a NEP-366 delegate
 * signed here with the on-device key and relayed by the Kumi server, which pays the gas (same flow as the web app).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useIsFocused } from 'expo-router';
import {
  computePnl, getAssets, getCrew, getInvites, getMarks, getPolicy, getProposal, getReceipts, getTrades, listCrews, setDefaultRpc,
  signChat, signDelegate, storageBalance, txUrl, accountUrl, TESTNET_RPC, TGAS,
  type Asset, type CallSpec, type Crew, type DaoPolicy, type Invite, type Mark, type Pnl, type Proposal, type Receipt, type Trade, type TradeQuote,
} from '@kumi/sdk';
import { keyPair, type Account } from './wallet';

export const SERVER = (process.env.EXPO_PUBLIC_KUMI_SERVER ?? 'http://127.0.0.1:5411').replace(/\/$/, '');
/** The recorded testnet deployment (deployments/testnet-2026-11-09.json). The server's /api/config can override it. */
export let HUB = 'hub.kumi-77b50457fb.testnet';
export let RELAYER = 'kumi-77b50457fb.testnet';
export const CREW_ID = 0;
export { txUrl, accountUrl };

export type ServerConfig = { hub: string; relayer: string; rpc: string; giftNear: string; setup: { email: string | null; liveSwaps: string | null; confidential: string | null } };
let config: ServerConfig | null = null;
/** Pings the server once; reads then use its RPC proxy. Without it reads go to the public RPC and actions say why. */
export async function connect(): Promise<ServerConfig | null> {
  try {
    const r = await fetch(`${SERVER}/api/config`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw Error(String(r.status));
    config = await r.json() as ServerConfig;
    HUB = config.hub; RELAYER = config.relayer;
    setDefaultRpc(`${SERVER}/api/rpc`);
  } catch {
    config = null;
    setDefaultRpc(TESTNET_RPC);
  }
  return config;
}
export const serverConfig = () => config;

// ---------------------------------------------------------------- names
const SEEDED = new Set(['mika', 'bo', 'juno', 'rin', 'sora']);
export const handleOf = (a: string) => a.split('.')[0] ?? a;
/** Kumi's own QA accounts (relayer sub-accounts made by the testnet runs) get a small "test acct" tag in the chat. */
export const isTestAccount = (a?: string | null) => !!a && a.endsWith(`.${RELAYER}`) && (SEEDED.has(handleOf(a)) || /^qa[a-z0-9]+$/.test(handleOf(a)));
export function nameOf(a: string | undefined | null, me?: string | null): string {
  if (!a) return '';
  if (me && a === me) return 'You';
  if (a === HUB) return 'Kumi hub';
  return a.endsWith(`.${RELAYER}`) ? handleOf(a) : a.length > 22 ? `${a.slice(0, 10)}…${a.slice(-8)}` : a;
}

// ---------------------------------------------------------------- polling
/** Polls `fn` every `ms` while the app is in the foreground; keeps the last good value when a refresh fails. */
export function useLive<T>(fn: () => Promise<T>, deps: unknown[], ms = 5000, initial?: T) {
  const [state, set] = useState<{ data?: T; error?: string; at?: number }>(initial === undefined ? {} : { data: initial });
  const [tick, setTick] = useState(0);
  // Tabs stay mounted: a screen that is not in front polls six times slower (the public RPC rate-limits by IP).
  const focused = useIsFocused();
  const front = useRef(focused);
  front.current = focused;
  const key = JSON.stringify(deps);
  const lastKey = useRef(key);
  useEffect(() => {
    // Each effect run owns its own loop: a re-run (new inputs, reload) stops the previous loop for good.
    let active = true;
    if (lastKey.current !== key) { lastKey.current = key; set({}); }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const data = await fn();
        if (active) set({ data, at: Date.now() });
      } catch (e) {
        if (active) set(s => ({ ...s, error: readable(e) }));
      }
      if (active && ms > 0) timer = setTimeout(run, (AppState.currentState === 'active' || AppState.currentState == null) && front.current ? ms : ms * 6);
    };
    void run();
    return () => { active = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { ...state, reload };
}

/** One readable sentence for a NEAR, relayer or contract error (same wording as the web app). */
export function readable(e: unknown): string {
  const m = String((e as Error)?.message ?? e);
  if (/429|rate-limit/i.test(m)) return 'NEAR testnet RPC is rate-limiting right now. Retrying shortly.';
  if (/timeout on the free plan|timed? ?out/i.test(m)) return 'NEAR took too long to confirm. The transaction may still land: the fund refreshes on its own.';
  if (/Network request failed|unreachable|fetch|aborted/i.test(m)) return 'NEAR testnet did not answer. Check the connection; retrying shortly.';
  return m.replace(/^NEAR RPC:? ?/, '').split('\n')[0]!;
}

// ---------------------------------------------------------------- server
export class SetupError extends Error {}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${SERVER}${path}`, body === undefined ? { signal: AbortSignal.timeout(20000) } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  } catch {
    throw new SetupError(`The Kumi server is not reachable at ${SERVER}. Start it with: pnpm run server`);
  }
  const text = await r.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch { /* below */ }
  if (!r.ok || parsed === null) throw Error(readable(parsed?.error ?? `Kumi server HTTP ${r.status}`));
  return parsed as T;
}

export type TxLinkT = { label: string; hash: string; account: string; at: number };
export type ChatMessage = {
  id: string; crewId: number; account: string; ts: number; text: string; kind: 'text' | 'trade' | 'invite' | 'system';
  sig?: string; publicKey?: string; txs: TxLinkT[];
  invite?: { accountId: string; roleProposalId?: number; proposalId?: number; inviteId?: number };
  trade?: { side: 'buy' | 'sell'; asset: string; bps: number; lane: 'vote' | 'captain'; quote?: TradeQuote; tradeId?: number; proposalId?: number; error?: string };
};
export type RelayResult = { hash: string; failure: string | null; events: { event: string; data: Record<string, unknown> }[]; value: string | null; methods?: string[] };

// ---------------------------------------------------------------- signing
export type Sent = { hash: string; label: string };
const REASONS: [RegExp, string][] = [
  [/ERR_MIN_DEPOSIT/, 'The minimum deposit is 0.01 testnet NEAR.'],
  [/ERR_NOT_ALLOWED|ERR_NOT_INVITED/, 'This account is not invited to the crew yet. A shareholder majority has to vote you in first.'],
  [/ERR_NOT_REGISTERED/, 'A token payout needs storage registration on your account.'],
  [/ERR_TRADE_IN_FLIGHT|ERR_BUSY/, 'A trade is settling. Wait for its receipt, then try again.'],
  [/ERR_STALE_VOTES/, 'Membership changed after this trade was proposed. Pitch a new trade.'],
  [/ERR_PERMISSION_DENIED|ERR_DAO_ONLY/, 'Your account cannot approve this action.'],
  [/ERR_ALREADY_VOTED/, 'You already voted on this.'],
  [/NotEnoughBalance|lack_balance_for_state|insufficient/i, 'Your testnet account needs more NEAR for this action.'],
];

/** Signs one call on this phone as a NEP-366 delegate and has the Kumi relayer send it. Fails loudly on a refusal. */
export async function relay(me: Account, receiverId: string, methodName: string, args: Record<string, unknown>, deposit = 0n,
  link?: { crewId: number; messageId?: string; label?: string }): Promise<RelayResult> {
  const gas = (methodName === 'act_proposal' ? 190n : methodName === 'ragequit' || methodName === 'unfollow' ? 155n : 100n) * TGAS;
  const calls: CallSpec[] = [{ methodName, args, deposit, gas }];
  const delegate = await signDelegate({ senderId: me.accountId, keyPair: keyPair(), receiverId, calls });
  const r = await api<RelayResult>('/api/relay', { delegate, ...(link ?? {}) });
  // A pool refusing a fill (ERR_SLIPPAGE) is handled by the hub, which restores holdings: an outcome, not an error.
  const handled = r.events.some(e => e.event === 'trade_failed');
  if (r.failure && !handled) {
    const msg = REASONS.find(([p]) => p.test(r.failure!))?.[1] ?? 'The transaction did not complete. Check its receipt on NearBlocks.';
    throw Error(`${msg} (${r.hash.slice(0, 8)}…)`);
  }
  return r;
}

export async function signedChat(me: Account, crewId: number, text: string) {
  const ts = Date.now();
  const kp = keyPair();
  return { type: 'say', crewId, account: me.accountId, ts, text, sig: await signChat(kp, crewId, me.accountId, ts, text), publicKey: kp.getPublicKey().toString() };
}

// ---------------------------------------------------------------- actions
export const fileTrade = (me: Account, crewId: number, messageId: string, q: TradeQuote) =>
  relay(me, HUB, 'propose_trade', { crew_id: crewId, side: q.side, asset: q.asset, bps: q.bps, quote_in: q.amount_in, quote_out: q.pool.amount_out, quote_hash: q.hash },
    0n, { crewId, messageId, label: `proposed by ${handleOf(me.accountId)}` });

export const vote = (me: Account, dao: string, p: Proposal, approve: boolean, crewId: number, messageId?: string) =>
  relay(me, dao, 'act_proposal', { id: p.id, action: approve ? 'VoteApprove' : 'VoteReject', proposal: p.kind }, 0n,
    { crewId, messageId, label: `${approve ? 'yes' : 'no'} · ${handleOf(me.accountId)}` });

export const chipIn = (me: Account, crewId: number, yocto: bigint) => relay(me, HUB, 'join', { crew_id: crewId }, yocto, { crewId, label: 'chip in' });
export const follow = (me: Account, crewId: number, yocto: bigint) => relay(me, HUB, 'follow', { crew_id: crewId }, yocto, { crewId, label: 'follow' });

/** Token payouts need storage on each token first (paid from the player's own NEAR, 0.00125 each). */
async function registerPayout(me: Account, tokens: { token: string }[], step: (s: string) => void): Promise<Sent[]> {
  const out: Sent[] = [];
  for (const t of tokens) {
    if (await storageBalance(t.token, me.accountId)) continue;
    step(`Registering for ${t.token.split('.')[0]}`);
    const r = await relay(me, t.token, 'storage_deposit', {}, 1_250_000_000_000_000_000_000n);
    out.push({ hash: r.hash, label: `Register ${t.token.split('.')[0]}` });
  }
  return out;
}

export async function ragequit(me: Account, crew: Crew, shares: bigint, assets: Asset[], step: (s: string) => void = () => {}): Promise<Sent[]> {
  const out = await registerPayout(me, assets.filter(a => crew.tokens.some(([s, v]) => s === a.symbol && BigInt(v) > 0n)), step);
  step('Leaving with your share');
  const r = await relay(me, HUB, 'ragequit', { crew_id: crew.id, shares: shares.toString() }, 0n, { crewId: crew.id, label: 'ragequit' });
  return [...out, { hash: r.hash, label: 'Ragequit' }];
}

export async function unfollow(me: Account, crew: Crew, shares: bigint, assets: Asset[], step: (s: string) => void = () => {}): Promise<Sent[]> {
  const out = await registerPayout(me, assets.filter(a => crew.vault_tokens.some(([s, v]) => s === a.symbol && BigInt(v) > 0n)), step);
  step('Leaving the follower vault');
  const r = await relay(me, HUB, 'unfollow', { crew_id: crew.id, shares: shares.toString() }, 0n, { crewId: crew.id, label: 'unfollow' });
  return [...out, { hash: r.hash, label: 'Unfollow' }];
}

/** An invite is two proposals: the native Sputnik crew role, then the hub's admission gate bound to it. */
export async function fileInvite(me: Account, crew: Crew, messageId: string, accountId: string, roleId?: number) {
  if (roleId === undefined) {
    const r = await relay(me, crew.dao, 'add_proposal', { proposal: { description: `Kumi invite role: ${accountId}`, kind: { AddMemberToRole: { member_id: accountId, role: 'crew' } } } }, 0n, { crewId: crew.id, messageId, label: 'invitation role filed' });
    if (r.value === null || !Number.isSafeInteger(Number(r.value))) throw Error('Missing DAO role proposal receipt');
    roleId = Number(r.value);
  }
  return relay(me, HUB, 'propose_invite', { crew_id: crew.id, account_id: accountId, role_proposal_id: roleId }, 0n, { crewId: crew.id, messageId, label: 'invitation gate filed' });
}

// ---------------------------------------------------------------- reads
export type CrewState = { crew: Crew; invites: Invite[]; trades: Trade[]; receipts: Receipt[]; pnl: Pnl; assets: Asset[]; marks: Mark[]; policy: DaoPolicy; readAt: number };
const crewCache = new Map<number, CrewState>();
/** The last crew read on this phone, so a screen opened from another paints at once and then refreshes. */
export const cachedCrew = (crewId = CREW_ID) => crewCache.get(crewId);
export async function readCrew(crewId = CREW_ID): Promise<CrewState> {
  const crew = await getCrew(HUB, crewId);
  if (!crew) throw Error(`Crew ${crewId} does not exist on ${HUB}`);
  const [trades, receipts, assets, policy, invites] = await Promise.all([getTrades(HUB, crew), getReceipts(HUB, crew), getAssets(HUB), getPolicy(crew.dao), getInvites(HUB, crewId)]);
  const marks = await getMarks(assets);
  const out = { crew, invites, trades, receipts, pnl: computePnl(receipts, crew, marks), assets, marks, policy, readAt: Date.now() };
  crewCache.set(crewId, out);
  return out;
}
export async function readHub() {
  const [assets, crews] = await Promise.all([getAssets(HUB), listCrews(HUB)]);
  return { assets, crews, marks: await getMarks(assets) };
}
export async function readProposals(dao: string, ids: number[]): Promise<Record<number, Proposal>> {
  // Only the newest cards' proposals, each read on its own (a wide get_proposals range is slow and can time out).
  const want = [...new Set(ids.filter(i => Number.isSafeInteger(i) && i >= 0))].sort((a, b) => a - b).slice(-8);
  const got = await Promise.all(want.map(id => getProposal(dao, id).catch(() => null)));
  const out: Record<number, Proposal> = {};
  got.forEach(p => { if (p) out[p.id] = p; });
  return out;
}
export const isHolder = (crew: Crew | undefined, a?: string | null) => !!crew && !!a && crew.members.some(([m, n]) => m === a && BigInt(n) > 0n);

// ---------------------------------------------------------------- chat
/** The crew chat over the server's WebSocket: history, then live messages and card updates. */
export function useChat(crewId: number, enabled = true) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (!enabled) { setStatus('offline'); return; }
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      const sock = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/ws?crew=${crewId}`);
      ws.current = sock;
      setStatus('connecting');
      sock.onopen = () => setStatus('live');
      sock.onclose = () => { setStatus('offline'); if (!stop) retry = setTimeout(open, 3000); };
      sock.onerror = () => {};
      sock.onmessage = ev => {
        const m = JSON.parse(String(ev.data));
        if (m.type === 'history') setMessages(m.messages);
        if (m.type === 'message') setMessages(list => [...list.filter(x => x.id !== m.message.id), m.message]);
        if (m.type === 'update') setMessages(list => list.map(x => x.id === m.message.id ? m.message : x));
        if (m.type === 'error') setError(m.error);
      };
    };
    open();
    return () => { stop = true; clearTimeout(retry); ws.current?.close(); };
  }, [crewId, enabled]);
  const send = useCallback((payload: unknown) => {
    if (ws.current?.readyState !== WebSocket.OPEN) { setError('Chat is offline: the Kumi server is not reachable.'); return false; }
    setError(null);
    ws.current.send(JSON.stringify(payload));
    return true;
  }, []);
  return { messages, status, error, setError, send };
}

// ---------------------------------------------------------------- formatting
export const near = (yocto: bigint | string, dp = 3) => {
  const n = Number(BigInt(yocto) / 10n ** 18n) / 1e6;
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
export const units = (v: bigint | string, decimals: number, dp = 4) => {
  const n = Number(BigInt(v)) / 10 ** decimals;
  return n.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: Math.min(dp, 2) });
};
/** NEAR per one whole token from a constant-product pool's reserves. */
export const priceOf = (m: Mark | undefined, decimals: number) => (m ? (Number(BigInt(m.near_reserve)) / 1e24) / (Number(BigInt(m.token_reserve)) / 10 ** decimals) : 0);
