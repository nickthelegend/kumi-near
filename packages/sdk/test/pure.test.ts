// Pure functions only: command parsing, pool math, chat signatures, P&L from receipts.
import { describe, expect, it } from 'vitest';
import { amountOut, computePnl, KeyPair, parseTradeCommand, ragequitPreview, rankSeason, seasonRow, signChat, verifyChat, type Crew, type Receipt } from '../src/index.js';

const ONE = 10n ** 24n;
const crew = (o: Partial<Crew>): Crew => ({ id: 0, name: 'Owls', dao: 'owls.sputnikv2.testnet', creator: 'a', created_at: '0', allowed: [], members: [],
  supply: '0', near: '0', tokens: [], deposited: '0', slippage_bps: 300, captain: null, captain_trades_today: 0, vault_supply: '0', vault_near: '0',
  vault_tokens: [], vault_fee_bps: 2000, vault_hwm: ONE.toString(), vault_fees_paid: '0', followers: [], busy: false, trade_count: 0, receipt_count: 0, ...o });
const rc = (seq: number, kind: Receipt['kind'], o: Partial<Receipt>): Receipt => ({ seq, kind, account_id: 'a', at: String(BigInt(seq + 1) * 3_600_000_000_000n + 1_762_000_000_000_000_000n), block: '1', trade_id: null,
  near_in: '0', near_out: '0', asset: null, token_in: '0', token_out: '0', shares: '0', marks: [], crew_near: '0', crew_tokens: [], crew_supply: '0',
  vault_near: '0', vault_tokens: [], vault_supply: '0', ...o });

describe('chat commands', () => {
  it('parses /buy and /sell with a percentage', () => {
    expect(parseTradeCommand('/buy SOL 20%')).toEqual({ side: 'buy', asset: 'SOL', bps: 2000 });
    expect(parseTradeCommand('/sell btc 50 %')).toEqual({ side: 'sell', asset: 'BTC', bps: 5000 });
    expect(parseTradeCommand('/buy 12.5% sol')).toEqual({ side: 'buy', asset: 'SOL', bps: 1250 });
    expect(parseTradeCommand('/buy SOL 0%')).toBeNull();
    expect(parseTradeCommand('/buy SOL 120%')).toBeNull();
    expect(parseTradeCommand('buy SOL 20%')).toBeNull();
  });
});

describe('pool math', () => {
  it('matches the contract formula and keeps k', () => {
    const out = amountOut(ONE, 1000n * ONE, 50_000n * 10n ** 8n);
    expect(out).toBe(4_980_034_905n);
    expect((1001n * ONE) * (50_000n * 10n ** 8n - out) >= 1000n * ONE * 50_000n * 10n ** 8n).toBe(true);
  });
  it('previews an exact ragequit, the last exit takes everything', () => {
    const c = crew({ supply: (3n * ONE).toString(), near: (3n * ONE + 2n).toString(), tokens: [['SOL', '1000']] });
    expect(ragequitPreview(c, ONE)).toEqual({ near: ONE, tokens: [{ symbol: 'SOL', amount: 333n }] });
    expect(ragequitPreview(c, 3n * ONE)).toEqual({ near: 3n * ONE + 2n, tokens: [{ symbol: 'SOL', amount: 1000n }] });
  });
});

describe('chat signatures', () => {
  it('verifies a signed message and rejects a tampered one', async () => {
    const kp = KeyPair.fromRandom('ed25519');
    const sig = await signChat(kp, 0, 'mika.kumi.testnet', 1, '/buy SOL 20%');
    expect(await verifyChat(kp.getPublicKey().toString(), 0, 'mika.kumi.testnet', 1, '/buy SOL 20%', sig)).toBe(true);
    expect(await verifyChat(kp.getPublicKey().toString(), 0, 'mika.kumi.testnet', 1, '/buy SOL 90%', sig)).toBe(false);
  });
});

describe('P&L only from receipts', () => {
  // 3 NEAR joins; buys 1 NEAR of SOL; a later join's on-chain mark doubles SOL; live marks then fall to 1.2x.
  const receipts = [
    rc(0, 'join', { near_in: (3n * ONE).toString(), crew_near: (3n * ONE).toString(), crew_supply: (3n * ONE).toString() }),
    rc(1, 'trade', { asset: 'SOL', near_out: ONE.toString(), token_in: (100n * 10n ** 22n).toString(), crew_near: (2n * ONE).toString(), crew_tokens: [['SOL', (100n * 10n ** 22n).toString()]], crew_supply: (3n * ONE).toString() }),
    rc(2, 'join', { near_in: ONE.toString(), marks: [{ symbol: 'SOL', near_reserve: '2', token_reserve: '1' }], crew_near: (3n * ONE).toString(), crew_tokens: [['SOL', (100n * 10n ** 22n).toString()]], crew_supply: (3n * ONE + 3n * ONE / 4n).toString() }),
  ];
  const live = crew({ near: (3n * ONE).toString(), tokens: [['SOL', (100n * 10n ** 22n).toString()]], supply: (3n * ONE + 3n * ONE / 4n).toString(), receipt_count: 3 });
  it('marks each asset at its last receipt price and verifies against live state', () => {
    const p = computePnl(receipts, live, [{ symbol: 'SOL', near_reserve: '6', token_reserve: '5' }]);
    expect(p.points.map(x => Number(x.pps.toFixed(4)))).toEqual([1, 1, 1.3333, 1.12]);
    expect(p.returnPct).toBeCloseTo(12, 1);
    expect(p.maxDrawdownPct).toBeCloseTo(16, 1);
    expect(p.verified).toBe(true);
    expect(p.deposits).toBe(4);
  });
  it('flags state that no receipt explains', () => {
    const moved = { ...live, near: (5n * ONE).toString() };
    expect(computePnl(receipts, moved, []).verified).toBe(false);
  });
  it('ranks a season by drawdown-adjusted return', () => {
    const a = seasonRow(live, computePnl(receipts, live, [{ symbol: 'SOL', near_reserve: '6', token_reserve: '5' }]), new Date(0));
    const b = { ...a, crewId: 1, name: 'B', returnPct: 5, maxDrawdownPct: 0, score: 5 };
    expect(rankSeason([a, b]).map(r => r.name)).toEqual(['B', 'Owls']);
  });
});
