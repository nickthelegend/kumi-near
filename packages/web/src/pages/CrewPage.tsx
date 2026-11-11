import { useState } from 'react';
import { accountUrl, formatNear, formatUnits, parseNear, vaultNav, type Trade } from '@kumi/sdk';
import { HUB, readCrew, useAsync, type CrewState } from '../lib/api';
import { useSession, type Session } from '../lib/session';
import { relay, unfollow } from '../ui/actions';
import { Art, Avatar, CrewAvatar, Ic, Link, Notice, shortName, Tx } from '../ui/bits';
import { Spark } from '../ui/Fund';
import { TokenLogo } from '../ui/logos';

export function CrewPage({ crewId, onSignIn }: { crewId: number; onSignIn: () => void }) {
  const st = useAsync(() => readCrew(crewId), [crewId], 15_000);
  const me = useSession();
  if (st.error && !st.data) return <div className="page"><Notice error>{st.error}</Notice></div>;
  if (!st.data) return <div className="page"><div className="skeleton" style={{ height: 80, width: 420, maxWidth: '100%' }} /><div className="skeleton" style={{ height: 320, marginTop: 24 }} /></div>;
  const { crew, pnl, trades } = st.data;
  const done = trades.filter(t => t.status === 'executed');
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="chip chip-mint"><Ic name="star" size={13} />Public crew page · stats from on-chain receipts</span>
          <div className="row" style={{ marginTop: 10, gap: 14 }}><CrewAvatar id={crew.id} name={crew.name} size="lg" /><h1 style={{ margin: 0 }}>{crew.name}</h1></div>
          <div className="row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
            <span className="avatars">{crew.members.map(([a]) => <Avatar key={a} id={a} initial />)}</span>
            <span className="muted">{crew.members.length} members · DAO <a className="hash" href={accountUrl(crew.dao)} target="_blank" rel="noreferrer">{crew.dao}</a></span>
          </div>
        </div>
        <Link to={`/room?crew=${crew.id}`} className="btn btn-plum">Open the crew chat <Ic name="arrow" size={16} /></Link>
      </div>
      <div className="crew-grid">
        <div className="stack">
          <div className="hero-card">
            <div className="row-between"><span className="label">Return since first deposit</span><span className={`verify ${pnl.verified ? '' : 'bad'}`} title={pnl.verifyNote}><i />{pnl.verified ? 'Verified on-chain' : 'Unverified'}</span></div>
            <div className="big" style={{ fontSize: 'clamp(46px, 6vw, 68px)' }}>{pnl.returnPct >= 0 ? '+' : '−'}{Math.abs(pnl.returnPct).toFixed(2)}%</div>
            <div className="sub">{pnl.verifyNote}.</div>
            <Spark pnl={pnl} height={170} />
          </div>
          <div className="tiles" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div className="tile tone-butter"><div className="label">NAV</div><div className="v row" style={{ gap: 8 }}><TokenLogo sym="NEAR" size={24} />{pnl.navNear.toFixed(4)} <small>NEAR</small></div></div>
            <div className="tile tone-pink"><div className="label">Max drawdown</div><div className="v">{pnl.maxDrawdownPct.toFixed(2)}%</div></div>
            <div className="tile tone-coral"><div className="label">Executed trades</div><div className="v">{done.length}</div></div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Executed trades</h3><span className="chip chip-coral">{done.length} of {trades.length}</span></div>
            {done.length === 0 ? <p className="mini">No executed trades yet.</p> : <div>{done.slice(-8).reverse().map(t => <TradeRow key={t.id} t={t} st={st.data!} />)}</div>}
          </div>
        </div>
        <FollowPanel st={st.data} me={me} onSignIn={onSignIn} onDone={st.reload} />
      </div>
    </main>
  );
}

function TradeRow({ t, st }: { t: Trade; st: CrewState }) {
  const a = st.assets.find(x => x.symbol === t.asset);
  const leg = (v: string, near: boolean) => near ? `${formatNear(v, 4)} NEAR` : `${formatUnits(v, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${t.asset}`;
  return (
    <div className="trade-row"><span className="w row" style={{ gap: 8 }}><TokenLogo sym={t.asset} size={26} test /><span className={`chip ${t.side === 'buy' ? 'chip-coral' : 'chip-plum'}`}>{t.side.toUpperCase()} {t.asset} {(t.bps / 100).toFixed(0)}%</span> {leg(t.crew_in, t.side === 'buy')} → {leg(t.crew_out, t.side !== 'buy')}</span>
      <span className={`chip ${t.kind === 'captain' ? 'chip-butter' : 'chip-mint'}`}>{t.kind === 'captain' ? 'captain' : `vote #${t.dao_proposal_id}`}</span></div>
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
    setBusy(name); setError(null); setHash(null);
    try { setHash((await fn()).hash); onDone(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(null); }
  }
  return (
    <aside className="card follow-card" style={{ alignSelf: 'start' }}>
      <div className="art"><Art name={['kumi3-st-rocket', 'kumi-feature-chat']} alt="A chat bubble streaming into a rising trade card" /></div>
      <div className="in">
        <div><h3 style={{ fontSize: 22 }}>Follow {crew.name}</h3><p className="muted" style={{ margin: '6px 0 0', fontSize: 15 }}>Your deposit sits in the crew's follower vault. Every crew trade is mirrored pro rata in the same swap. Exit any time.</p></div>
        <div className="tiles">
          <div className="tile tone-mint"><div className="label">Vault NAV</div><div className="v">{formatNear(nav, 3)} <small>N</small></div></div>
          <div className="tile tone-butter"><div className="label">Followers</div><div className="v">{crew.followers.length}</div></div>
          <div className="tile tone-coral"><div className="label">Perf fee</div><div className="v">{crew.vault_fee_bps / 100}%</div></div>
          <div className="tile tone-pink"><div className="label">Fees paid</div><div className="v">{formatNear(crew.vault_fees_paid, 4)}</div></div>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>The fee is charged only on gains above the high-water mark ({(Number(BigInt(crew.vault_hwm) / 10n ** 20n) / 10_000).toFixed(4)} per share) and paid on-chain to the crew.</p>
        {crew.followers.length > 0 && <div className="row" style={{ flexWrap: 'wrap' }}>{crew.followers.map(([f]) => <span key={f} className="chip"><Avatar id={f} />{shortName(f)}</span>)}</div>}
        {!me ? <button className="btn btn-mint btn-lg" onClick={onSignIn}>Sign in to follow</button> : (
          <>
            {mine > 0n && <Notice>You hold {(Number(mine * 10_000n / supply) / 100).toFixed(2)}% of the vault, worth about {(pps * Number(mine) / 1e24).toFixed(4)} NEAR.</Notice>}
            <div className="row"><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount in NEAR" style={{ flex: 1 }} />
              <button className="btn btn-mint" disabled={!!busy} onClick={() => act('f', () => relay(me, HUB, 'follow', { crew_id: crew.id }, parseNear(amount), { crewId: crew.id, label: 'follow' }))}>{busy === 'f' ? 'Following…' : 'Follow'}</button></div>
            {mine > 0n && <button className="btn" disabled={!!busy} onClick={() => act('u', () => unfollow(me, HUB, crew, mine, st.assets))}>{busy === 'u' ? 'Exiting…' : 'Exit the vault, exact share'}</button>}
          </>
        )}
        {error && <Notice error>{error}</Notice>}
        {hash && <div className="row" style={{ fontSize: 14 }}>Done in <Tx hash={hash} /></div>}
      </div>
    </aside>
  );
}
