import { useMemo, useState } from 'react';
import { formatNear, formatUnits, memberShare, seasonRow, type Trade } from '@kumi/sdk';
import { HUB, readCrew, readHub, useAsync, type CrewState } from '../lib/api';
import { useSession, type Session } from '../lib/session';
import { Art, Avatar, Ic, Link, Notice, Sticker, navigate, shortName } from '../ui/bits';
import { JoinSheet } from '../ui/Fund';

const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
export const MASCOTS = ['owl', 'fox', 'bear', 'frog'] as const;
export const Mascot = ({ name, className }: { name: string; className?: string }) => <Art name={`kumi3-av-${name}`} alt="" className={`mascot ${className ?? ''}`} />;

/** Left icon nav card (a horizontal icon bar on phones) with the promo card. */
export function SideNav({ current, crewId }: { current: string; crewId: number | null }) {
  const items: [string, string, string][] = [['/app', 'Lobby', 'crews'], [crewId !== null ? `/room?crew=${crewId}` : '/room', 'Crew chat', 'chat'], ['/leaderboard', 'Season', 'trophy'], [crewId !== null ? `/crew/${crewId}` : '/crew/0', 'Follow', 'star'], ['/#how', 'How it works', 'book']];
  return <aside className="sidenav c3">
    <nav aria-label="Kumi">
      {items.map(([to, label, ic]) => <Link key={label} to={to} aria-current={current === to.split('?')[0] ? 'page' : undefined}><Ic name={ic} size={19} /><span>{label}</span></Link>)}
    </nav>
    <Link to="/#how" className="promo">
      <span className="promo-k">POOL. PITCH.</span>
      <b>VOTE IT IN!</b>
      <small>Friends, one jar, every trade on-chain</small>
      <Mascot name="fox" />
    </Link>
    <span className="sidenav-foot"><span className="brand-mark sm"><i /></span>KUMI 組</span>
  </aside>;
}

