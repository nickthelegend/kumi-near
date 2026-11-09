import { useMemo, useState } from 'react';
import { formatNear, formatUnits } from '@kumi/sdk';
import { useWorld, type CrewState, type World } from '../lib/api';
import { activity, DAY, hhmm, longDay, nsToMs, season, seasonLabel, signed, utcDay, weekStart, type Activity, type Kind } from '../lib/activity';
import { useSession, type Session } from '../lib/session';
import { Art, Avatars, Icon, Link, PnlBar, State, shortName } from '../ui/bits';
import { Head } from '../ui/Head';
import { FollowSheet, JoinSheet } from '../ui/Sheets';

const ART = ['kumi-hero', 'kumi-feature-chat', 'kumi-feature-vote'];
type Ranked = ReturnType<typeof season>[number];
type Sheet = { kind: 'join' | 'follow'; st: CrewState } | null;

export function Crews({ desktop, tab: initial, onSignIn }: { desktop: boolean; tab: 'crews' | 'season'; onSignIn: () => void }) {
  const world = useWorld();
  const me = useSession();
  const [sheet, setSheet] = useState<Sheet>(null);
  const ranked = useMemo(() => world.data ? season(world.data) : [], [world.data]);
  const invited = world.data?.crews.find(st => me && st.crew.allowed.includes(me.accountId));
  const join = (st: CrewState) => (me ? setSheet({ kind: 'join', st }) : onSignIn());
  const follow = (st: CrewState) => setSheet({ kind: 'follow', st });

  let body;
  if (world.error && !world.data) body = <State kind="error" title="Could not read the Kumi hub on NEAR testnet" action={<button className="pill-light" onClick={world.reload}>Retry</button>}>{world.error}</State>;
  else if (!world.data) body = <div className={desktop ? 'web-grid' : 'carousel'}>{[0, 1].map(i => <div key={i} className={desktop ? 'wcard skeleton' : 'ccard skeleton'} />)}</div>;
  else if (world.data.crews.length === 0) body = <State kind="empty" title="No crews on this hub yet">The first crew needs a Sputnik DAO (5.5 testnet NEAR of code storage). Run <code>pnpm run:testnet</code> to create one.</State>;
  else if (desktop) body = <Web world={world.data} ranked={ranked} me={me} initial={initial} onJoin={join} onFollow={follow} />;
  else body = initial === 'season' ? <PhoneSeason ranked={ranked} me={me} onJoin={join} onFollow={follow} /> : <Phone world={world.data} ranked={ranked} />;

  return <div className={desktop ? 'web-page' : 'ph-page'}>
    <Head world={world.data} desktop={desktop} onSignIn={onSignIn} onDeposit={invited ? () => join(invited) : undefined} onRefresh={world.reload} refreshing={world.loading} />
    {body}
    {world.error && world.data && <p className="stale" role="status">Showing the last read. Refresh failed: {world.error}</p>}
    {sheet?.kind === 'join' && me && <JoinSheet st={sheet.st} me={me} onClose={() => setSheet(null)} onDone={world.reload} />}
    {sheet?.kind === 'follow' && <FollowSheet st={sheet.st} me={me} onSignIn={onSignIn} onClose={() => setSheet(null)} onDone={world.reload} />}
  </div>;
}

/* ---------------- phone ---------------- */

