// Crew activity, built only from on-chain receipts and trades.
import { formatNear, formatUnits, memberShare, seasonRow, seasonStart, type Receipt, type SeasonRow, type Trade } from '@kumi/sdk';
import type { CrewState, World } from './api';
import type { Session } from './session';

export const DAY = 86_400_000;
export const nsToMs = (ns: string | number) => Number(BigInt(ns) / 1_000_000n);
export const utcDay = (ms: number) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
export const weekStart = (ms: number) => { const d = new Date(utcDay(ms)); return d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY; };
export const longDay = (ms: number) => new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const hhmm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
export const signed = (v: number, d = 2) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(d)}%`;

export type Kind = 'trade' | 'member' | 'follow';
export type Activity = { key: string; at: number; crewId: number; crew: string; kind: Kind; title: string; sub: string; vote?: boolean };

const KIND: Record<Receipt['kind'], Kind> = { join: 'member', ragequit: 'member', trade: 'trade', captain_trade: 'trade', follow: 'follow', unfollow: 'follow', fee: 'follow' };
const who = (id: string) => id.split('.')[0];

export function amountLine(r: Receipt, st: CrewState) {
  const a = st.assets.find(x => x.symbol === r.asset);
  const tok = (v: string) => `${formatUnits(v, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${r.asset}`;
  if (r.kind === 'join') return `${formatNear(r.near_in, 3)} NEAR in`;
  if (r.kind === 'follow') return `${formatNear(r.shares, 4)} vault shares minted`;
  if (r.kind === 'unfollow') return `${formatNear(r.shares, 4)} vault shares redeemed`;
  if (r.kind === 'trade' || r.kind === 'captain_trade') return BigInt(r.near_out) > 0n ? `${formatNear(r.near_out, 4)} NEAR → ${tok(r.token_in)}` : `${tok(r.token_out)} → ${formatNear(r.near_in, 4)} NEAR`;
  if (r.kind === 'ragequit') return `${formatNear(r.near_out, 4)} NEAR${BigInt(r.token_out) > 0n ? ` + ${tok(r.token_out)}` : ''} out`;
  return `${formatNear(r.near_in, 5)} NEAR fee above the high-water mark`;
}

function title(r: Receipt, st: CrewState): string {
  if (r.kind === 'trade' || r.kind === 'captain_trade') {
    const t = st.trades.find(x => x.id === r.trade_id);
    return t ? `${t.side === 'buy' ? 'Buy' : 'Sell'} ${t.asset} ${(t.bps / 100).toLocaleString()}%` : 'Trade filled';
  }
  if (r.kind === 'join') return `${who(r.account_id)} chipped in`;
  if (r.kind === 'ragequit') return `${who(r.account_id)} ragequit`;
  if (r.kind === 'follow') return `${who(r.account_id)} followed`;
  if (r.kind === 'unfollow') return `${who(r.account_id)} left the vault`;
  return 'Performance fee paid';
}

export function activity(world: World): Activity[] {
  const out: Activity[] = [];
  for (const st of world.crews) {
    for (const r of st.receipts) {
      const lane = r.kind === 'captain_trade' ? 'captain trade · ' : r.kind === 'trade' ? 'voted · ' : '';
      out.push({ key: `${st.crew.id}:${r.seq}`, at: nsToMs(r.at), crewId: st.crew.id, crew: st.crew.name, kind: KIND[r.kind], title: title(r, st), sub: `${st.crew.name} · ${lane}${amountLine(r, st)}` });
    }
    for (const t of st.trades.filter(t => t.status === 'voting')) out.push(pending(t, st));
  }
  return out.sort((a, b) => b.at - a.at);
}

function pending(t: Trade, st: CrewState): Activity {
  return { key: `${st.crew.id}:t${t.id}`, at: nsToMs(t.created_at), crewId: st.crew.id, crew: st.crew.name, kind: 'trade',
    title: `${t.side === 'buy' ? 'Buy' : 'Sell'} ${t.asset} ${(t.bps / 100).toLocaleString()}%`, sub: `${st.crew.name} · open vote, pitched by ${who(t.proposer)}`, vote: true };
}

/** This week's season rows, ranked. */
export function season(world: World): (SeasonRow & { st: CrewState })[] {
  const start = seasonStart();
  return world.crews.map(st => ({ ...seasonRow(st.crew, st.pnl, start), st })).sort((a, b) => b.score - a.score || b.navNear - a.navNear);
}
export function seasonLabel() {
  const start = seasonStart();
  const thu = new Date(start.getTime() + 3 * DAY);
  const week = 1 + Math.floor((thu.getTime() - Date.UTC(thu.getUTCFullYear(), 0, 1)) / (7 * DAY));
  const end = new Date(start.getTime() + 6 * DAY);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return { week, range: `${fmt(start)} – ${fmt(end)}` };
}

/** The signed-in player's stake in each crew they hold shares in, valued at live NAV. */
export function stakes(world: World, me: Session | null) {
  if (!me) return [];
  return world.crews.map(st => ({ st, share: memberShare(st.crew, me.accountId) }))
    .filter(x => x.share.shares > 0n)
    .map(x => ({ ...x, near: x.st.pnl.navNear * x.share.bps / 10_000 }));
}
export function follows(world: World, me: Session | null) {
  if (!me) return [];
  return world.crews.map(st => ({ st, shares: BigInt(st.crew.followers.find(f => f[0] === me.accountId)?.[1] ?? '0') })).filter(x => x.shares > 0n);
}
