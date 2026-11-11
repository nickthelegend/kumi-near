import { useMemo, useState } from 'react';
import { accountUrl, dryQuote, formatNear, formatUnits, getProposals, getTokens, held, memberShare, parseNear, ragequitPreview, seasonRow, view, LIVE_SWAP_SETUP, type Pnl } from '@kumi/sdk';
import { HUB, useAsync, type CrewState } from '../lib/api';
import { makeCaptainKey, type Session } from '../lib/session';
import { ragequit, relay, vote } from './actions';
import { Art, Avatar, Done, Ic, Link, MiniEmpty, Notice, Obj, Tx, memberHue, shortName } from './bits';
import { ChainLogo, TokenLogo } from './logos';

export function Spark({ pnl, height, light }: { pnl: Pnl; height?: number; light?: boolean }) {
  const pts = pnl.points;
  if (pts.length < 2) return <p className={light ? 'faint' : 'sub'} style={{ fontSize: 13, margin: '10px 0' }}>The chart starts after the first trade.</p>;
  const ys = pts.map(p => p.pps);
  const min = Math.min(...ys, 1) * 0.995, max = Math.max(...ys, 1) * 1.005;
  const x = (i: number) => (i / (pts.length - 1)) * 300;
  const y = (v: number) => 90 - ((v - min) / (max - min || 1)) * 80;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pps).toFixed(1)}`).join(' ');
  const up = pnl.returnPct >= 0;
  const c = up ? '#3ddc97' : '#ff8fc7';
  const id = `spark-${light ? 'l' : 'd'}-${up ? 'u' : 'd'}`;
  return (
    <svg className="spark" style={height ? { height } : undefined} viewBox="0 0 300 96" preserveAspectRatio="none" role="img" aria-label={`Price per share over ${pts.length} receipts, ${up ? 'up' : 'down'} ${Math.abs(pnl.returnPct).toFixed(2)}%`}>
      <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={c} stopOpacity=".4" /><stop offset="1" stopColor={c} stopOpacity="0" /></linearGradient></defs>
      <line x1="0" x2="300" y1={y(1)} y2={y(1)} stroke={light ? 'rgba(59,31,74,.2)' : 'rgba(255,255,255,.25)'} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={`${line} L300,96 L0,96 Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={c} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const pct = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
const ASSET_COLOR: Record<string, string> = { NEAR: '#e8d6c4', SOL: '#b69cff', BTC: '#ffb347' };