function CrewCard({ r, rank, index }: { r: Ranked; rank: number; index: number }) {
  const { crew, pnl } = r.st;
  return <article className="ccard">
    <div className="ccard-notch"><span className="chip-notch"><Icon name="trophy" size={14} />#{rank} this season</span></div>
    <span className="chip-src"><span className="crew-dot">{crew.name.slice(0, 1)}</span>Sputnik DAO</span>
    <h3>{crew.name}</h3>
    <p className="ccard-when">{crew.members.length} in · {crew.followers.length} following{crew.captain ? ` · captain ${shortName(crew.captain.account_id)}` : ''}</p>
    <div className="ccard-art" aria-hidden="true"><Art name={ART[index % ART.length]} alt="" eager={index === 0} /></div>
    <div className="ccard-body">
      <div className="ccard-stats"><span className="ccard-nav">{pnl.navNear.toFixed(4)}<small>NEAR NAV</small></span><span><b className={pnl.returnPct >= 0 ? 'pos' : 'neg'}>{signed(pnl.returnPct)}</b> all time</span></div>
      <PnlBar pct={r.returnPct} label="This week" />
      <div className="ccard-foot"><Avatars ids={crew.allowed} /><Link to={`/chat/${crew.id}`} className="pill-ink">Open chat <Icon name="arrow" size={15} /></Link></div>
    </div>
  </article>;
}

function SeasonCard({ ranked }: { ranked: Ranked[] }) {
  const { week, range } = seasonLabel();
  return <article className="ccard ccard-season">
    <div className="ccard-notch"><span className="chip-notch"><Icon name="clock" size={14} />{range}</span></div>
    <span className="chip-src"><span className="crew-dot" style={{ background: 'var(--butter)' }}><Icon name="trophy" size={12} /></span>Season {week}</span>
    <h3>The crew season</h3>
    <p className="ccard-when">Return minus half the drawdown, from receipts</p>
    <div className="ccard-art" aria-hidden="true"><Art name="kumi-og" alt="" /></div>
    <div className="ccard-body">
      <ol className="season-list">{ranked.slice(0, 3).map((r, i) => <li key={r.crewId}><span className="rank">{String(i + 1).padStart(2, '0')}</span><b>{r.name}</b><span className={`mono ${r.score >= 0 ? 'pos' : 'neg'}`}>{r.score.toFixed(2)}</span></li>)}</ol>
      <div className="ccard-foot"><span className="ccard-when">{ranked.length} {ranked.length === 1 ? 'crew' : 'crews'} ranked</span><Link to="/leaderboard" className="pill-ink">See the board <Icon name="arrow" size={15} /></Link></div>
    </div>
  </article>;
}

const FILTERS: { k: 'all' | Kind; label: string }[] = [{ k: 'all', label: 'All' }, { k: 'trade', label: 'Trades' }, { k: 'member', label: 'Members' }, { k: 'follow', label: 'Followers' }];

function Week({ items, start, setStart, day, setDay, now }: { items: Activity[]; start: number; setStart: (n: number) => void; day: number | null; setDay: (d: number) => void; now: number }) {
  const today = utcDay(now);
  const days = Array.from({ length: 7 }, (_, i) => start + i * DAY);
  return <section className="week" aria-label="Crew activity this week">
    <header className="week-head">
      <h2>{start === weekStart(now) ? 'This week' : `Week of ${new Date(start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`}</h2>
      <div className="week-nav">
        <button className="text-btn" onClick={() => { setStart(weekStart(now)); setDay(today); }}>Today</button>
        <button className="icon-round" onClick={() => setStart(start - 7 * DAY)} aria-label="Previous week"><Icon name="chevL" size={16} /></button>
        <button className="icon-round" onClick={() => setStart(start + 7 * DAY)} aria-label="Next week"><Icon name="chevR" size={16} /></button>
      </div>
    </header>
    <div className="days">
      {days.map(d => {
        const n = items.filter(a => utcDay(a.at) === d).length;
        const dt = new Date(d);
        return <button key={d} className={`day ${day === d ? 'on' : ''} ${d > today ? 'future' : ''}`} onClick={() => setDay(d)} aria-pressed={day === d} aria-label={`${longDay(d)}: ${n} events`}>
          <span className="day-name">{dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()}</span>
          <b>{dt.getUTCDate()}</b>
          <span className={`day-n ${n ? 'has' : ''}`}>{n || '–'}</span>
        </button>;
      })}
    </div>
  </section>;
}

