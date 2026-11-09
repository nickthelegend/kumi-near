import { useState } from 'react';
import { accountUrl, formatNear, formatUnits, getProposals, held, memberShare, view, type Pnl } from '@kumi/sdk';
import { HUB, useAsync, type CrewState } from '../lib/api';
import { signed } from '../lib/activity';
import { makeCaptainKey, type Session } from '../lib/session';
import { relay, vote } from './actions';
import { Avatar, Icon, Link, Notice, PnlBar, shortName } from './bits';
import { JoinSheet, QuitSheet } from './Sheets';

export function Spark({ pnl, height }: { pnl: Pnl; height?: number }) {
  const pts = pnl.points;
  if (pts.length < 2) return <p className="faint" style={{ fontSize: 13, margin: '8px 0 10px' }}>The chart starts after the first trade.</p>;
  const ys = pts.map(p => p.pps);
  const min = Math.min(...ys, 1) * 0.995, max = Math.max(...ys, 1) * 1.005;
  const x = (i: number) => (i / (pts.length - 1)) * 300;
  const y = (v: number) => 90 - ((v - min) / (max - min || 1)) * 80;
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.pps).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" style={height ? { height } : undefined} viewBox="0 0 300 96" preserveAspectRatio="none" role="img" aria-label={`Price per share over ${pts.length} receipts`}>
      <defs><linearGradient id="kumi-spark" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f2b23e" stopOpacity=".45" /><stop offset="1" stopColor="#f2b23e" stopOpacity="0" /></linearGradient></defs>
      <line x1="0" x2="300" y1={y(1)} y2={y(1)} stroke="rgba(43,22,48,.25)" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      <path d={`${line} L300,96 L0,96 Z`} fill="url(#kumi-spark)" />
      <path d={line} fill="none" stroke="#f0603f" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** NAV card, position and holdings for one crew. */
