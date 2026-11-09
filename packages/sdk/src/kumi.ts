// Typed reads of the Kumi hub contract, its test pools and the crews' Sputnik DAOs.
import { canonical, rpcUrl, sha256Hex, view } from './chain.js';
import { dryQuote, intentsAssetFor, type DryQuote } from './oneclick.js';

export type U128 = string;
export type Pair = [string, U128];

export type Asset = { symbol: string; token: string; decimals: number; intents_asset: string };
export type Captain = { account_id: string; public_key: string; max_bps: number; max_daily: number; assets: string[] };
export type Crew = {
  id: number; name: string; dao: string; creator: string; created_at: string; allowed: string[];
  members: Pair[]; supply: U128; near: U128; tokens: Pair[]; deposited: U128; slippage_bps: number;
  captain: Captain | null; captain_trades_today: number;
  vault_supply: U128; vault_near: U128; vault_tokens: Pair[]; vault_fee_bps: number; vault_hwm: U128; vault_fees_paid: U128;
  followers: Pair[]; busy: boolean; trade_count: number; receipt_count: number;
};
export type Side = 'buy' | 'sell';
export type TradeStatus = 'filing' | 'voting' | 'executing' | 'executed' | 'failed';
export type Trade = {
  id: number; kind: 'vote' | 'captain'; proposer: string; side: Side; asset: string; bps: number;
  quote_in: U128; quote_out: U128; quote_hash: string; dao_proposal_id: number | null; status: TradeStatus;
  created_at: string; executed_at: string | null; crew_in: U128; crew_out: U128; vault_in: U128; vault_out: U128;
};
export type Mark = { symbol: string; near_reserve: U128; token_reserve: U128 };
export type Receipt = {
  seq: number; kind: 'join' | 'ragequit' | 'trade' | 'captain_trade' | 'follow' | 'unfollow' | 'fee'; account_id: string;
  at: string; block: string; trade_id: number | null; near_in: U128; near_out: U128; asset: string | null;
  token_in: U128; token_out: U128; shares: U128; marks: Mark[];
  crew_near: U128; crew_tokens: Pair[]; crew_supply: U128; vault_near: U128; vault_tokens: Pair[]; vault_supply: U128;
};
export type Reserves = { near: U128; token: U128; fee_bps: number };
export type Proposal = {
  id: number; proposer: string; description: string; status: string; kind: unknown;
  vote_counts: Record<string, [string, string, string]>; votes: Record<string, 'Approve' | 'Reject' | 'Remove'>; submission_time: string;
};
export type DaoPolicy = { roles: { name: string; kind: { Group?: string[] } | string; permissions: string[] }[]; proposal_period: string; default_vote_policy: { threshold: [number, number] | string } };

export const hubConfig = (hub: string, rpc = rpcUrl()) => view<{ owner: string; factory: string; dao_deposit: U128; crew_count: number }>(hub, 'get_config', {}, rpc);
export const getAssets = (hub: string, rpc = rpcUrl()) => view<Asset[]>(hub, 'get_assets', {}, rpc);
export const getCrew = (hub: string, crewId: number, rpc = rpcUrl()) => view<Crew | null>(hub, 'get_crew', { crew_id: crewId }, rpc);
export const listCrews = (hub: string, rpc = rpcUrl()) => view<Crew[]>(hub, 'list_crews', { from: 0, limit: 50 }, rpc);
export const getTrade = (hub: string, crewId: number, tradeId: number, rpc = rpcUrl()) => view<Trade | null>(hub, 'get_trade', { crew_id: crewId, trade_id: tradeId }, rpc);
export const getReserves = (token: string, rpc = rpcUrl()) => view<Reserves>(token, 'get_reserves', {}, rpc);
export const getProposal = (dao: string, id: number, rpc = rpcUrl()) => view<Proposal>(dao, 'get_proposal', { id }, rpc);
export const getPolicy = (dao: string, rpc = rpcUrl()) => view<DaoPolicy>(dao, 'get_policy', {}, rpc);
export const ftBalance = (token: string, accountId: string, rpc = rpcUrl()) => view<U128>(token, 'ft_balance_of', { account_id: accountId }, rpc);
export const storageBalance = (token: string, accountId: string, rpc = rpcUrl()) => view<{ total: U128 } | null>(token, 'storage_balance_of', { account_id: accountId }, rpc);

