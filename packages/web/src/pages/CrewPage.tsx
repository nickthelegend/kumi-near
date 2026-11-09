import { useState } from 'react';
import { accountUrl, formatNear, formatUnits, parseNear, vaultNav, type Trade } from '@kumi/sdk';
import { HUB, readCrew, useAsync, type CrewState } from '../lib/api';
import { useSession, type Session } from '../lib/session';
import { relay } from '../ui/actions';
import { Art, Avatar, Link, Notice, shortName, Tx } from '../ui/bits';
import { Spark } from '../ui/Fund';

export function CrewPage({ crewId, onSignIn }: { crewId: number; onSignIn: () => void }) {
  const st = useAsync(() => readCrew(crewId), [crewId], 15_000);
  const me = useSession();
  if (st.error) return <div className="page"><Notice error>{st.error}</Notice></div>;
  if (!st.data) return <div className="page"><div className="skeleton" style={{ height: 80, width: 420, maxWidth: '100%' }} /><div className="skeleton" style={{ height: 320, marginTop: 24 }} /></div>;
  const { crew, pnl, trades } = st.data;
  const done = trades.filter(t => t.status === 'executed');
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="label">Public crew page · season stats from receipts</span>
          <h1>{crew.name}</h1>
          <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <span className="avatars">{crew.members.map(([a]) => <Avatar key={a} id={a} />)}</span>
            <span className="muted">{crew.members.length} members · DAO <a className="hash" href={accountUrl(crew.dao)} target="_blank" rel="noreferrer">{crew.dao}</a></span>
          </div>
        </div>
        <Link to={`/app?crew=${crew.id}`} className="btn">Open the crew room</Link>
      </div>
      <div className="crew-hero">
        <div className="panel">
          <div className="row-between"><span className="label">Return since first deposit</span><span className={pnl.verified ? 'chip chip-butter' : 'chip chip-rose'} title={pnl.verifyNote}><span className="dot" />{pnl.verified ? 'Verified on-chain' : 'Unverified'}</span></div>
          <div className="big" style={{ fontSize: 48 }}><span className={pnl.returnPct >= 0 ? 'up' : 'down'}>{pnl.returnPct >= 0 ? '+' : ''}{pnl.returnPct.toFixed(2)}%</span></div>
          <div className="faint" style={{ fontSize: 14 }}>{pnl.verifyNote}. Max drawdown {pnl.maxDrawdownPct.toFixed(2)}%. NAV {pnl.navNear.toFixed(4)} NEAR.</div>
          <Spark pnl={pnl} height={180} />
          <div className="label" style={{ margin: '22px 0 6px' }}>Executed trades</div>
          {done.length === 0 ? <p className="faint">No executed trades yet.</p> : (
            <ul className="txlist">{done.slice(-8).reverse().map(t => <TradeRow key={t.id} t={t} st={st.data!} />)}</ul>
          )}
        </div>
        <FollowPanel st={st.data} me={me} onSignIn={onSignIn} onDone={st.reload} />
      </div>
    </main>
  );
}

function TradeRow({ t, st }: { t: Trade; st: CrewState }) {
  const a = st.assets.find(x => x.symbol === t.asset);
  const leg = (v: string, near: boolean) => near ? `${formatNear(v, 4)} NEAR` : `${formatUnits(v, a?.decimals ?? 0, 6)} t${t.asset}`;
  return (
    <li><span className="what"><span className={t.side === 'buy' ? 'up' : 'down'} style={{ fontWeight: 700 }}>{t.side.toUpperCase()}</span> {t.asset} {(t.bps / 100).toFixed(0)}% · {leg(t.crew_in, t.side === 'buy')} → {leg(t.crew_out, t.side !== 'buy')}</span>
      <span className="chip">{t.kind === 'captain' ? 'captain' : `vote #${t.dao_proposal_id}`}</span></li>
  );
}

function FollowPanel({ st, me, onSignIn, onDone }: { st: CrewState; me: Session | null; onSignIn: () => void; onDone: () => void }) {
  const { crew, marks } = st;
  const [amount, setAmount] = useState('0.05');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const nav = vaultNav(crew, marks);
  const supply = BigInt(crew.vault_supply);
  const mine = me ? BigInt(crew.followers.find(f => f[0] === me.accountId)?.[1] ?? '0') : 0n;
  const pps = supply > 0n ? Number(nav * 10_000n / supply) / 10_000 : 1;
  async function act(name: string, fn: () => Promise<{ hash: string }>) {
    setBusy(name); setError(null);
    try { setHash((await fn()).hash); onDone(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(null); }
  }
  return (
    <aside className="panel stack" style={{ alignSelf: 'start', overflow: 'hidden', padding: 0 }}>
      <div style={{ height: 170, overflow: 'hidden' }}><Art name="kumi-feature-chat" alt="A chat bubble streaming into a rising trade card" /></div>
      <div className="stack" style={{ padding: '0 22px 22px' }}>
        <div><h3 style={{ fontSize: 22 }}>Follow {crew.name}</h3><p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>Your deposit sits in the crew's follower vault. Every crew trade is mirrored pro rata in the same swap. Exit any time.</p></div>
        <div className="kpis">
          <div className="kpi"><div className="label">Vault NAV</div><div className="v">{formatNear(nav, 3)}</div></div>
          <div className="kpi"><div className="label">Followers</div><div className="v">{crew.followers.length}</div></div>
          <div className="kpi"><div className="label">Perf fee</div><div className="v">{crew.vault_fee_bps / 100}%</div></div>
          <div className="kpi"><div className="label">Fees paid</div><div className="v">{formatNear(crew.vault_fees_paid, 4)}</div></div>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>The fee is charged only on gains above the high-water mark ({(Number(BigInt(crew.vault_hwm) / 10n ** 20n) / 10_000).toFixed(4)} per share) and paid on-chain to the crew.</p>
        {crew.followers.length > 0 && <div className="row" style={{ flexWrap: 'wrap' }}>{crew.followers.map(([f]) => <span key={f} className="chip"><Avatar id={f} />{shortName(f)}</span>)}</div>}
        {!me ? <button className="btn btn-primary btn-lg" onClick={onSignIn}>Sign in to follow</button> : (
          <>
            {mine > 0n && <Notice>You hold {(Number(mine * 10_000n / supply) / 100).toFixed(2)}% of the vault, worth about {(pps * Number(mine) / 1e24).toFixed(4)} NEAR.</Notice>}
            <div className="row"><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount in NEAR" style={{ flex: 1 }} />
              <button className="btn btn-primary" disabled={!!busy} onClick={() => act('f', () => relay(me, HUB, 'follow', { crew_id: crew.id }, parseNear(amount), { crewId: crew.id, label: 'follow' }))}>{busy === 'f' ? 'Following…' : 'Follow'}</button></div>
            {mine > 0n && <button className="btn" disabled={!!busy} onClick={() => act('u', () => relay(me, HUB, 'unfollow', { crew_id: crew.id, shares: mine.toString() }))}>{busy === 'u' ? 'Exiting…' : 'Exit the vault, exact share'}</button>}
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        {hash && <div className="row" style={{ fontSize: 14 }}>Done in <Tx hash={hash} /></div>}
      </div>
    </aside>
  );
}
