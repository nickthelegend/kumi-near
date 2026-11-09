// Calls to the Kumi server (sign-in, relayer, chat) and live chain reads through the SDK.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computePnl, getAssets, getCrew, getMarks, getPolicy, getProposals, getReceipts, getTrades, listCrews, rpcUrl,
  type Asset, type Crew, type DaoPolicy, type Mark, type Pnl, type Proposal, type Receipt, type Trade,
} from '@kumi/sdk';
import evidence from '../../../../deployments/testnet-2026-11-09.json';

export type Config = { hub: string; relayer: string; rpc: string; giftNear: number; setup: { email: string | null; liveSwaps: string | null; confidential: string | null } };
export type TxLink = { label: string; hash: string; account: string; at: number };
export type ChatMessage = {
  id: string; crewId: number; account: string; ts: number; text: string; kind: 'text' | 'trade' | 'system';
  sig?: string; publicKey?: string; txs: TxLink[];
  trade?: { side: 'buy' | 'sell'; asset: string; bps: number; lane: 'vote' | 'captain'; quote?: import('@kumi/sdk').TradeQuote; tradeId?: number; proposalId?: number; error?: string };
};
export type RelayResult = { hash: string; failure: string | null; events: { event: string; data: Record<string, unknown> }[]; value: string | null };

export const EVIDENCE = evidence as { accounts: Record<string, string>; transactions: { step: string; hash: string; explorer: string; note?: string; receiver: string }[]; config: Record<string, unknown> };
/** Hub to read when the server is not running: the recorded testnet deployment. */
export const HUB = (import.meta.env.VITE_KUMI_HUB as string | undefined) ?? EVIDENCE.accounts.hub;

export async function api<T>(path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('The Kumi server is not reachable. Start it with: pnpm server');
  }
  const text = await r.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* not json */ }
  if (!r.ok) throw new Error((parsed as { error?: string })?.error ?? (r.status === 502 || r.status === 504 ? 'The Kumi server is not running. Start it with: pnpm server' : `HTTP ${r.status}`));
  return parsed as T;
}

function friendly(e: unknown): string {
  const m = String(e instanceof Error ? e.message : e);
  return /429|rate-limit/i.test(m) ? 'NEAR testnet RPC is rate-limiting right now (HTTP 429). Retrying automatically…' : m;
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], refreshMs = 0) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick(t => t + 1), []);
  useEffect(() => {
    let live = true;
    setState(s => ({ ...s, loading: true }));
    fn().then(data => live && setState({ data, loading: false }), (e: unknown) => live && setState(s => ({ ...s, error: friendly(e), loading: false })));
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  useEffect(() => {
    if (!state.error || state.data) return;
    const t = setTimeout(reload, 8000);
    return () => clearTimeout(t);
  }, [state.error, state.data, reload]);
  useEffect(() => {
    if (!refreshMs) return;
    const t = setInterval(reload, refreshMs);
    return () => clearInterval(t);
  }, [refreshMs, reload]);
  return { ...state, reload };
}

export function useConfig() { return useAsync(() => api<Config>('/api/config'), []); }

export type HubState = { hub: string; assets: Asset[]; crews: Crew[]; marks: Mark[]; readAt: number };
export async function readHub(hub = HUB, rpc = rpcUrl()): Promise<HubState> {
  const [assets, crews] = await Promise.all([getAssets(hub, rpc), listCrews(hub, rpc)]);
  return { hub, assets, crews, marks: await getMarks(assets, rpc), readAt: Date.now() };
}

export type CrewState = { crew: Crew; trades: Trade[]; receipts: Receipt[]; pnl: Pnl; assets: Asset[]; marks: Mark[]; policy: DaoPolicy; readAt: number };
export async function readCrew(crewId: number, hub = HUB): Promise<CrewState> {
  const crew = await getCrew(hub, crewId);
  if (!crew) throw new Error(`Crew ${crewId} does not exist on ${hub}`);
  const [trades, receipts, assets, policy] = await Promise.all([getTrades(hub, crew), getReceipts(hub, crew), getAssets(hub), getPolicy(crew.dao)]);
  const marks = await getMarks(assets);
  return { crew, trades, receipts, pnl: computePnl(receipts, crew, marks), assets, marks, policy, readAt: Date.now() };
}

export async function readProposals(dao: string, ids: number[]): Promise<Record<number, Proposal>> {
  const out: Record<number, Proposal> = {};
  if (!ids.length) return out;
  const from = Math.min(...ids), to = Math.max(...ids);
  for (const p of await getProposals(dao, from, to - from + 1)) out[p.id] = p;
  return out;
}

/** Live crew chat over WebSocket. */
export function useChat(crewId: number | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const ws = useRef<WebSocket | null>(null);
  useEffect(() => {
    if (crewId === null) return;
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const open = () => {
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?crew=${crewId}`);
      ws.current = sock;
      setStatus('connecting');
      sock.onopen = () => setStatus('live');
      sock.onclose = () => { setStatus('offline'); if (!stop) retry = setTimeout(open, 3000); };
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
  }, [crewId]);
  const send = useCallback((payload: unknown) => {
    if (ws.current?.readyState !== WebSocket.OPEN) { setError('Chat is offline. Start the Kumi server with: pnpm server'); return false; }
    setError(null);
    ws.current.send(JSON.stringify(payload));
    return true;
  }, []);
  return { messages, status, error, setError, send };
}

export type World = { hub: HubState; crews: CrewState[]; readAt: number };
let worldCache: { at: number; data: World } | null = null;
/** The hub plus every crew's full state (trades, receipts, P&L), read live from NEAR testnet. */
export async function readWorld(): Promise<World> {
  if (worldCache && Date.now() - worldCache.at < 10_000) return worldCache.data;
  const hub = await readHub();
  const crews = await Promise.all(hub.crews.map(c => readCrew(c.id)));
  const data = { hub, crews, readAt: Date.now() };
  worldCache = { at: Date.now(), data };
  return data;
}
export function useWorld(refreshMs = 30_000) {
  const r = useAsync(() => readWorld(), [], refreshMs);
  return { ...r, reload: () => { worldCache = null; r.reload(); } };
}