function ActivityList({ world }: { world: World }) {
  const items = useMemo(() => activity(world), [world]);
  const now = world.readAt;
  const latest = items[0]?.at ?? now;
  const [start, setStart] = useState(() => weekStart(latest));
  const [day, setDay] = useState<number | null>(() => utcDay(latest));
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const list = items.filter(a => (day === null || utcDay(a.at) === day) && (filter === 'all' || a.kind === filter));
  return <>
    <Week items={items} start={start} setStart={setStart} day={day} setDay={setDay} now={now} />
    <div className="list-head">
      <p><b>{day === null ? 'All days' : utcDay(now) === day ? 'Today' : longDay(day)}</b> <span>{list.length} {list.length === 1 ? 'event' : 'events'}</span></p>
      <span className="lbl">From on-chain receipts · UTC</span>
    </div>
    <div className="chips" role="tablist" aria-label="Filter activity">
      {FILTERS.map(f => <button key={f.k} role="tab" aria-selected={filter === f.k} className={`chip ${filter === f.k ? 'on' : ''}`} onClick={() => setFilter(f.k)}>{f.label}</button>)}
    </div>
    {list.length ? <ul className="rows">{list.map(a => <li key={a.key} className="row">
      <span className="row-time">{hhmm(a.at)}</span>
      <Link to={`/chat/${a.crewId}`} className="row-main"><b>{a.title}</b><span>{a.sub}</span></Link>
      {a.vote ? <Link to={`/chat/${a.crewId}`} className="pill-coral">Vote <Icon name="arrow" size={14} /></Link>
        : <span className={`row-kind kind-${a.kind === 'member' ? 'join' : a.kind}`}>{a.kind === 'member' ? 'crew' : a.kind}</span>}
    </li>)}</ul>
      : <State kind="empty" title={day !== null ? `Nothing on ${longDay(day)}` : 'Nothing here yet'} action={items[0] ? <button className="pill-light" onClick={() => { setStart(weekStart(items[0].at)); setDay(utcDay(items[0].at)); setFilter('all'); }}>Jump to {longDay(utcDay(items[0].at))}</button> : undefined}>Every join, trade, follow and ragequit lands here as soon as the hub writes its receipt.</State>}
  </>;
}

function Phone({ world, ranked }: { world: World; ranked: Ranked[] }) {
  return <>
    <section className="carousel" aria-label="Crews">
      {ranked.map((r, i) => <CrewCard key={r.crewId} r={r} rank={i + 1} index={i} />)}
      <SeasonCard ranked={ranked} />
    </section>
    <ActivityList world={world} />
  </>;
}

function PhoneSeason({ ranked, me, onJoin, onFollow }: { ranked: Ranked[]; me: Session | null; onJoin: (st: CrewState) => void; onFollow: (st: CrewState) => void }) {
  const { week, range } = seasonLabel();
  return <>
    <div className="page-title"><p className="lbl" style={{ marginBottom: 8 }}>Season {week} · {range} UTC</p><h1>The crew season</h1><p>Ranked by return minus half the max drawdown, both recomputed from each crew's on-chain receipts.</p></div>
    <div className="stack">{ranked.map((r, i) => <RankCard key={r.crewId} r={r} rank={i + 1} me={me} onJoin={onJoin} onFollow={onFollow} />)}</div>
    <Rules />
  </>;
}

/* ---------------- shared white cards ---------------- */

function JoinFollow({ st, me, onJoin, onFollow }: { st: CrewState; me: Session | null; onJoin: (st: CrewState) => void; onFollow: (st: CrewState) => void }) {
  const isMember = !!me && st.crew.allowed.includes(me.accountId);
  const closed = !!me && !isMember;
  return <div className="pastels">
    <button className="pastel pastel-butter" disabled={closed} title={closed ? 'Only invited members can join; anyone can follow' : undefined} onClick={() => onJoin(st)}><Icon name="jar" size={16} />{closed ? 'Invite only' : isMember ? 'Add funds' : 'Join'}</button>
    <button className="pastel pastel-coral" onClick={() => onFollow(st)}><Icon name="star" size={16} />Follow</button>
  </div>;
}