export function Lobby({ onSignIn }: { onSignIn: () => void }) {
  const me = useSession();
  const hub = useAsync(() => readHub(), [], 60_000);
  const crews = hub.data?.crews ?? [];
  const mineId = me ? crews.find(c => c.allowed.includes(me.accountId))?.id : undefined;
  const crewId = mineId ?? crews[0]?.id ?? null;
  const st = useAsync(() => crewId === null ? Promise.resolve(null) : readCrew(crewId), [crewId], 20_000);
  const [sheet, setSheet] = useState(false);
  const data = st.data;

  return <main className="lobby">
    <Deco />
    <header className="lobby-top">
      <p className="tagline">YOUR GROUP CHAT<br /><b>IS A FUND</b></p>
      <Link to="/" className="logo" aria-label="Kumi home"><span>Kumi</span><i>組</i></Link>
      <span className="net-pill"><i />NEAR testnet</span>
    </header>
    {hub.error && !hub.data && <Notice error>Could not read the Kumi hub {HUB} on NEAR testnet: {hub.error}</Notice>}
    <div className="lobby-grid">
      <SideNav current="/app" crewId={crewId} />
      {!data ? <><div className="c3 skeleton hero-skel" /><div className="side-skel"><div className="c3 skeleton" /><div className="c3 skeleton" /></div><div className="c3 skeleton" /></>
        : <>
          <CrewHero st={data} me={me} />
          <div className="side-cards">
            <Link to={`/room?crew=${data.crew.id}&pitch=${encodeURIComponent('/buy SOL 10%')}`} className="side-card c3 tone-card-butter">
              <span className="arrow"><Ic name="arrow" /></span>
              <span className="k">IN THE CHAT</span><b>Pitch a trade</b><small>Type a command; it becomes a vote with a live quote.</small>
              <span className="pill-mini"><span className="mono">/buy SOL 10%</span></span>
              <Mascot name="fox" className="side-mascot" />
            </Link>
            {(() => {
              const invited = !!me && data.crew.allowed.includes(me.accountId);
              const holds = !!me && memberShare(data.crew, me.accountId).shares > 0n;
              const go = () => (!me ? onSignIn() : invited && !holds ? setSheet(true) : navigate(`/crew/${data.crew.id}`));
              return <button className="side-card c3 tone-card-mint" onClick={go}>
                <span className="arrow"><Ic name="arrow" /></span>
                <span className="k">{holds ? 'ALREADY IN A CREW' : invited ? 'YOU ARE INVITED' : 'INVITE-ONLY CREWS'}</span><b>{holds ? 'Follow a crew' : invited ? 'Chip in to join' : 'Join a crew'}</b>
                <small>{holds ? 'Mirror another crew\'s trades from its vault.' : invited ? `Get shares and a vote in ${data.crew.name}.` : 'Members are invited; anyone can follow and mirror.'}</small>
                <span className="pill-mini"><Ic name="crews" size={13} />{data.crew.members.length} in · {data.crew.followers.length} following</span>
                <Mascot name="bear" className="side-mascot" />
              </button>;
            })()}
          </div>
          <PlayerCard me={me} st={data} onSignIn={onSignIn} />
          <section className="record c3" aria-label="Crew record">
            <h2 className="rule-title"><span>{data.crew.name.toUpperCase()} RECORD</span></h2>
            <div className="record-tiles">
              {([['owl', 'butter', data.pnl.navNear.toFixed(3), 'NAV · NEAR'], ['fox', 'mint', sign(data.pnl.returnPct), 'RETURN'], ['bear', 'pink', String(data.crew.trade_count), 'TRADES'], ['frog', 'lilac', String(data.crew.members.length), 'MEMBERS']] as const).map(([m, tone, v, l]) =>
                <div key={l} className={`rtile rt-${tone}`}><Mascot name={m} /><span><b>{v}</b><small>{l}</small></span></div>)}
            </div>
          </section>
        </>}
    </div>

    {data && <>
      <section className="lobby-sec">
        <div className="sec-head"><div><span className="k">ON-CHAIN · SPUTNIK DAO</span><h2>Recent calls</h2></div><Link to={`/room?crew=${data.crew.id}`} className="text-link">Open the crew chat <Ic name="external" size={15} /></Link></div>
        {data.trades.length === 0 ? <div className="empty-row c3"><Sticker name="kumi3-st-rocket" /><div><b>No calls yet</b><small>Pitch the first trade in the crew chat.</small></div><Link to={`/room?crew=${data.crew.id}`} className="b3 b3-coral b3-sm">PITCH A TRADE <Ic name="arrow" size={15} /></Link></div>
          : <div className="calls c3">{[...data.trades].reverse().slice(0, 6).map((t, i) => <CallRow key={t.id} t={t} st={data} odd={i % 2 === 1} />)}</div>}
      </section>
      <PitchBuilder st={data} me={me} onSignIn={onSignIn} />
    </>}
    {sheet && me && data && <JoinSheet st={data} me={me} hub={HUB} onClose={() => setSheet(false)} onDone={st.reload} />}
    <footer className="lobby-foot"><span><b>KUMI</b> · NEAR testnet</span><span>Hub <a className="hash" href={`https://testnet.nearblocks.io/address/${HUB}`} target="_blank" rel="noreferrer">{HUB}</a> · MIT · © 2026 Nivesh Gajengi</span></footer>
  </main>;
}

function Deco() {
  return <div className="deco" aria-hidden>
    <span className="cloud c1" /><span className="cloud c2" /><span className="cloud c3b" />
    <span className="coin k1" /><span className="coin k2" /><span className="spark s1" /><span className="spark s2" /><span className="dot d1" /><span className="dot d2" /><span className="dot d3" />
    <Sticker name="kumi3-st-rocket" className="deco-rocket" />
  </div>;
}