export function FundPane({ st, me, weekPct, onChanged }: { st: CrewState; me: Session | null; weekPct: number | null; onChanged: () => void }) {
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
    ...assets.map(a => { const amt = held(crew.tokens, a.symbol); return { sym: a.symbol, amount: amt, v: value(a.symbol, amt), sub: `Test pool · mainnet ${a.symbol} via 1Click` }; })];
  return <>
    <div className="nav-card">
      <div className="row-between"><span className="lbl">Treasury NAV</span>
        <span className={`tag ${pnl.verified ? 'tag-up' : 'tag-down'}`} title={pnl.verifyNote}><Icon name={pnl.verified ? 'check' : 'x'} size={13} />{pnl.verified ? 'Verified on-chain' : 'Unverified'}</span></div>
      <div className="big">{pnl.navNear.toFixed(4)} <small>NEAR</small></div>
      <div className="sub"><b className={pnl.returnPct >= 0 ? 'pos' : 'neg'}>{signed(pnl.returnPct)}</b> since the first deposit · {pnl.pps.toFixed(4)} NEAR a share</div>
      <div style={{ marginTop: 14 }}><PnlBar pct={weekPct} label="This week" /></div>
      <Spark pnl={pnl} />
    </div>
    <div className="kpis">
      <div className="kpi"><div className="lbl">Max drawdown</div><div className="v neg">{pnl.maxDrawdownPct.toFixed(2)}%</div></div>
      <div className="kpi"><div className="lbl">Deposited</div><div className="v">{formatNear(crew.deposited, 3)}</div></div>
    </div>
    <div className="panel">
      <div className="panel-head"><h3>Your position</h3>{mine && mine.shares > 0n && <span className="tag tag-coral">{(mine.bps / 100).toFixed(2)}%</span>}</div>
      {!me ? <p className="mini">Sign in to see your share and vote.</p>
        : mine && mine.shares > 0n ? <div className="stack" style={{ gap: 12 }}>
          <div className="row-between"><span className="muted">Worth now</span><b className="mono">{(pnl.navNear * mine.bps / 10_000).toFixed(4)} NEAR</b></div>
          <div className="pastels"><button className="pastel pastel-butter" onClick={() => setSheet('join')}><Icon name="plus" size={15} />Add funds</button><button className="pastel pastel-coral" onClick={() => setSheet('quit')}><Icon name="exit" size={15} />Ragequit</button></div>
        </div>
        : invited ? <div className="stack" style={{ gap: 10 }}><p className="mini">You're invited. Chip in to get shares and a vote.</p><button className="pastel pastel-butter" onClick={() => setSheet('join')}><Icon name="jar" size={15} />Join the crew</button></div>
        : <p className="mini">You're not a member of this crew. Anyone can <Link to={`/crew/${crew.id}`}>follow it</Link>.</p>}
    </div>
    <div className="panel">
      <div className="panel-head"><h3>Holdings</h3><span className="faint mono" style={{ fontSize: 10.5 }}>marks: test pools, on-chain</span></div>
      {rows.map(r => <div className="holding" key={r.sym}>
        <span className={`asset-coin coin-${r.sym}`} style={{ width: 32, height: 32, fontSize: 9 }}>{r.sym}</span>
        <div style={{ minWidth: 0 }}><div className="n">{r.sym === 'NEAR' ? 'NEAR' : `t${r.sym}`}</div><div className="sub">{r.sub}</div>
          <div className="hbar"><i style={{ width: `${navY > 0n ? Number(r.v * 1000n / navY) / 10 : 0}%` }} /></div></div>
        <div className="amt">{r.sym === 'NEAR' ? formatNear(r.amount, 4) : formatUnits(r.amount, assets.find(a => a.symbol === r.sym)?.decimals ?? 0, 6)}<div>{formatNear(r.v, 4)} N</div></div>
      </div>)}
    </div>
    {sheet === 'join' && me && <JoinSheet st={st} me={me} onClose={() => setSheet(null)} onDone={onChanged} />}
    {sheet === 'quit' && me && mine && <QuitSheet st={st} me={me} shares={mine.shares} onClose={() => setSheet(null)} onDone={onChanged} />}
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
    <div className="panel">
      <div className="panel-head"><h3>Members</h3><span className="lbl">strict majority</span></div>
      {crew.allowed.map(a => {
        const s = memberShare(crew, a);
        return <div className="member" key={a}><Avatar id={a} /><div style={{ minWidth: 0 }}><div className="n">{shortName(a)}{crew.captain?.account_id === a && <span className="tag tag-up" style={{ height: 22 }}>captain</span>}</div><div className="sub">{s.shares > 0n ? `${(s.bps / 100).toFixed(1)}% of shares` : 'invited, no deposit'}</div></div></div>;
      })}
      <p className="mini" style={{ marginTop: 8 }}>DAO <a className="hash" href={accountUrl(crew.dao)} target="_blank" rel="noreferrer">{crew.dao}</a> · {crew.slippage_bps / 100}% max slippage</p>
    </div>
    <div className="panel">
      <div className="panel-head"><h3>Captain lane</h3><Icon name="key" size={16} /></div>
      {crew.captain ? <p className="mini"><b>{shortName(crew.captain.account_id)}</b> can trade up to {crew.captain.max_bps / 100}% at once, {crew.captain.max_daily} a day, in {crew.captain.assets.join(', ')}. {crew.captain_trades_today} used today. The key can call only <code>captain_trade</code>.</p>
        : <p className="mini">No captain. A vote can give one member a key for small instant trades.</p>}
      {isMember && !isCaptain && <button className="pastel pastel-lilac" style={{ marginTop: 12, width: '100%' }} disabled={!!busy} onClick={() => act('cap', proposeMe)}>{busy === 'cap' ? 'Filing…' : 'Propose me as captain'}</button>}
    </div>
    <div className="panel">
      <div className="panel-head"><h3>Open DAO votes</h3></div>
      {open.loading && !open.data ? <div className="skeleton" style={{ height: 60, borderRadius: 14 }} /> : (open.data ?? []).length === 0 ? <p className="mini">None open. Trade votes live in the chat.</p> :
        open.data!.map(p => <div key={p.id} style={{ padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <p className="mini" style={{ color: 'var(--ink)' }}>{p.description}</p>
          <div className="row-between" style={{ marginTop: 8 }}><span className="faint mono" style={{ fontSize: 11 }}>#{p.id} · {Object.keys(p.votes).length} voted</span>
            {isMember && !p.votes[me!.accountId] && <button className="pastel pastel-coral" disabled={!!busy} onClick={() => act(`v${p.id}`, () => vote(me!, crew.dao, p.id, p.kind, true, crew.id))}><Icon name="thumb" size={15} />Approve</button>}</div>
        </div>)}
      {error && <Notice error>{error}</Notice>}
    </div>
    <Link to={`/crew/${crew.id}`} className="pill-ghost">Public page and follow <Icon name="arrow" size={15} /></Link>
  </>;
}
