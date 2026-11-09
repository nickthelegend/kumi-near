// Kumi crew server: email sign-in that creates a NEAR account, a NEP-366 relayer, and the crew
// chat over WebSocket. Chat messages are signed by the player's NEAR key and checked on-chain.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  getAssets, getCrew, parseTradeCommand, rpc as rpcCall, quoteTrade, txStatus, txFailure, kumiEvents, verifyChat, viewAccessKey, formatNear, LIVE_SWAP_SETUP, TESTNET_RPC,
} from '@kumi/sdk';
import { Relayer, RelayRefused, ONE_NEAR } from './relayer.js';
import { Store, type ChatMessage } from './store.js';

export type AppConfig = {
  hub: string; relayer: Relayer; store: Store; rpc?: string; giftYocto: bigint;
  resendKey?: string; emailFrom?: string; mainnetAccount?: string; oneclickJwt?: string;
};

type Pending = { codeHash: string; expires: number; tries: number };

export function createApp(cfg: AppConfig) {
  const rpc = cfg.rpc ?? TESTNET_RPC;
  const pending = new Map<string, Pending>();
  const sockets = new Map<number, Set<WebSocket>>();
  const keyCache = new Map<string, number>();
  const hashEmail = (email: string) => createHash('sha256').update(`kumi:${email.trim().toLowerCase()}`).digest('hex');

  const broadcast = (crewId: number, payload: unknown) => {
    const text = JSON.stringify(payload);
    for (const ws of sockets.get(crewId) ?? []) if (ws.readyState === ws.OPEN) ws.send(text);
  };
  const upsert = (crewId: number, msg: ChatMessage, isNew: boolean) => {
    const list = cfg.store.messages(crewId);
    const i = list.findIndex(m => m.id === msg.id);
    if (i >= 0) list[i] = msg; else list.push(msg);
    cfg.store.saveMessages(crewId, list);
    broadcast(crewId, { type: isNew ? 'message' : 'update', message: msg });
  };
  const system = (crewId: number, account: string, text: string, txs: ChatMessage['txs'] = []) =>
    upsert(crewId, { id: randomBytes(8).toString('hex'), crewId, account, ts: Date.now(), text, kind: 'system', txs }, true);

  /** The key must be a live access key on the account (checked on-chain, cached 5 min). */
  async function keyIsLive(accountId: string, publicKey: string): Promise<boolean> {
    const k = `${accountId}|${publicKey}`;
    if ((keyCache.get(k) ?? 0) > Date.now()) return true;
    try { await viewAccessKey(accountId, publicKey, rpc); keyCache.set(k, Date.now() + 300_000); return true; } catch { return false; }
  }

  async function sendEmail(to: string, code: string): Promise<void> {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.emailFrom ?? 'Kumi <onboarding@resend.dev>', to, subject: `Your Kumi code: ${code}`,
        text: `Your Kumi sign-in code is ${code}. It expires in 10 minutes.` }),
    });
    if (!r.ok) throw new Error(`Email provider HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }

  async function handleSay(raw: Record<string, unknown>): Promise<ChatMessage> {
    const crewId = Number(raw.crewId), account = String(raw.account ?? ''), ts = Number(raw.ts), text = String(raw.text ?? '').slice(0, 500);
    const sig = String(raw.sig ?? ''), publicKey = String(raw.publicKey ?? '');
    if (!text.trim()) throw new Error('Empty message');
    if (Math.abs(Date.now() - ts) > 120_000) throw new Error('Message timestamp is stale; check your clock');
    if (!await verifyChat(publicKey, crewId, account, ts, text, sig)) throw new Error('Bad signature');
    if (!await keyIsLive(account, publicKey)) throw new Error('That key is not an access key on your account');
    const crew = await getCrew(cfg.hub, crewId, rpc);
    if (!crew) throw new Error(`No crew ${crewId}`);
    if (!crew.allowed.includes(account)) throw new Error('Only crew members can post here');
    const msg: ChatMessage = { id: randomBytes(8).toString('hex'), crewId, account, ts, text, sig, publicKey, kind: 'text', txs: [] };
    upsert(crewId, msg, true);
    const captainLane = /^\/captain\s+/i.test(text);
    const cmd = parseTradeCommand(captainLane ? text.replace(/^\/captain\s+/i, '/') : text);
    if (cmd) {
      const card: ChatMessage = { id: randomBytes(8).toString('hex'), crewId, account, ts: Date.now(), text, kind: 'trade', txs: [],
        trade: { ...cmd, lane: captainLane ? 'captain' : 'vote', quote: undefined as never } };
      try {
        if (captainLane && crew.captain?.account_id !== account) throw new Error('Only the crew captain can use /captain');
        const assets = await getAssets(cfg.hub, rpc);
        card.trade!.quote = await quoteTrade(cfg.hub, crew, assets, cmd.side, cmd.asset, cmd.bps, { rpc, mainnetAccount: cfg.mainnetAccount, jwt: cfg.oneclickJwt });
      } catch (e) {
        card.trade!.error = String(e instanceof Error ? e.message : e);
      }
      upsert(crewId, card, true);
    }
    return msg;
  }

  async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) { size += (c as Buffer).length; if (size > 64_000) throw new Error('Body too large'); chunks.push(c as Buffer); }
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  }
  const send = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type' });
    res.end(JSON.stringify(value));
  };

  // Read-only JSON-RPC proxy for the browser: one origin, short cache, so a page load does not
  // burst the public RPC (which rate-limits and then omits CORS headers).
  const rpcCache = new Map<string, { at: number; value: unknown }>();
  const RPC_METHODS = new Set(['query', 'block', 'EXPERIMENTAL_tx_status', 'tx', 'status', 'send_tx', 'broadcast_tx_commit']);
  async function proxyRpc(b: Record<string, unknown>) {
    const method = String(b.method ?? '');
    if (!RPC_METHODS.has(method)) throw new HttpError(403, `RPC method ${method} is not proxied`);
    // Never cache access keys: a stale nonce would make the next signed delegate invalid.
    const rt = (b.params as { request_type?: string } | undefined)?.request_type ?? '';
    const cacheable = (method === 'query' && !rt.startsWith('view_access_key')) || method === 'block';
    const key = JSON.stringify([method, b.params]);
    const hit = rpcCache.get(key);
    if (cacheable && hit && Date.now() - hit.at < 4000) return { jsonrpc: '2.0', id: b.id, result: hit.value };
    try {
      const result = await rpcCall(method, b.params, rpc);
      if (cacheable) { rpcCache.set(key, { at: Date.now(), value: result }); if (rpcCache.size > 2000) rpcCache.clear(); }
      return { jsonrpc: '2.0', id: b.id, result };
    } catch (e) {
      return { jsonrpc: '2.0', id: b.id, error: { message: String(e instanceof Error ? e.message : e).replace(/^NEAR RPC: /, ''), cause: { name: String(e).match(/NEAR RPC: (\w+)/)?.[1] ?? 'ERROR' } } };
    }
  }

  const routes: Record<string, (b: Record<string, unknown>, url: URL) => Promise<unknown>> = {
    'POST /api/rpc': async (b) => proxyRpc(b),
    'GET /api/config': async () => ({
      hub: cfg.hub, relayer: cfg.relayer.accountId, rpc, network: 'testnet', giftNear: formatNear(cfg.giftYocto, 3),
      setup: {
        email: cfg.resendKey ? null : 'Setup required: RESEND_API_KEY',
        liveSwaps: cfg.mainnetAccount ? null : LIVE_SWAP_SETUP,
        confidential: cfg.oneclickJwt ? null : 'Setup required: ONECLICK_JWT',
      },
    }),
    'GET /api/messages': async (_b, url) => cfg.store.messages(Number(url.searchParams.get('crew') ?? 0)),
    'GET /api/player': async (_b, url) => {
      const p = cfg.store.playerByAccount(String(url.searchParams.get('account')));
      return p ? { accountId: p.accountId, handle: p.handle } : null;
    },
    'POST /api/auth/start': async (b) => {
      const email = String(b.email ?? '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const h = hashEmail(email);
      pending.set(h, { codeHash: createHash('sha256').update(code).digest('hex'), expires: Date.now() + 600_000, tries: 0 });
      const existing = cfg.store.players()[h];
      if (cfg.resendKey) { await sendEmail(email, code); return { delivery: 'email', existing: Boolean(existing) }; }
      // No email provider configured: say so, and show the code in this testnet preview.
      return { delivery: 'setup-required', setup: 'Setup required: RESEND_API_KEY', previewCode: code, existing: Boolean(existing) };
    },
    'POST /api/auth/verify': async (b) => {
      const email = String(b.email ?? '').trim().toLowerCase();
      const h = hashEmail(email);
      const p = pending.get(h);
      if (!p || p.expires < Date.now()) throw new HttpError(400, 'Code expired; request a new one');
      if (++p.tries > 5) { pending.delete(h); throw new HttpError(429, 'Too many tries; request a new code'); }
      if (createHash('sha256').update(String(b.code ?? '')).digest('hex') !== p.codeHash) throw new HttpError(400, 'Wrong code');
      const publicKey = String(b.publicKey ?? '');
      if (!/^ed25519:[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(publicKey)) throw new HttpError(400, 'Bad public key');
      const existing = cfg.store.players()[h];
      if (existing) {
        pending.delete(h);
        if (existing.publicKey === publicKey) return { accountId: existing.accountId, handle: existing.handle, created: false };
        throw new HttpError(409, `This email already owns ${existing.accountId}, whose key lives in another browser. Linking a second device is not built yet.`);
      }
      const accountId = cfg.relayer.playerAccountId(String(b.handle ?? ''));
      const createdTx = await cfg.relayer.createPlayer(accountId, publicKey, cfg.giftYocto);
      pending.delete(h);
      cfg.store.savePlayer({ accountId, handle: String(b.handle), publicKey, emailHash: h, createdTx, createdAt: Date.now() });
      return { accountId, handle: b.handle, created: true, createdTx };
    },
    'POST /api/quote': async (b) => {
      const crew = await getCrew(cfg.hub, Number(b.crewId ?? 0), rpc);
      if (!crew) throw new HttpError(404, 'No such crew');
      const cmd = parseTradeCommand(String(b.command ?? ''));
      if (!cmd) throw new HttpError(400, 'Use /buy SOL 20% or /sell SOL 50%');
      return quoteTrade(cfg.hub, crew, await getAssets(cfg.hub, rpc), cmd.side, cmd.asset, cmd.bps, { rpc, mainnetAccount: cfg.mainnetAccount, jwt: cfg.oneclickJwt });
    },
    /** Relays a signed delegate and links the transaction to a chat card. */
    'POST /api/relay': async (b) => {
      const result = await cfg.relayer.relay(String(b.delegate ?? '')).catch(e => {
        if (e instanceof RelayRefused) throw new HttpError(403, e.message);
        throw e;
      });
      const crewId = b.crewId === undefined ? null : Number(b.crewId);
      if (crewId !== null && Number.isInteger(crewId)) linkResult(crewId, String(b.messageId ?? ''), String(b.label ?? result.methods.join('+')), result);
      return result;
    },
    /** Records a captain trade the captain's browser sent with its function-call key. */
    'POST /api/record': async (b) => {
      const crewId = Number(b.crewId), hash = String(b.hash ?? '');
      const tx = await txStatus(hash, cfg.hub, rpc);
      if (tx.transaction.signer_id !== cfg.hub || tx.transaction.receiver_id !== cfg.hub) throw new HttpError(400, 'Not a captain-key transaction on the hub');
      const failure = txFailure(tx);
      const result = { hash, sender: cfg.hub, receiver: cfg.hub, methods: ['captain_trade'], failure, events: kumiEvents(tx), value: null };
      linkResult(crewId, String(b.messageId ?? ''), 'captain trade', result);
      return result;
    },
  };

  function linkResult(crewId: number, messageId: string, label: string, r: Awaited<ReturnType<Relayer['relay']>>) {
    const list = cfg.store.messages(crewId);
    const card = list.find(m => m.id === messageId);
    const who = r.sender;
    const proposed = r.events.find(e => e.event === 'trade_proposed');
    const executed = r.events.find(e => e.event === 'trade_executed' || e.event === 'trade_failed');
    if (card) {
      card.txs.push({ label: r.failure ? `${label} (failed)` : label, hash: r.hash, account: who, at: Date.now() });
      if (proposed) { card.trade!.tradeId = Number(proposed.data.trade_id); card.trade!.proposalId = Number(proposed.data.dao_proposal_id); }
      if (executed && card.trade) {
        card.trade.tradeId ??= Number(executed.data.trade_id);
        card.txs.push({ label: executed.event === 'trade_executed' ? 'executed' : 'execution failed', hash: r.hash, account: who, at: Date.now() });
      }
      upsert(crewId, card, false);
    }
    for (const e of r.events) {
      if (e.event === 'join') system(crewId, who, `joined the crew`, [{ label: 'join', hash: r.hash, account: who, at: Date.now() }]);
      if (e.event === 'ragequit') system(crewId, who, `ragequit with their exact share`, [{ label: 'ragequit', hash: r.hash, account: who, at: Date.now() }]);
      if (e.event === 'follow') system(crewId, who, `started following the crew`, [{ label: 'follow', hash: r.hash, account: who, at: Date.now() }]);
      if (e.event === 'captain_set') system(crewId, who, `captain key installed for ${String(e.data.captain)}`, [{ label: 'captain vote', hash: r.hash, account: who, at: Date.now() }]);
    }
  }

  const server = createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, null);
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return send(res, 404, { error: 'Not found' });
    try { send(res, 200, await route(req.method === 'POST' ? await body(req) : {}, url)); }
    catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      send(res, status, { error: String(e instanceof Error ? e.message : e) });
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    const crewId = Number(new URL(req.url ?? '/', 'http://localhost').searchParams.get('crew') ?? 0);
    if (!sockets.has(crewId)) sockets.set(crewId, new Set());
    sockets.get(crewId)!.add(ws);
    ws.send(JSON.stringify({ type: 'history', messages: cfg.store.messages(crewId) }));
    ws.on('message', async data => {
      let raw: Record<string, unknown>;
      try { raw = JSON.parse(String(data)); } catch { return; }
      if (raw.type !== 'say') return;
      try { await handleSay({ ...raw, crewId }); }
      catch (e) { ws.send(JSON.stringify({ type: 'error', error: String(e instanceof Error ? e.message : e), nonce: raw.nonce })); }
    });
    ws.on('close', () => sockets.get(crewId)?.delete(ws));
  });

  return { server, routes, handleSay, system };
}

export class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
export { ONE_NEAR };
