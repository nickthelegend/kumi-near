import { accountUrl, formatNear, formatUnits, seasonRow, type Trade } from '@kumi/sdk';
import { readCrew, useAsync, type CrewState } from '../lib/api';
import { longDay, nsToMs, signed } from '../lib/activity';
import { useSession } from '../lib/session';
import { Art, Avatars, Icon, Link, PnlBar, State } from '../ui/bits';
import { Spark } from '../ui/Fund';
import { FollowForm } from '../ui/Sheets';

/** Public crew page: verified return, executed trades and the follower vault. */
export function CrewPage({ crewId, desktop, onSignIn }: { crewId: number; desktop: boolean; onSignIn: () => void }) {
  const st = useAsync(() => readCrew(crewId), [crewId], 15_000);
  const me = useSession();
  const wrap = desktop ? 'web-page' : 'ph-page';
  if (st.error && !st.data) return <div className={wrap} style={{ paddingTop: 24 }}><State kind="error" title={`Could not read crew ${crewId}`} action={<button className="pill-light" onClick={st.reload}>Retry</button>}>{st.error}</State></div>;
  if (!st.data) return <div className={wrap} style={{ paddingTop: 24 }}><div className="skeleton" style={{ height: 90 }} /><div className="skeleton" style={{ height: 320, marginTop: 16 }} /></div>;
  const { crew, pnl, trades } = st.data;
  const done = trades.filter(t => t.status === 'executed');
  const week = seasonRow(crew, pnl).returnPct;
  return <div className={wrap}>
    <div className={desktop ? 'web-head-row' : 'ph-top'}>
      <Link to="/app" className="text-btn"><Icon name="chevL" size={16} />All crews</Link>
      <Link to={`/chat/${crew.id}`} className={desktop ? 'pill-ink' : 'pill-light pill-sm'}>Open the chat <Icon name="arrow" size={15} /></Link>
    </div>
    <div className="page-title" style={{ marginTop: 18 }}>
      <p className="lbl" style={{ marginBottom: 10 }}>Public crew page · stats from on-chain receipts</p>
      <h1 style={{ fontSize: desktop ? 44 : 34 }}>{crew.name}</h1>
      <div className="done-row" style={{ marginTop: 10 }}><Avatars ids={crew.allowed} /><span className="muted">{crew.members.length} members · DAO <a className="hash" href={accountUrl(crew.dao)} target="_blank" rel="noreferrer">{crew.dao}</a></span></div>
    </div>
    <div className="crew-grid">
      <div className="stack">
        <section className="panel">
          <div className="row-between"><span className="lbl">Return since first deposit</span>
            <span className={`tag ${pnl.verified ? 'tag-up' : 'tag-down'}`} title={pnl.verifyNote}><Icon name={pnl.verified ? 'check' : 'x'} size={13} />{pnl.verified ? 'Verified on-chain' : 'Unverified'}</span></div>
          <div className={`big-ret ${pnl.returnPct >= 0 ? 'pos' : 'neg'}`}>{signed(pnl.returnPct)}</div>
          <p className="mini">{pnl.verifyNote}. Max drawdown {pnl.maxDrawdownPct.toFixed(2)}%. NAV {pnl.navNear.toFixed(4)} NEAR.</p>
          <div className="nav-card" style={{ marginTop: 16, paddingBottom: 6 }}><PnlBar pct={week} label="This week" /><Spark pnl={pnl} height={160} /></div>
        </section>
        <section className="panel">
          <div className="panel-head"><h3>Executed trades</h3><span className="lbl">{done.length} of {trades.length}</span></div>
          {done.length === 0 ? <p className="mini">No executed trades yet.</p> : <ul className="txlist">{done.slice(-8).reverse().map(t => <TradeRow key={t.id} t={t} st={st.data!} />)}</ul>}
        </section>
      </div>
      <aside className="panel follow-card">
        <div className="follow-art"><Art name="kumi-feature-chat" alt="A chat bubble streaming into a rising trade card" /></div>
        <div className="follow-in">
          <div><h3>Follow {crew.name}</h3><p className="mini" style={{ marginTop: 6 }}>Your deposit sits in the crew's follower vault. Every crew trade is mirrored pro rata in the same swap. Exit any time.</p></div>
          <FollowForm st={st.data} me={me} onSignIn={onSignIn} onDone={st.reload} />
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>The fee is charged only on gains above the high-water mark ({(Number(BigInt(crew.vault_hwm) / 10n ** 20n) / 10_000).toFixed(4)} NEAR per share) and paid on-chain to the crew.</p>
        </div>
      </aside>
    </div>
  </div>;
}

function TradeRow({ t, st }: { t: Trade; st: CrewState }) {
  const a = st.assets.find(x => x.symbol === t.asset);
  const leg = (v: string, near: boolean) => near ? `${formatNear(v, 4)} NEAR` : `${formatUnits(v, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${t.asset}`;
  return <li><span className="what"><b className={t.side === 'buy' ? 'pos' : 'neg'}>{t.side.toUpperCase()}</b> {t.asset} {(t.bps / 100).toFixed(0)}% · {leg(t.crew_in, t.side === 'buy')} → {leg(t.crew_out, t.side !== 'buy')}</span>
    <span className="tag">{t.kind === 'captain' ? 'captain' : `vote #${t.dao_proposal_id}`} · {longDay(nsToMs(t.executed_at ?? t.created_at))}</span></li>;
}