function CrewHero({ st, me }: { st: CrewState; me: Session | null }) {
  const { crew, pnl } = st;
  const week = seasonRow(crew, pnl).returnPct;
  const mine = !!me && crew.allowed.includes(me.accountId);
  return <section className="hero3 c3" aria-label={`${crew.name} crew`}>
    <span className="tag3">{mine ? 'YOUR CREW' : 'TOP CREW THIS SEASON'}</span>
    <span className="spark s3" aria-hidden />
    <p className="k">SPUTNIK DAO · {crew.members.length} MEMBERS · {crew.followers.length} FOLLOWING</p>
    <h1>{crew.name}</h1>
    <p className="sub3">{crew.captain ? `CAPTAIN ${shortName(crew.captain.account_id).toUpperCase()} · ` : ''}{pnl.verified ? 'P&L VERIFIED ON-CHAIN' : 'P&L UNVERIFIED'}</p>
    <Mascot name="owl" className="hero-mascot" />
    <div className="inner">
      <div className="inner-row">
        <span className="ib"><span className="ic3 ic-butter"><Ic name="jar" /></span><span><small>Crew NAV</small><b>{pnl.navNear.toFixed(4)} NEAR</b></span></span>
        <span className="ib"><span className={`ic3 ${week >= 0 ? 'ic-mint' : 'ic-pink'}`}><Ic name={week >= 0 ? 'up' : 'down'} /></span><span><small>This week</small><b className={week >= 0 ? 'up' : 'down'}>{sign(week)}</b></span></span>
      </div>
      <div className="inner-row foot">
        <span className="avatars">{crew.allowed.map(a => <Avatar key={a} id={a} initial />)}</span>
        <span className="inner-link">{crew.trade_count} trades · {pnl.points.length} receipts</span>
      </div>
    </div>
    <Link to={`/room?crew=${crew.id}`} className="b3 b3-coral b3-xl">OPEN THE CREW CHAT <Ic name="arrow" size={20} /></Link>
  </section>;
}

function PlayerCard({ me, st, onSignIn }: { me: Session | null; st: CrewState; onSignIn: () => void }) {
  const share = me ? memberShare(st.crew, me.accountId) : null;
  const stake = share && share.shares > 0n ? st.pnl.navNear * share.bps / 10_000 : null;
  const pitched = me ? st.trades.filter(t => t.proposer === me.accountId).length : 0;
  const invited = !!me && st.crew.allowed.includes(me.accountId);
  return <aside className="player c3" aria-label="Your player">
    <span className="player-av"><Mascot name={me ? MASCOTS[[...me.accountId].reduce((a, c) => a + c.charCodeAt(0), 0) % 4] : 'frog'} /></span>
    <span className="k">YOUR PLAYER</span>
    <b className="player-name">{me ? me.handle : 'Sign in to play'}</b>
    <span className="chips3">
      <span className="chip3"><Ic name="crews" size={12} />{invited ? st.crew.name : 'No crew'}</span>
      <span className="chip3"><Ic name="key" size={12} />{me ? 'Browser key' : 'No wallet needed'}</span>
    </span>
    <div className="bal3">
      <span><small>Your stake</small><b>{stake !== null ? `${stake.toFixed(4)} N` : '–'}</b></span>
      <span><small>Share</small><b>{share && share.shares > 0n ? `${(share.bps / 100).toFixed(1)}%` : '–'}</b></span>
    </div>
    <div className="boxes3">
      <span><b>{invited ? 1 : 0}</b><small>CREWS</small></span>
      <span><b>{pitched}</b><small>PITCHED</small></span>
    </div>
    {!me ? <button className="b3 b3-plum" onClick={onSignIn}>SIGN IN WITH EMAIL <Ic name="arrow" size={16} /></button>
      : <Link to={`/room?crew=${st.crew.id}`} className="b3 b3-plum">{invited ? 'GO TO MY CREW' : 'WATCH THE CHAT'} <Ic name="arrow" size={16} /></Link>}
    {me && <span className="player-id mono" title={me.accountId}>{me.accountId}</span>}
  </aside>;
}

function CallRow({ t, st, odd }: { t: Trade; st: CrewState; odd: boolean }) {
  const a = st.assets.find(x => x.symbol === t.asset);
  const leg = (v: string, near: boolean) => near ? `${formatNear(v, 4)} NEAR` : `${formatUnits(v, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${t.asset}`;
  const status = t.status === 'executed' ? ['EXECUTED', 'mint'] : t.status === 'failed' ? ['NOT FILLED', 'pink'] : [t.status.toUpperCase(), 'butter'];
  return <div className={`call ${odd ? 'odd' : ''}`}>
    <span className="mono call-n">#{t.id}</span>
    <span className={`side3 ${t.side}`}>{t.side === 'buy' ? 'BUY' : 'SELL'} {t.asset} {(t.bps / 100).toFixed(0)}%</span>
    <span className={`st3 st3-${status[1]}`}>{status[0]}</span>
    <span className="call-legs">{t.status === 'executed' ? `${leg(t.crew_in, t.side === 'buy')} → ${leg(t.crew_out, t.side !== 'buy')}` : `quoted ${leg(t.quote_in, t.side === 'buy')}`}</span>
    <span className="call-kind">{t.kind === 'captain' ? 'Captain key' : `Vote #${t.dao_proposal_id}`} · by {shortName(t.proposer)}</span>
    <Link to={`/room?crew=${st.crew.id}`} className="text-link">See in chat <Ic name="arrow" size={14} /></Link>
  </div>;
}

