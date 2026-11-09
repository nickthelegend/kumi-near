import { useMemo, useState } from 'react';
import { dryQuote, formatNear, formatUnits, getTokens, held, memberShare, parseNear, ragequitPreview, LIVE_SWAP_SETUP, type Pnl } from '@kumi/sdk';
import type { CrewState } from '../lib/api';
import { useAsync } from '../lib/api';
import type { Session } from '../lib/session';
import { ragequit, relay } from './actions';
import { Art, Notice, Tx } from './bits';

export function Spark({ pnl, height }: { pnl: Pnl; height?: number }) {
  const pts = pnl.points;
  if (pts.length < 2) return <div className="faint" style={{ fontSize: 13, marginTop: 8 }}>The chart starts after the first trade.</div>;
  const ys = pts.map(p => p.pps);
  const min = Math.min(...ys, 1) * 0.995, max = Math.max(...ys, 1) * 1.005;
  const x = (i: number) => (i / (pts.length - 1)) * 300;
  const y = (v: number) => 90 - ((v - min) / (max - min || 1)) * 80;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pps).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" style={height ? { height } : undefined} viewBox="0 0 300 96" preserveAspectRatio="none" role="img" aria-label={`Price per share over ${pts.length} receipts`}>
      <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ffd36e" stopOpacity=".35" /><stop offset="1" stopColor="#ffd36e" stopOpacity="0" /></linearGradient></defs>
      <line x1="0" x2="300" y1={y(1)} y2={y(1)} stroke="rgba(255,228,214,.18)" strokeDasharray="3 4" />
      <path d={`${line} L300,96 L0,96 Z`} fill="url(#g)" />
      <path d={line} fill="none" stroke="#ffd36e" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const pct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

