// Proof of P&L: a crew's performance computed only from the hub's on-chain receipts.
// Each receipt carries the crew's state right after the event. Between events, every asset is
// marked at the last price the receipts themselves recorded: the crew's own fills, or the pool
// marks the contract read on-chain for a join, follow or fee. The final point uses live marks.
// Nothing here can be edited by the crew: receipts are written by the contract in the same
// receipt as the state change.
import type { Crew, Mark, Pair, Receipt } from './kumi.js';

export type PnlPoint = { seq: number; at: number; kind: string; nav: number; supply: number; pps: number };
export type Pnl = {
  points: PnlPoint[];
  /** Price per share now (1.0 at the first join). */
  pps: number;
  returnPct: number;
  maxDrawdownPct: number;
  /** Return minus half the max drawdown: the season rank key. */
  score: number;
  navNear: number;
  deposits: number;
  /** True when the latest receipt matches the crew's live state exactly. */
  verified: boolean;
  verifyNote: string;
};

const YOCTO = 1e24;
const priceOf = (m: Mark) => Number(m.near_reserve) / Number(m.token_reserve);

function navOf(near: string, tokens: Pair[], prices: Map<string, number>): number {
  let v = Number(near) / YOCTO;
  for (const [s, amt] of tokens) {
    const p = prices.get(s);
    if (Number(amt) > 0 && p !== undefined) v += Number(amt) * p / YOCTO;
  }
  return v;
}

export function computePnl(receipts: Receipt[], crew: Crew, liveMarks: Mark[]): Pnl {
  const prices = new Map<string, number>();
  const points: PnlPoint[] = [];
  let deposits = 0;
  for (const r of receipts) {
    for (const m of r.marks) prices.set(m.symbol, priceOf(m));
    if ((r.kind === 'trade' || r.kind === 'captain_trade') && r.asset) {
      // Fill price from the receipt: NEAR leg / token leg (crew side only).
      const nearLeg = Number(r.near_out) || Number(r.near_in);
      const tokLeg = Number(r.token_in) || Number(r.token_out);
      if (nearLeg > 0 && tokLeg > 0) prices.set(r.asset, nearLeg / tokLeg);
    }
    if (r.kind === 'join') deposits += Number(r.near_in) / YOCTO;
    const supply = Number(r.crew_supply) / YOCTO;
    if (supply <= 0) continue;
    const nav = navOf(r.crew_near, r.crew_tokens, prices);
    points.push({ seq: r.seq, at: Number(BigInt(r.at) / 1_000_000n), kind: r.kind, nav, supply, pps: nav / supply });
  }
  for (const m of liveMarks) prices.set(m.symbol, priceOf(m));
  const supplyNow = Number(crew.supply) / YOCTO;
  const navNow = navOf(crew.near, crew.tokens, prices);
  if (supplyNow > 0) points.push({ seq: -1, at: Date.now(), kind: 'live', nav: navNow, supply: supplyNow, pps: navNow / supplyNow });
  let peak = 0, maxDd = 0;
  for (const p of points) { peak = Math.max(peak, p.pps); if (peak > 0) maxDd = Math.max(maxDd, (peak - p.pps) / peak); }
  const pps = points.length ? points[points.length - 1].pps : 1;
  const returnPct = (pps - 1) * 100;
  const last = receipts[receipts.length - 1];
  const same = (a: Pair[], b: Pair[]) => JSON.stringify(a.filter(p => p[1] !== '0')) === JSON.stringify(b.filter(p => p[1] !== '0'));
  const verified = !last ? crew.receipt_count === 0
    : last.crew_near === crew.near && last.crew_supply === crew.supply && same(last.crew_tokens, crew.tokens) && receipts.length === crew.receipt_count;
  return {
    points, pps, returnPct, maxDrawdownPct: maxDd * 100, score: returnPct - 50 * maxDd, navNear: navNow, deposits,
    verified, verifyNote: verified ? `Recomputed from ${receipts.length} on-chain receipts; latest receipt equals live state`
      : 'Live state differs from the latest receipt (a trade may be in flight)',
  };
}

/** Weekly seasons, Monday 00:00 UTC. */
export function seasonStart(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

export type SeasonRow = { crewId: number; name: string; returnPct: number; maxDrawdownPct: number; score: number; navNear: number; members: number; followers: number; verified: boolean; trades: number };

/** Season return: price per share now against the last receipt before the season began. */
export function seasonRow(crew: Crew, pnl: Pnl, start = seasonStart()): SeasonRow {
  const t0 = start.getTime();
  const before = [...pnl.points].reverse().find(p => p.at < t0 && p.kind !== 'live');
  const inSeason = pnl.points.filter(p => p.at >= t0);
  const base = before?.pps ?? inSeason[0]?.pps ?? 1;
  const series = before ? [before, ...inSeason] : inSeason;
  let peak = 0, dd = 0;
  for (const p of series) { peak = Math.max(peak, p.pps); if (peak > 0) dd = Math.max(dd, (peak - p.pps) / peak); }
  const ret = (pnl.pps / base - 1) * 100;
  return { crewId: crew.id, name: crew.name, returnPct: ret, maxDrawdownPct: dd * 100, score: ret - 50 * dd, navNear: pnl.navNear,
    members: crew.members.length, followers: crew.followers.length, verified: pnl.verified, trades: pnl.points.filter(p => p.kind.includes('trade')).length };
}

export function rankSeason(rows: SeasonRow[]): SeasonRow[] {
  return [...rows].sort((a, b) => b.score - a.score || b.navNear - a.navNear);
}