/** Builds a real chat command and hands it to the crew chat composer. */
function PitchBuilder({ st, me, onSignIn }: { st: CrewState; me: Session | null; onSignIn: () => void }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [asset, setAsset] = useState(st.assets[0]?.symbol ?? 'SOL');
  const [size, setSize] = useState('10');
  const [lane, setLane] = useState<'vote' | 'captain'>('vote');
  const cmd = useMemo(() => `${lane === 'captain' ? '/captain ' : '/'}${side} ${asset} ${size}%`, [lane, side, asset, size]);
  const member = !!me && st.crew.allowed.includes(me.accountId);
  const isCaptain = !!me && st.crew.captain?.account_id === me.accountId;
  return <section className="builder c3" id="pitch">
    <div className="builder-card">
      <span className="k">PITCH A TRADE</span>
      <h2>Build your call</h2>
      <p>Pick a side, an asset and how much of the jar. Kumi drops the command into {st.crew.name}'s chat, where it becomes a trade card with a live pool quote and a Sputnik vote.</p>
      <ul>
        <li>A strict majority of members executes it, once.</li>
        <li>The pool refuses a fill that slips past {st.crew.slippage_bps / 100}%.</li>
        <li>The captain lane skips the vote, capped by the contract{st.crew.captain ? ` at ${st.crew.captain.max_bps / 100}% a trade` : ''}.</li>
      </ul>
      <Art name="kumi3-vote" alt="" className="builder-art" eager />
    </div>
    <div className="builder-form">
      <div className="seg3" role="group" aria-label="Side">
        <button aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>Buy</button>
        <button aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>Sell</button>
      </div>
      <div className="fields3">
        <label><span>ASSET</span><select value={asset} onChange={e => setAsset(e.target.value)}>{st.assets.map(a => <option key={a.symbol} value={a.symbol}>{a.symbol} · test pool</option>)}</select></label>
        <label><span>SIZE OF THE {side === 'buy' ? 'NEAR' : `t${asset}`}</span><select value={size} onChange={e => setSize(e.target.value)}>{['5', '10', '20', '30', '50'].map(s => <option key={s} value={s}>{s}%</option>)}</select></label>
        <label><span>LANE</span><select value={lane} onChange={e => setLane(e.target.value as 'vote' | 'captain')}><option value="vote">Crew vote</option><option value="captain" disabled={!isCaptain}>Captain key{isCaptain ? '' : ' (captain only)'}</option></select></label>
        <label><span>CREW</span><select value={st.crew.id} disabled><option>{st.crew.name}</option></select></label>
      </div>
      <div className="cmd-preview"><span className="k">YOUR MESSAGE</span><b className="mono">{cmd}</b></div>
      {!me ? <button className="b3 b3-coral b3-xl" onClick={onSignIn}>SIGN IN TO PITCH <Ic name="arrow" size={20} /></button>
        : <Link to={`/room?crew=${st.crew.id}&pitch=${encodeURIComponent(cmd)}`} className={`b3 b3-coral b3-xl ${member ? '' : 'b3-off'}`}>{member ? 'PITCH IN THE CREW CHAT' : 'MEMBERS ONLY · WATCH THE CHAT'} <Ic name="arrow" size={20} /></Link>}
      <p className="fine">Testnet trades fill against Kumi's NEP-141 test pools. Every card also carries a real mainnet 1Click dry quote; live swaps need NEAR_MAINNET_ACCOUNT.</p>
    </div>
  </section>;
}