async function paged<T>(hub: string, method: string, crewId: number, count: number, rpc: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < count; from += 100) out.push(...await view<T[]>(hub, method, { crew_id: crewId, from, limit: 100 }, rpc));
  return out;
}
export async function getTrades(hub: string, crew: Crew, rpc = rpcUrl()) { return paged<Trade>(hub, 'get_trades', crew.id, crew.trade_count, rpc); }
export async function getReceipts(hub: string, crew: Crew, rpc = rpcUrl()) { return paged<Receipt>(hub, 'get_receipts', crew.id, crew.receipt_count, rpc); }

export const held = (pairs: Pair[], symbol: string): bigint => BigInt(pairs.find(p => p[0] === symbol)?.[1] ?? '0');

/** Live pool marks for every listed asset, read on-chain. */
export async function getMarks(assets: Asset[], rpc = rpcUrl()): Promise<Mark[]> {
  return Promise.all(assets.map(async a => {
    const r = await getReserves(a.token, rpc);
    return { symbol: a.symbol, near_reserve: r.near, token_reserve: r.token };
  }));
}

export function valueIn(pairs: Pair[], marks: Mark[]): bigint {
  let total = 0n;
  for (const [symbol, amount] of pairs) {
    const m = marks.find(x => x.symbol === symbol);
    if (!m || BigInt(amount) === 0n) continue;
    total += BigInt(amount) * BigInt(m.near_reserve) / BigInt(m.token_reserve);
  }
  return total;
}
export const crewNav = (c: Crew, marks: Mark[]) => BigInt(c.near) + valueIn(c.tokens, marks);
export const vaultNav = (c: Crew, marks: Mark[]) => BigInt(c.vault_near) + valueIn(c.vault_tokens, marks);

/** Same constant-product formula as the test pool contract (0.30% fee on input). */
export function amountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = 30n): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const inAfterFee = amountIn * (10_000n - feeBps);
  return inAfterFee * reserveOut / (reserveIn * 10_000n + inAfterFee);
}

export type TradeQuote = {
  side: Side; asset: string; bps: number;
  /** What the trade would move now: crew plus follower vault, the same combined swap the hub sends. */
  amount_in: U128; crew_in: U128; vault_in: U128;
  /** Testnet: the pool's own on-chain quote for that amount. */
  pool: { token: string; amount_out: U128; reserves: Reserves; read_at: string };
  /** Mainnet: a 1Click dry quote for the real asset (no funds move). */
  intents: DryQuote | { error: string };
  slippage_bps: number; min_out: U128;
  hash: string;
};