/** Robinhood-style fund pane: balance card, coloured stat tiles, position, holdings. */
export function FundPane({ st, me, onJoin, onQuit }: { st: CrewState; me: Session | null; onJoin: () => void; onQuit: () => void }) {
  const { crew, pnl, assets, marks } = st;
  const mine = me ? memberShare(crew, me.accountId) : null;
  const invited = !!me && crew.allowed.includes(me.accountId);
  const week = seasonRow(crew, pnl).returnPct;
  const value = (sym: string, amt: bigint) => {
    const m = marks.find(x => x.symbol === sym);
    return m ? amt * BigInt(m.near_reserve) / BigInt(m.token_reserve) : 0n;
  };
  const navY = BigInt(Math.round(pnl.navNear * 1e6)) * 10n ** 18n;
  const rows = [{ sym: 'NEAR', amount: BigInt(crew.near), v: BigInt(crew.near), sub: 'Native, in the crew vault' },
    ...assets.map(a => { const amt = held(crew.tokens, a.symbol); return { sym: a.symbol, amount: amt, v: value(a.symbol, amt), sub: `Test pool · mainnet ${a.symbol} via 1Click` }; })];
  const share = (v: bigint) => (navY > 0n ? Number(v * 1000n / navY) / 10 : 0);
  return <>
    <div className="hero-card">
      <div className="row-between"><span className="label">Crew fund · NAV</span>
        <span className={`verify ${pnl.verified ? '' : 'bad'}`} title={pnl.verifyNote}><i />{pnl.verified ? 'Verified on-chain' : 'Unverified'}</span></div>
      <div className="big row" style={{ gap: 10 }}><TokenLogo sym="NEAR" size={34} />{pnl.navNear.toFixed(4)} <small>NEAR</small></div>
      <div className="row" style={{ flexWrap: 'wrap' }}><span className={`ret ${pnl.returnPct >= 0 ? '' : 'neg'}`}><Ic name={pnl.returnPct >= 0 ? 'up' : 'down'} size={14} />{pct(pnl.returnPct)}</span><span className="sub">all time · {pnl.pps.toFixed(4)} NEAR a share</span></div>
      <Spark pnl={pnl} />
    </div>
    <div className="tiles">
      <div className="tile tone-mint"><div className="label">This week</div><div className={`v ${week >= 0 ? 'up' : 'down'}`}>{pct(week)}</div></div>
      <div className="tile tone-pink"><div className="label">Max drawdown</div><div className="v">{pnl.maxDrawdownPct.toFixed(2)}%</div></div>
      <div className="tile tone-butter"><div className="label">Deposited</div><div className="v">{formatNear(crew.deposited, 3)} <small>NEAR</small></div></div>
      <div className="tile tone-coral"><div className="label">Followers</div><div className="v">{crew.followers.length} <small>· {formatNear(crew.vault_near, 2)} N</small></div></div>
    </div>

    <div className="card">
      <div className="card-head"><h3>Your position</h3>{mine && mine.shares > 0n && <span className="chip chip-coral">{(mine.bps / 100).toFixed(2)}% of the crew</span>}</div>
      {!me ? <MiniEmpty obj="jar">Sign in to see your share, vote and chip in.</MiniEmpty>
        : mine && mine.shares > 0n ? <div className="stack" style={{ gap: 12 }}>
          <div className="row-between"><span className="muted">Worth now</span><b className="mono" style={{ fontSize: 18 }}>{(pnl.navNear * mine.bps / 10_000).toFixed(4)} NEAR</b></div>
          <div className="row" style={{ gap: 8 }}><button className="btn btn-primary" style={{ flex: 1 }} onClick={onJoin}><Ic name="plus" size={16} />Chip in more</button><button className="btn btn-pink" style={{ flex: 1 }} onClick={onQuit}><Ic name="exit" size={16} />Ragequit</button></div>
        </div>
        : invited ? <div className="stack" style={{ gap: 10 }}><p className="mini">You're invited. <b>Chip in</b> to get shares and a vote.</p><button className="btn btn-primary btn-block" onClick={onJoin}><Ic name="jar" size={16} />Chip in to {crew.name}</button></div>
        : <MiniEmpty obj="jar">Only invited members hold shares. Anyone can <Link to={`/crew/${crew.id}`}><b>follow {crew.name}</b></Link> and mirror its trades.</MiniEmpty>}
    </div>

    <div className="card">
      <div className="card-head"><h3>Holdings</h3><span className="label">marks: on-chain test pools</span></div>
      <div className="alloc" role="img" aria-label="Allocation">{rows.map(r => share(r.v) > 0 && <span key={r.sym} style={{ flexGrow: share(r.v), background: ASSET_COLOR[r.sym] ?? '#ccc' }} title={`${r.sym} ${share(r.v).toFixed(1)}%`} />)}</div>
      {rows.map(r => <div className="holding" key={r.sym}>
        <TokenLogo sym={r.sym} size={38} test={r.sym !== 'NEAR'} />
        <div style={{ minWidth: 0 }}><div className="n">{r.sym === 'NEAR' ? 'NEAR' : `t${r.sym}`} <span className="faint mono" style={{ fontSize: 11 }}>{share(r.v).toFixed(1)}%</span></div><div className="s">{r.sub}</div></div>
        <div className="amt">{r.sym === 'NEAR' ? formatNear(r.amount, 4) : formatUnits(r.amount, assets.find(a => a.symbol === r.sym)?.decimals ?? 0, Math.min(assets.find(a => a.symbol === r.sym)?.decimals ?? 0, 8))}<div>{formatNear(r.v, 4)} N</div></div>
      </div>)}
    </div>
  </>;
}