function RankCard({ r, rank, me, onJoin, onFollow }: { r: Ranked; rank: number; me: Session | null; onJoin: (st: CrewState) => void; onFollow: (st: CrewState) => void }) {
  return <article className="wcard">
    <header className="wcard-top">
      <span className="rank">{String(rank).padStart(2, '0')}</span>
      <div className="wcard-src"><p><b><Link to={`/crew/${r.crewId}`}>{r.name}</Link></b><span>{r.members} {r.members === 1 ? 'member' : 'members'} · {r.followers} following · {r.trades} {r.trades === 1 ? 'trade' : 'trades'}</span></p></div>
      <span className={`tag ${r.verified ? 'tag-up' : 'tag-down'}`} title={r.st.pnl.verifyNote}><Icon name={r.verified ? 'check' : 'x'} size={13} />{r.verified ? 'Verified' : 'Unverified'}</span>
    </header>
    <div className="wcard-num"><span className={r.returnPct >= 0 ? 'pos' : 'neg'}>{signed(r.returnPct)}</span><small>season return</small></div>
    <p className="wcard-sum">Max drawdown <b>{r.maxDrawdownPct.toFixed(2)}%</b> · score <b>{r.score.toFixed(2)}</b> · NAV <b>{r.navNear.toFixed(4)} NEAR</b></p>
    <PnlBar pct={r.returnPct} label="This week" />
    <JoinFollow st={r.st} me={me} onJoin={onJoin} onFollow={onFollow} />
  </article>;
}

/** Time left in this week's season (seasons end Monday 00:00 UTC). */
function SeasonClock({ now }: { now: number }) {
  const { week, range } = seasonLabel();
  const left = Math.max(0, weekStart(now) + 7 * DAY - now);
  const d = Math.floor(left / DAY), h = Math.floor((left % DAY) / 3_600_000);
  return <article className="wcard">
    <header className="wcard-top"><div className="wcard-src"><p><b>Season {week}</b><span>{range} UTC</span></p></div><span className="tag tag-lilac"><Icon name="clock" size={13} />{d}d {h}h left</span></header>
    <div className="wcard-art" aria-hidden="true"><Art name="kumi-og" alt="" /></div>
    <p className="wcard-sum" style={{ margin: '12px 0 0' }}>The board resets Monday 00:00 UTC. Any crew can start climbing the moment it trades.</p>
  </article>;
}