export function FundPane({ st, me, hub, onChanged }: { st: CrewState; me: Session | null; hub: string; onChanged: () => void }) {
  const { crew, pnl, assets, marks } = st;
  const [sheet, setSheet] = useState<'join' | 'quit' | null>(null);
  const mine = me ? memberShare(crew, me.accountId) : null;
  const invited = !!me && crew.allowed.includes(me.accountId);
  const value = (sym: string, amt: bigint) => {
    const m = marks.find(x => x.symbol === sym);
    return m ? amt * BigInt(m.near_reserve) / BigInt(m.token_reserve) : 0n;
  };
  const navY = BigInt(Math.round(pnl.navNear * 1e6)) * 10n ** 18n;
  const rows = [{ sym: 'NEAR', amount: BigInt(crew.near), v: BigInt(crew.near), sub: 'Native, in the crew vault' },
    ...assets.map(a => { const amt = held(crew.tokens, a.symbol); return { sym: a.symbol, amount: amt, v: value(a.symbol, amt), sub: `Test pool on NEAR · mainnet: ${a.symbol} on ${a.symbol === 'SOL' ? 'Solana' : 'Bitcoin'} via 1Click` }; })];
  return (
    <aside className="fund" aria-label="Crew fund">
      <div className="nav-card">
        <div className="row-between"><span className="label">Treasury NAV</span>
          <span className={pnl.verified ? 'chip chip-butter' : 'chip chip-rose'} title={pnl.verifyNote}><span className="dot" />{pnl.verified ? 'Verified on-chain' : 'Unverified'}</span></div>
        <div className="big">{pnl.navNear.toFixed(4)} <small>NEAR</small></div>
        <div className="row" style={{ gap: 12, fontSize: 14 }}>
          <span className={pnl.returnPct >= 0 ? 'up mono' : 'down mono'}>{pct(pnl.returnPct)}</span>
          <span className="faint">since the first deposit · {pnl.pps.toFixed(4)} NEAR a share</span>
        </div>
        <Spark pnl={pnl} />
      </div>
      <div className="kpis">
        <div className="kpi"><div className="label">Max drawdown</div><div className="v down">{pnl.maxDrawdownPct.toFixed(2)}%</div></div>
        <div className="kpi"><div className="label">Season score</div><div className="v">{pnl.score.toFixed(2)}</div></div>
        <div className="kpi"><div className="label">Deposited</div><div className="v">{formatNear(crew.deposited, 3)}</div></div>
        <div className="kpi"><div className="label">Followers</div><div className="v">{crew.followers.length}<span className="faint" style={{ fontSize: 13 }}> · {formatNear(crew.vault_near, 2)}N</span></div></div>
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <div className="panel-head" style={{ marginBottom: 6 }}><h3 style={{ fontSize: 17 }}>Holdings</h3><span className="faint mono" style={{ fontSize: 11 }}>marks: test pools, on-chain</span></div>
        {rows.map(r => (
          <div className="holding" key={r.sym}>
            <span className={`asset asset-${r.sym}`}>{r.sym}</span>
            <div style={{ minWidth: 0 }}><div className="n">{r.sym === 'NEAR' ? 'NEAR' : `t${r.sym}`}</div><div className="sub">{r.sub}</div>
              <div className="bar"><i style={{ width: `${navY > 0n ? Number(r.v * 1000n / navY) / 10 : 0}%` }} /></div></div>
            <div className="amt">{r.sym === 'NEAR' ? formatNear(r.amount, 4) : formatUnits(r.amount, assets.find(a => a.symbol === r.sym)?.decimals ?? 0, 6)}<div className="faint" style={{ fontSize: 11 }}>{formatNear(r.v, 4)} N</div></div>
          </div>
        ))}
      </div>

      <div className="panel" style={{ padding: 18 }}>
        <div className="panel-head" style={{ marginBottom: 10 }}><h3 style={{ fontSize: 17 }}>Your position</h3></div>
        {!me ? <p className="faint" style={{ margin: 0 }}>Sign in to see your share.</p>
          : mine && mine.shares > 0n ? (
            <div className="stack" style={{ gap: 12 }}>
              <div className="row-between"><span className="muted">Share of the crew</span><b className="mono">{(mine.bps / 100).toFixed(2)}%</b></div>
              <div className="row-between"><span className="muted">Worth now</span><b className="mono">{(pnl.navNear * mine.bps / 10_000).toFixed(4)} NEAR</b></div>
              <div className="split"><button className="btn btn-sm" onClick={() => setSheet('join')}>Add more</button><button className="btn btn-sm" onClick={() => setSheet('quit')}>Ragequit</button></div>
            </div>
          ) : invited ? (
            <div className="stack" style={{ gap: 10 }}><p className="muted" style={{ margin: 0 }}>You're invited. Chip in to get shares and a vote.</p><button className="btn btn-primary" onClick={() => setSheet('join')}>Join the crew</button></div>
          ) : <p className="faint" style={{ margin: 0 }}>You're not a member of this crew. You can follow it from its public page.</p>}
      </div>
      {sheet === 'join' && me && <JoinSheet st={st} me={me} hub={hub} onClose={() => setSheet(null)} onDone={onChanged} />}
      {sheet === 'quit' && me && mine && <QuitSheet st={st} me={me} hub={hub} shares={mine.shares} onClose={() => setSheet(null)} onDone={onChanged} />}
    </aside>
  );
}

function JoinSheet({ st, me, hub, onClose, onDone }: { st: CrewState; me: Session; hub: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('0.05');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  return (
    <div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <form className="sheet stack" role="dialog" aria-modal="true" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError(null);
        try { const r = await relay(me, hub, 'join', { crew_id: st.crew.id }, parseNear(amount), { crewId: st.crew.id, label: 'join' }); setHash(r.hash); onDone(); }
        catch (x) { setError(String(x instanceof Error ? x.message : x)); } finally { setBusy(false); }
      }}>
        <div className="sheet-art"><Art name="kumi-feature-vote" alt="Hands dropping coins into a jar" /></div>
        <div><h3>Chip into {st.crew.name}</h3><p className="sub">Shares are minted at the current NAV ({st.pnl.pps.toFixed(4)} NEAR a share), priced from the pools on-chain.</p></div>
        <label className="field"><span className="label">Amount (testnet NEAR)</span><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <Notice>Testnet: new players get a small NEAR gift to try this. Deposits from any chain go through 1Click on mainnet: {LIVE_SWAP_SETUP}.</Notice>
        {error && <Notice error>{error}</Notice>}
        {hash ? <><div className="row">Joined in <Tx hash={hash} /></div><button type="button" className="btn btn-primary" onClick={onClose}>Done</button></>
          : <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Signing and relaying…' : `Deposit ${amount} NEAR`}</button>}
      </form>
    </div>
  );
}

function QuitSheet({ st, me, hub, shares, onClose, onDone }: { st: CrewState; me: Session; hub: string; shares: bigint; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'kind' | 'chain'>('kind');
  const [dest, setDest] = useState('nep141:sol.omft.near');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const preview = useMemo(() => ragequitPreview(st.crew, shares), [st.crew, shares]);
  const tokens = useAsync(() => getTokens(), []);
  const destOptions = (tokens.data ?? []).filter(t => ['sol', 'btc', 'base', 'eth', 'arb'].includes(t.blockchain) && ['SOL', 'BTC', 'USDC', 'ETH'].includes(t.symbol)).slice(0, 8);
  const quote = useAsync(async () => mode === 'chain' && preview.near > 0n ? dryQuote({ originAsset: 'nep141:wrap.near', destinationAsset: dest, amount: preview.near.toString(), recipientType: 'INTENTS' }) : null, [mode, dest, preview.near.toString()]);
  return (
    <div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet stack" role="dialog" aria-modal="true">
        <div><h3>Ragequit</h3><p className="sub">Leave with your exact slice of every asset. No vote, no permission.</p></div>
        <div className="panel" style={{ padding: 16, background: 'var(--bg-deep)' }}>
          <div className="label" style={{ marginBottom: 8 }}>You receive now</div>
          <div className="row-between"><span>NEAR</span><b className="mono">{formatNear(preview.near, 6)}</b></div>
          {preview.tokens.map(t => <div className="row-between" key={t.symbol} style={{ marginTop: 6 }}><span>t{t.symbol}</span><b className="mono">{formatUnits(t.amount, st.assets.find(a => a.symbol === t.symbol)?.decimals ?? 0, 8)}</b></div>)}
        </div>
        <div className="seg" role="group" aria-label="Payout">
          <button aria-pressed={mode === 'kind'} onClick={() => setMode('kind')}>In kind on NEAR</button>
          <button aria-pressed={mode === 'chain'} onClick={() => setMode('chain')}>To any chain</button>
        </div>
        {mode === 'chain' && (
          <div className="stack" style={{ gap: 10 }}>
            <label className="field"><span className="label">Receive as</span>
              <select className="input" value={dest} onChange={e => setDest(e.target.value)}>
                {destOptions.length === 0 && <option value={dest}>SOL on Solana</option>}
                {destOptions.map(t => <option key={t.assetId} value={t.assetId}>{t.symbol} on {t.blockchain.toUpperCase()}</option>)}
              </select></label>
            {quote.loading ? <div className="skeleton" style={{ height: 52 }} /> : quote.error ? <Notice error>1Click: {quote.error}</Notice> : quote.data && (
              <Notice><div>Mainnet 1Click dry quote for your NEAR: <b className="mono">{Number(quote.data.quote.amountInFormatted).toPrecision(5)} → {Number(quote.data.quote.amountOutFormatted).toPrecision(5)}</b>{quote.data.quote.amountOutUsd ? ` (~$${Number(quote.data.quote.amountOutUsd).toFixed(2)})` : ''}. Live cross-chain payout: <b>{LIVE_SWAP_SETUP}</b>. On testnet you exit in kind.</div></Notice>
            )}
          </div>
        )}
        {error && <Notice error>{error}</Notice>}
        {hash ? <><div className="row">Exited in <Tx hash={hash} /></div><button className="btn btn-primary" onClick={onClose}>Done</button></> : (
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const r = await ragequit(me, hub, st.crew, shares, preview.tokens.map(t => ({ symbol: t.symbol, token: st.assets.find(a => a.symbol === t.symbol)!.token })));
              setHash(r.hash); onDone();
            } catch (x) { setError(String(x instanceof Error ? x.message : x)); } finally { setBusy(false); }
          }}>{busy ? 'Signing and relaying…' : 'Ragequit on testnet, in kind'}</button>
        )}
      </div>
    </div>
  );
}