/** Members, captain lane and non-trade DAO votes. */
export function CrewInfo({ st, me, onChanged }: { st: CrewState; me: Session | null; onChanged: () => void }) {
  const { crew } = st;
  const open = useAsync(async () => {
    const last = await view<number>(crew.dao, 'get_last_proposal_id');
    const from = Math.max(0, last - 8);
    const ps = last > 0 ? await getProposals(crew.dao, from, last - from) : [];
    return ps.filter(p => p.status === 'InProgress' && !p.description.startsWith('Kumi trade')).reverse();
  }, [crew.dao, st.readAt]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMember = !!me && crew.allowed.includes(me.accountId);
  const isCaptain = me && crew.captain?.account_id === me.accountId;
  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name); setError(null);
    try { await fn(); onChanged(); open.reload(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(null); }
  }
  async function proposeMe() {
    const key = makeCaptainKey(crew.id);
    const args = { crew_id: crew.id, captain: { account_id: me!.accountId, public_key: key.getPublicKey().toString(), max_bps: 1000, max_daily: 3, assets: st.assets.map(a => a.symbol) } };
    await relay(me!, crew.dao, 'add_proposal', { proposal: { description: `Kumi: make ${me!.handle} captain (max 10% a trade, 3 a day)`,
      kind: { FunctionCall: { receiver_id: HUB, actions: [{ method_name: 'set_captain', args: btoa(JSON.stringify(args)), deposit: '0', gas: '100000000000000' }] } } } });
  }
  return <>
    <div className="card">
      <div className="card-head"><h3>Members</h3><span className="chip chip-plum">strict majority votes</span></div>
      {crew.allowed.map(a => {
        const s = memberShare(crew, a);
        return <div className="member" key={a}><Avatar id={a} /><div style={{ minWidth: 0 }}><div className="n">{shortName(a)}{crew.captain?.account_id === a && <span className="chip chip-butter">captain</span>}</div><div className="s">{s.shares > 0n ? 'holds shares, votes' : 'invited, no deposit yet'}</div></div>
          <div className="share" style={{ ['--tone' as string]: memberHue(a) }}>{(s.bps / 100).toFixed(1)}%<i><b style={{ width: `${s.bps / 100}%` }} /></i></div></div>;
      })}
      <p className="mini" style={{ marginTop: 6, fontSize: 13 }}>Sputnik DAO <a className="hash" href={accountUrl(crew.dao)} target="_blank" rel="noreferrer">{crew.dao}</a> · {crew.slippage_bps / 100}% max slippage</p>
    </div>
    <div className="card" style={{ background: 'var(--butter-soft)', borderColor: 'transparent' }}>
      <div className="card-head"><h3>Captain lane</h3><Obj name="captain" size={48} alt="A captain's hat" /></div>
      {crew.captain ? <p className="mini"><b>{shortName(crew.captain.account_id)}</b> can trade up to <b>{crew.captain.max_bps / 100}%</b> at once, {crew.captain.max_daily} a day, in {crew.captain.assets.join(', ')}, with no vote. {crew.captain_trades_today} used today. The key can only call <span className="mono">captain_trade</span>.</p>
        : <p className="mini">No captain yet. A vote can give one member a key for small instant trades.</p>}
      {isMember && !isCaptain && <button className="btn btn-sm btn-block" style={{ marginTop: 12 }} disabled={!!busy} onClick={() => act('cap', proposeMe)}>{busy === 'cap' ? 'Filing…' : 'Propose me as captain'}</button>}
    </div>
    <div className="card">
      <div className="card-head"><h3>Other DAO votes</h3></div>
      {open.error ? <Notice error>Could not read DAO votes: {open.error}</Notice> : open.loading && !open.data ? <div className="skeleton" style={{ height: 60 }} /> : (open.data ?? []).length === 0 ? <MiniEmpty obj="vote">None open. Trade votes live in the chat.</MiniEmpty> :
        open.data!.map(p => <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <p className="mini" style={{ color: 'var(--ink)' }}>{p.description}</p>
          <div className="row-between" style={{ marginTop: 8 }}><span className="faint mono" style={{ fontSize: 11 }}>#{p.id} · {Object.keys(p.votes).length} voted</span>
            {isMember && !p.votes[me!.accountId] && <button className="btn btn-sm btn-butter" disabled={!!busy} onClick={() => act(`v${p.id}`, () => vote(me!, crew.dao, p.id, p.kind, true, crew.id))}><Ic name="thumb" size={15} />Approve</button>}</div>
        </div>)}
      {error && <Notice error>{error}</Notice>}
    </div>
    <Link to={`/crew/${crew.id}`} className="btn btn-mint btn-block"><Ic name="star" size={16} />Public page and follow</Link>
  </>;
}