function Rules() {
  return <div className="web-grid" style={{ marginTop: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
    {[['Window', 'Monday to Sunday, UTC', 'Season return compares price per share now with the last receipt before Monday 00:00 UTC.'],
      ['Score', 'Return − ½ × max drawdown', 'A crew that got lucky on one wild swing ranks below one that climbed steadily.'],
      ['Proof', 'Recomputed, not reported', '"Verified" means the latest receipt equals the crew\'s live on-chain state.']].map(([k, h, p]) =>
      <article className="wcard" key={k}><p className="lbl">{k}</p><h3 style={{ marginTop: 8, fontSize: 17 }}>{h}</h3><p className="wcard-sum" style={{ margin: 0 }}>{p}</p></article>)}
  </div>;
}

/* ---------------- desktop ---------------- */

export function CrewWCard({ r, me, onJoin, onFollow }: { r: Ranked; me: Session | null; onJoin: (st: CrewState) => void; onFollow: (st: CrewState) => void }) {
  const { crew, pnl, assets } = r.st;
  const held = assets.filter(a => BigInt(crew.tokens.find(t => t[0] === a.symbol)?.[1] ?? '0') > 0n).map(a => `t${a.symbol}`);
  return <article className="wcard">
    <header className="wcard-top">
      <Avatars ids={crew.allowed} max={3} />
      <div className="wcard-src"><p><b>Sputnik DAO</b><span>{crew.members.length} in · {crew.followers.length} following</span></p><small>{crew.trade_count} trades · {crew.receipt_count} receipts</small></div>
      <span className={`tag ${r.returnPct >= 0 ? 'tag-up' : 'tag-down'}`}><Icon name={r.returnPct >= 0 ? 'arrowUp' : 'arrowDown'} size={13} />{signed(r.returnPct)} wk</span>
    </header>
    <h3><Link to={`/chat/${crew.id}`}>{crew.name}</Link></h3>
    <div className="wcard-num" style={{ marginTop: 2 }}>{pnl.navNear.toFixed(4)}<small>NEAR NAV</small></div>
    <p className="wcard-sum">All time <b className={pnl.returnPct >= 0 ? 'pos' : 'neg'}>{signed(pnl.returnPct)}</b>, max drawdown {pnl.maxDrawdownPct.toFixed(2)}%. Holds NEAR{held.length ? `, ${held.join(', ')}` : ''}.{crew.captain ? ` Captain ${shortName(crew.captain.account_id)} may trade up to ${crew.captain.max_bps / 100}% at once.` : ''}</p>
    <PnlBar pct={r.returnPct} label="This week" />
    <Link to={`/chat/${crew.id}`} className="tok"><i className="tok-dot" />{crew.dao}</Link>
    <JoinFollow st={r.st} me={me} onJoin={onJoin} onFollow={onFollow} />
  </article>;
}

function SeasonWCard({ ranked, onOpen }: { ranked: Ranked[]; onOpen: () => void }) {
  const { week, range } = seasonLabel();
  return <article className="wcard">
    <header className="wcard-top">
      <span className="avs"><span className="avatar" style={{ background: 'var(--butter)' }}><Icon name="trophy" size={14} /></span></span>
      <div className="wcard-src"><p><b>Season {week}</b><span>{range} UTC</span></p><small>Return − ½ × max drawdown, from receipts</small></div>
      <span className="tag tag-lilac">{ranked.length} ranked</span>
    </header>
    <h3>The crew season</h3>
    <ol className="season-list">{ranked.slice(0, 4).map((r, i) => <li key={r.crewId}><span className="rank">{String(i + 1).padStart(2, '0')}</span><b>{r.name}</b><span className={`mono ${r.returnPct >= 0 ? 'pos' : 'neg'}`}>{signed(r.returnPct)}</span></li>)}</ol>
    {ranked.length < 4 && <div className="wcard-art" aria-hidden="true"><Art name="kumi-og" alt="" /></div>}
    <div className="pastels" style={{ gridTemplateColumns: '1fr' }}><button className="pastel pastel-lilac" onClick={onOpen}>Open the board <Icon name="arrow" size={15} /></button></div>
  </article>;
}

export function TradeWCard({ st, id }: { st: CrewState; id: number }) {
  const t = st.trades.find(x => x.id === id)!;
  const a = st.assets.find(x => x.symbol === t.asset);
  const tok = (v: string) => `${formatUnits(v, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${t.asset}`;
  const leg = (v: string, near: boolean) => (near ? `${formatNear(v, 4)} NEAR` : tok(v));
  const done = t.status === 'executed';
  const tag = done ? ['tag-up', 'Executed'] : t.status === 'failed' ? ['tag-down', 'Not filled'] : ['tag-coral', t.status === 'voting' ? 'Voting' : t.status];
  return <article className="wcard">
    <header className="wcard-top">
      <Avatars ids={[t.proposer]} />
      <div className="wcard-src"><p><b>{st.crew.name}</b><span>pitched by {shortName(t.proposer)}</span></p><small>{t.kind === 'captain' ? 'Captain lane, no vote' : `Crew vote · Sputnik #${t.dao_proposal_id}`} · {longDay(nsToMs(t.created_at))}</small></div>
      <span className={`tag ${tag[0]}`}>{tag[1]}</span>
    </header>
    <h3><Link to={`/chat/${st.crew.id}`}>{t.side === 'buy' ? 'Buy' : 'Sell'} {t.asset} · {(t.bps / 100).toLocaleString()}%</Link></h3>
    <p className="wcard-sum">{done ? <>Crew paid <b>{leg(t.crew_in, t.side === 'buy')}</b> and got <b>{leg(t.crew_out, t.side !== 'buy')}</b>.{BigInt(t.vault_in) > 0n && <> Followers mirrored {leg(t.vault_in, t.side === 'buy')} in the same swap.</>}</>
      : t.status === 'failed' ? <>The vote passed but the pool moved past {st.crew.slippage_bps / 100}% slippage, so the fill was refused and every holding was restored.</>
      : <>Quoted <b>{leg(t.quote_in, t.side === 'buy')}</b> for <b>{leg(t.quote_out, t.side !== 'buy')}</b>. Waiting for a strict majority.</>}</p>
    <span className="tok"><i className="tok-dot" />quote {t.quote_hash.slice(0, 10)}</span>
    <div className="pastels" style={{ gridTemplateColumns: '1fr' }}><Link to={`/chat/${st.crew.id}`} className={`pastel ${t.status === 'voting' ? 'pastel-coral' : 'pastel-lilac'}`}>{t.status === 'voting' ? 'Vote in the chat' : 'See it in the chat'} <Icon name="arrow" size={15} /></Link></div>
  </article>;
}

function Web({ world, ranked, me, initial, onJoin, onFollow }: { world: World; ranked: Ranked[]; me: Session | null; initial: 'crews' | 'season'; onJoin: (st: CrewState) => void; onFollow: (st: CrewState) => void }) {
  const [tab, setTab] = useState<'crews' | 'season' | 'activity'>(initial);
  const trades = world.crews.flatMap(st => st.trades.map(t => ({ st, t }))).sort((a, b) => Number(BigInt(b.t.created_at) - BigInt(a.t.created_at))).slice(0, 4);
  const weekCount = activity(world).filter(a => a.at >= weekStart(world.readAt)).length;
  const go = (t: typeof tab) => { setTab(t); history.replaceState(null, '', t === 'season' ? '/leaderboard' : '/app'); };
  return <>
    <div className="web-tabs" role="tablist" aria-label="Crews">
      {([['crews', 'Crews', world.crews.length], ['season', 'Season', ranked.length], ['activity', 'Activity', weekCount]] as const).map(([k, l, n]) =>
        <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => go(k)}>{l} <small>{n}</small></button>)}
      <span className="web-next"><i className="live-dot" />Read live from NEAR testnet · {new Date(world.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
    </div>
    {tab === 'crews' && <>
      <div className="web-grid">{ranked.map(r => <CrewWCard key={r.crewId} r={r} me={me} onJoin={onJoin} onFollow={onFollow} />)}<SeasonWCard ranked={ranked} onOpen={() => go('season')} /></div>
      {trades.length > 0 && <section className="web-sec"><header className="web-sec-head"><h2>Recent calls</h2><span className="lbl">Trades filed from the chat</span></header>
        <div className="web-grid">{trades.map(({ st, t }) => <TradeWCard key={`${st.crew.id}:${t.id}`} st={st} id={t.id} />)}</div></section>}
    </>}
    {tab === 'season' && <><div className="web-grid">{ranked.map((r, i) => <RankCard key={r.crewId} r={r} rank={i + 1} me={me} onJoin={onJoin} onFollow={onFollow} />)}{ranked.length % 2 === 1 && <SeasonClock now={world.readAt} />}</div><Rules /></>}
    {tab === 'activity' && <ActivityList world={world} />}
  </>;
}