/** Builds the quote a `/buy` or `/sell` attaches: pool quote on-chain plus a mainnet 1Click dry quote. */
export async function quoteTrade(hub: string, crew: Crew, assets: Asset[], side: Side, asset: string, bps: number,
  opts: { rpc?: string; mainnetAccount?: string; jwt?: string; confidential?: boolean } = {}): Promise<TradeQuote> {
  const rpc = opts.rpc ?? rpcUrl();
  const a = assets.find(x => x.symbol === asset);
  if (!a) throw new Error(`Unknown asset ${asset}. Listed: ${assets.map(x => x.symbol).join(', ')}`);
  if (!Number.isInteger(bps) || bps < 1 || bps > 10_000) throw new Error('Size must be between 0.01% and 100%');
  const crewIn = (side === 'buy' ? BigInt(crew.near) : held(crew.tokens, asset)) * BigInt(bps) / 10_000n;
  const vaultIn = (side === 'buy' ? BigInt(crew.vault_near) : held(crew.vault_tokens, asset)) * BigInt(bps) / 10_000n;
  const amountIn = crewIn + vaultIn;
  if (amountIn === 0n) throw new Error(side === 'buy' ? 'The crew has no NEAR to spend yet' : `The crew holds no ${asset}`);
  const reserves = await getReserves(a.token, rpc);
  const poolOut = await view<U128>(a.token, side === 'buy' ? 'quote_buy' : 'quote_sell', side === 'buy' ? { near_in: amountIn.toString() } : { token_in: amountIn.toString() }, rpc);
  const intentsAsset = a.intents_asset || await intentsAssetFor(asset);
  const intents = await dryQuote({
    originAsset: side === 'buy' ? 'nep141:wrap.near' : intentsAsset,
    destinationAsset: side === 'buy' ? intentsAsset : 'nep141:wrap.near',
    amount: (side === 'buy' ? amountIn : scaleTestAmount(amountIn)).toString(),
    recipient: opts.mainnetAccount, confidentiality: opts.confidential ? 'basic' : 'public',
  }, opts.jwt).catch((e: unknown) => ({ error: String(e instanceof Error ? e.message : e) }));
  const slippage = crew.slippage_bps;
  const minOut = BigInt(poolOut) * BigInt(10_000 - slippage) / 10_000n;
  const body = { side, asset, bps, amount_in: amountIn.toString(), crew_in: crewIn.toString(), vault_in: vaultIn.toString(),
    pool: { token: a.token, amount_out: poolOut, reserves, read_at: new Date().toISOString() }, intents, slippage_bps: slippage, min_out: minOut.toString() };
  return { ...body, hash: await sha256Hex(canonical(body)) };
}

/** Test tokens use the real asset's decimals, so amounts map one to one onto the mainnet asset. */
function scaleTestAmount(amount: bigint): bigint { return amount; }

/** Parses `/buy SOL 20%`, `/sell BTC 50%` (also `/buy 20% sol`). */
export function parseTradeCommand(text: string): { side: Side; asset: string; bps: number } | null {
  const m = text.trim().match(/^\/(buy|sell)\s+(?:([a-z]{2,6})\s+(\d{1,3}(?:\.\d{1,2})?)\s*%|(\d{1,3}(?:\.\d{1,2})?)\s*%\s+([a-z]{2,6}))\s*$/i);
  if (!m) return null;
  const pct = Number(m[3] ?? m[4]);
  if (!(pct > 0 && pct <= 100)) return null;
  return { side: m[1].toLowerCase() as Side, asset: (m[2] ?? m[5]).toUpperCase(), bps: Math.round(pct * 100) };
}

export function memberShare(crew: Crew, account: string): { shares: bigint; bps: number } {
  const s = BigInt(crew.members.find(m => m[0] === account)?.[1] ?? '0');
  const supply = BigInt(crew.supply);
  return { shares: s, bps: supply === 0n ? 0 : Number(s * 10_000n / supply) };
}

/** Exact ragequit payout the contract will compute for `shares` right now. */
export function ragequitPreview(crew: Crew, shares: bigint): { near: bigint; tokens: { symbol: string; amount: bigint }[] } {
  const supply = BigInt(crew.supply);
  if (shares <= 0n || supply === 0n) return { near: 0n, tokens: [] };
  const full = shares === supply;
  return {
    near: full ? BigInt(crew.near) : BigInt(crew.near) * shares / supply,
    tokens: crew.tokens.map(([symbol, v]) => ({ symbol, amount: full ? BigInt(v) : BigInt(v) * shares / supply })).filter(t => t.amount > 0n),
  };
}

/** Sputnik vote tally for the crew role: approvals, rejections and the threshold (strict majority). */
export function tally(p: Proposal, policy: DaoPolicy): { approve: number; reject: number; needed: number; members: number } {
  const role = policy.roles.find(r => r.name === 'crew');
  const members = role && typeof role.kind === 'object' && role.kind.Group ? role.kind.Group.length : 0;
  const t = policy.default_vote_policy.threshold;
  const [n, d] = Array.isArray(t) ? t : [1, 2];
  const counts = p.vote_counts.crew ?? ['0', '0', '0'];
  return { approve: Number(counts[0]), reject: Number(counts[1]), needed: Math.min(Math.floor(members * n / d) + 1, members), members };
}

export const keyOf = (value: unknown) => canonical(value);