export function JoinSheet({ st, me, hub, onClose, onDone }: { st: CrewState; me: Session; hub: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('0.05');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  return (
    <div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <form className="sheet" role="dialog" aria-modal="true" aria-label={`Chip into ${st.crew.name}`} onSubmit={async e => {
        e.preventDefault(); setBusy(true); setError(null);
        try {
          const deposit = parseNear(amount);
          if (deposit < 10n ** 22n) throw new Error('The minimum deposit is 0.01 testnet NEAR.');
          const r = await relay(me, hub, 'join', { crew_id: st.crew.id }, deposit, { crewId: st.crew.id, label: 'join' }); setHash(r.hash); onDone();
        }
        catch (x) { setError(String(x instanceof Error ? x.message : x)); } finally { setBusy(false); }
      }}>
        <div className="sheet-art"><Art name={['kumi3-pool', 'kumi-feature-vote']} alt="Hands dropping coins into a jar" eager /></div>
        <div><h3>Chip into {st.crew.name}</h3><p className="sub">You get crew shares at the live NAV, {st.pnl.pps.toFixed(4)} NEAR a share, and a vote on every trade. Leave with your exact slice when no swap is settling.</p></div>
        <label className="field"><span className="label">Amount (testnet NEAR)</span><span className="logo-select"><span className="ls-logo"><TokenLogo sym="NEAR" size={26} /></span><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></span></label>
        <Notice>New players get a small testnet NEAR gift to try this. Deposits from any chain go through 1Click on mainnet: {LIVE_SWAP_SETUP}.</Notice>
        {error && <Notice error>{error}</Notice>}
        {hash ? <><Done>Joined in <Tx hash={hash} /></Done><button type="button" className="btn btn-plum btn-lg" onClick={onClose}>Back to the chat</button></>
          : <><button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Signing and relaying…' : `Chip in ${amount} NEAR`}</button><button type="button" className="btn btn-ghost" onClick={onClose}>Not now</button></>}
      </form>
    </div>
  );
}

export function QuitSheet({ st, me, hub, shares, onClose, onDone }: { st: CrewState; me: Session; hub: string; shares: bigint; onClose: () => void; onDone: () => void }) {
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
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Ragequit">
        <div className="sheet-art"><Art name={['kumi3-leave', 'kumi-og']} alt="" eager /></div>
        <div><h3>Ragequit</h3><p className="sub">Leave {st.crew.name} with your exact slice of every asset. No vote, no permission.</p></div>
        <div className="payout">
          <div className="row-between"><span className="row"><TokenLogo sym="NEAR" size={24} />NEAR</span><b className="mono">{formatNear(preview.near, 6)}</b></div>
          {preview.tokens.map(t => <div className="row-between" key={t.symbol}><span className="row"><TokenLogo sym={t.symbol} size={24} test />t{t.symbol} <span className="faint" style={{ fontSize: 12 }}>test pool token</span></span><b className="mono">{formatUnits(t.amount, st.assets.find(a => a.symbol === t.symbol)?.decimals ?? 0, 8)}</b></div>)}
        </div>
        <div className="seg" role="group" aria-label="Payout">
          <button aria-pressed={mode === 'kind'} onClick={() => setMode('kind')}>In kind on NEAR</button>
          <button aria-pressed={mode === 'chain'} onClick={() => setMode('chain')}>To any chain</button>
        </div>
        {mode === 'chain' && <div className="stack" style={{ gap: 10 }}>
          <label className="field"><span className="label">Receive as</span>
            <span className="logo-select"><span className="ls-logo">{(() => { const t = destOptions.find(o => o.assetId === dest); return <><TokenLogo sym={t?.symbol ?? 'SOL'} size={26} /><ChainLogo chain={t?.blockchain ?? 'sol'} size={14} /></>; })()}</span>
            <select className="input" value={dest} onChange={e => setDest(e.target.value)}>
              {destOptions.length === 0 && <option value={dest}>SOL on Solana</option>}
              {destOptions.map(t => <option key={t.assetId} value={t.assetId}>{t.symbol} on {t.blockchain.toUpperCase()}</option>)}
            </select></span></label>
          {quote.loading ? <div className="skeleton" style={{ height: 52 }} /> : quote.error ? <Notice error>1Click: {quote.error}</Notice> : quote.data && (
            <Notice>Mainnet 1Click dry quote for your NEAR: <b className="mono">{Number(quote.data.quote.amountInFormatted).toPrecision(5)} → {Number(quote.data.quote.amountOutFormatted).toPrecision(5)}</b>{quote.data.quote.amountOutUsd ? ` (~$${Number(quote.data.quote.amountOutUsd).toFixed(2)})` : ''}. Live cross-chain payout: <b>{LIVE_SWAP_SETUP}</b>. On testnet you exit in kind.</Notice>
          )}
        </div>}
        {error && <Notice error>{error}</Notice>}
        {hash ? <><Done obj="door">Exited in <Tx hash={hash} /></Done><button className="btn btn-plum btn-lg" onClick={onClose}>Done</button></> : (
          <><button className="btn btn-primary btn-lg" style={{ background: 'var(--pink-ink)', boxShadow: 'none' }} disabled={busy} onClick={async () => {
            setBusy(true); setError(null);
            try {
              const r = await ragequit(me, hub, st.crew, shares, preview.tokens.map(t => ({ symbol: t.symbol, token: st.assets.find(a => a.symbol === t.symbol)!.token })));
              setHash(r.hash); onDone();
            } catch (x) { setError(String(x instanceof Error ? x.message : x)); } finally { setBusy(false); }
          }}>{busy ? 'Signing and relaying…' : 'Ragequit on testnet, in kind'}</button><button className="btn btn-ghost" onClick={onClose}>Stay in the crew</button></>
        )}
      </div>
    </div>
  );
}
