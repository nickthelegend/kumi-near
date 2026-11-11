import { useMemo, useState } from 'react';
import { formatNear, formatUnits, memberShare, seasonRow, tally, type Proposal, type Receipt, type Trade } from '@kumi/sdk';
import { api, HUB, readCrew, readHub, readProposals, useAsync, type ChatMessage, type CrewState } from '../lib/api';
import { useSession, type Session } from '../lib/session';
import { Avatar, CrewAvatar, EmptyArt, Ic, Link, Notice, Tx, mascotOf, navigate, shortName } from '../ui/bits';
import { JoinSheet } from '../ui/Fund';
import { DaoGlyph, NearMark, TokenLogo } from '../ui/logos';

const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;

export function Lobby({ onSignIn }: { onSignIn: () => void }) {
  const me = useSession();
  const hub = useAsync(() => readHub(), [], 60_000);
  const crews = hub.data?.crews ?? [];
  const crewId = (me ? crews.find(c => c.allowed.includes(me.accountId))?.id : undefined) ?? crews[0]?.id ?? null;
  const st = useAsync(() => crewId === null ? Promise.resolve(null) : readCrew(crewId), [crewId], 20_000);
  const chat = useAsync(() => crewId === null ? Promise.resolve([] as ChatMessage[]) : api<ChatMessage[]>(`/api/messages?crew=${crewId}`), [crewId], 15_000);
  const [sheet, setSheet] = useState(false);
  const data = st.data;
  const week = data ? seasonRow(data.crew, data.pnl).returnPct : null;

  return <main className="lobby2">
    <section className="greet">
      <div>
        <p className="greet-k">{me ? `Hey ${me.handle}` : 'Welcome to Kumi'} · NEAR testnet</p>
        <h1>{data ? <>{data.crew.name} is <span className={week! >= 0 ? 'up' : 'down'}>{sign(week!)}</span> this week</> : 'Your group chat is a fund'}</h1>
      </div>
      <div className="greet-marks">
        <span className="mark-chip"><NearMark size={16} />NEAR testnet</span>
        <span className="mark-chip"><DaoGlyph size={15} />Sputnik DAO v2</span>
      </div>
    </section>
    {hub.error && !hub.data && <Notice error>Could not read the Kumi hub {HUB} on NEAR testnet: {hub.error}</Notice>}
    {st.error && !data && <Notice error>Could not read the crew: {st.error}</Notice>}
    {hub.data && crews.length === 0 ? <div className="c3"><EmptyArt art={['kumi3-empty', 'kumi-og']} title="No crews on this hub yet">The first crew needs a Sputnik DAO. See the README for the testnet setup.</EmptyArt></div>
      : !data ? !hub.error && !st.error && <div className="l2-grid"><div className="c3 skeleton" style={{ minHeight: 520 }} /><div className="stack"><div className="c3 skeleton" style={{ minHeight: 160 }} /><div className="c3 skeleton" style={{ minHeight: 200 }} /></div></div> : <>
      <div className="l2-grid">
        <ThreadHero st={data} messages={chat.data} chatError={chat.error} me={me} />
        <div className="l2-side">
          <PlayerCard me={me} st={data} onSignIn={onSignIn} />
          <CrewCard st={data} />
          <div className="duo">
            <Link to={`/room?crew=${data.crew.id}&pitch=${encodeURIComponent('/buy SOL 10%')}`} className="duo-card c3 duo-butter">
              <span className="row" style={{ gap: 6 }}><TokenLogo sym="SOL" size={26} test /><span className="duo-cmd mono">/buy SOL 10%</span></span>
              <b>Pitch a trade</b><small>It becomes a vote with a live quote.</small>
            </Link>
            {(() => {
              const invited = !!me && data.crew.allowed.includes(me.accountId);
              const holds = !!me && memberShare(data.crew, me.accountId).shares > 0n;
              const go = () => (!me ? onSignIn() : invited && !holds ? setSheet(true) : navigate(`/crew/${data.crew.id}`));
              return <button className="duo-card c3 duo-mint" onClick={go}>
                <span className="row" style={{ gap: 6 }}><TokenLogo sym="NEAR" size={26} /><span className="duo-cmd">{data.crew.followers.length} following</span></span>
                <b>{holds ? 'Follow a crew' : invited ? 'Chip in to join' : 'Join a crew'}</b><small>{holds ? 'Mirror its trades from the vault.' : invited ? `Shares and a vote in ${data.crew.name}.` : 'Invite-only; anyone can follow.'}</small>
              </button>;
            })()}
          </div>
        </div>
      </div>
      <Receipts st={data} />
      <div className="l2-bottom">
        <PitchBuilder st={data} me={me} onSignIn={onSignIn} />
        <section className="c3 calls2">
          <div className="sec-head"><div><span className="k">ON-CHAIN · SPUTNIK DAO</span><h2>Recent calls</h2></div><Link to={`/room?crew=${data.crew.id}`} className="text-link">Open the chat <Ic name="arrow" size={15} /></Link></div>
          {data.trades.length === 0 ? <p className="mini">No calls yet. Pitch the first trade in the crew chat.</p>
            : <div className="calls">{[...data.trades].reverse().slice(0, 5).map((t, i) => <CallRow key={t.id} t={t} st={data} odd={i % 2 === 1} />)}</div>}
        </section>
      </div>
    </>}
    {sheet && me && data && <JoinSheet st={data} me={me} hub={HUB} onClose={() => setSheet(false)} onDone={st.reload} />}
    <footer className="lobby-foot"><span><b>KUMI</b> · NEAR testnet</span><span>Hub <a className="hash" href={`https://testnet.nearblocks.io/address/${HUB}`} target="_blank" rel="noreferrer">{HUB}</a> · MIT · © 2026 Nivesh Gajengi</span></footer>
  </main>;
}

/** The hero is the crew's own chat: header, the last real messages and the latest trade card. */
function ThreadHero({ st, messages, chatError, me }: { st: CrewState; messages: ChatMessage[] | undefined; chatError?: string; me: Session | null }) {
  const { crew, pnl } = st;
  const week = seasonRow(crew, pnl).returnPct;
  const lastTrade = messages ? [...messages].reverse().find(m => m.kind === 'trade' && m.trade?.proposalId !== undefined) : undefined;
  const pid = lastTrade?.trade?.proposalId;
  const props = useAsync(() => pid === undefined ? Promise.resolve({} as Record<number, Proposal>) : readProposals(crew.dao, [pid]), [crew.dao, pid]);
  const tail = (messages ?? []).filter(m => m.kind !== 'trade').slice(-4);
  return <section className="thread-hero c3" aria-label={`${crew.name} chat preview`}>
    <header className="th-head">
      <CrewAvatar id={crew.id} name={crew.name} size="lg" />
      <div className="th-id"><h2>{crew.name}</h2><span><i className="live-dot" />{crew.members.length} members · {crew.followers.length} following · Sputnik DAO</span></div>
      <div className="th-nav"><span className="th-nav-v"><TokenLogo sym="NEAR" size={22} />{pnl.navNear.toFixed(4)}</span><small>NAV · <b className={week >= 0 ? 'up' : 'down'}>{sign(week)}</b> this week</small></div>
    </header>
    <div className="th-body">
      {chatError && !messages ? <div className="th-off"><b>Chat preview offline.</b> The Kumi server isn't reachable ({chatError}). Fund numbers above still come straight from NEAR testnet.</div>
        : !messages ? <><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 56, marginTop: 10 }} /></>
        : messages.length === 0 ? <div className="th-off"><b>Quiet in here.</b> The first message or trade pitch shows up here live.</div>
        : <>
          {lastTrade && <MiniTrade m={lastTrade} st={st} proposal={pid !== undefined ? props.data?.[pid] : undefined} />}
          <div className="th-msgs">{tail.map(m => m.kind === 'system'
            ? <div key={m.id} className={`th-event ${/ragequit/.test(m.text) ? 'tone-pink' : /follow/.test(m.text) ? 'tone-mint' : 'tone-butter'}`}><Avatar id={m.account} /><span><b>{shortName(m.account)}</b> {m.text}</span>{m.txs[0] && <Tx hash={m.txs[0].hash} />}</div>
            : <div key={m.id} className={`th-msg ${me?.accountId === m.account ? 'mine' : ''}`}><Avatar id={m.account} /><span className="th-bubble"><b>{me?.accountId === m.account ? 'You' : shortName(m.account)}</b>{m.text.startsWith('/') ? <span className="mono"> {m.text}</span> : ` ${m.text}`}</span></div>)}</div>
        </>}
    </div>
    <div className="th-foot">
      <Link to={`/room?crew=${crew.id}`} className="th-fake">Reply to {crew.name}, or type /buy SOL 20%</Link>
      <Link to={`/room?crew=${crew.id}`} className="b3 b3-coral">OPEN THE CHAT <Ic name="arrow" size={18} /></Link>
    </div>
  </section>;
}

function MiniTrade({ m, st, proposal }: { m: ChatMessage; st: CrewState; proposal?: Proposal }) {
  const t = m.trade!;
  const trade = t.tradeId !== undefined ? st.trades.find(x => x.id === t.tradeId) : undefined;
  const status = trade?.status ?? 'voting';
  const v = proposal ? tally(proposal, st.policy) : null;
  const label = status === 'executed' ? ['Executed', 'mint'] : status === 'failed' ? ['Not filled', 'pink'] : ['Voting', 'butter'];
  return <div className={`mini-trade ${t.side}`}>
    <TokenLogo sym={t.asset} size={40} test />
    <div className="mt-id"><span className="mt-k">TRADE PROPOSAL · BY {shortName(m.account).toUpperCase()}</span><b>{t.side === 'buy' ? 'Buy' : 'Sell'} {t.asset} with {(t.bps / 100).toLocaleString()}%</b></div>
    <span className={`st3 st3-${label[1]}`}>{label[0].toUpperCase()}</span>
    {v && <div className="mt-seats" aria-label={`${v.approve} of ${v.needed} approvals`}><span className="mt-v">{v.approve}/{v.needed} yes</span>{Array.from({ length: v.members }, (_, i) => <i key={i} className={i < v.approve ? 'on' : i >= v.members - v.reject ? 'no' : ''} />)}</div>}
  </div>;
}

function PlayerCard({ me, st, onSignIn }: { me: Session | null; st: CrewState; onSignIn: () => void }) {
  const share = me ? memberShare(st.crew, me.accountId) : null;
  const stake = share && share.shares > 0n ? st.pnl.navNear * share.bps / 10_000 : null;
  const pitched = me ? st.trades.filter(t => t.proposer === me.accountId).length : 0;
  const invited = !!me && st.crew.allowed.includes(me.accountId);
  return <aside className="player2 c3" aria-label="Your player">
    <span className="p2-av" style={{ background: me ? undefined : 'var(--mint-soft)' }}><img src={`/art/kumi3-av-${me ? mascotOf(me.accountId) : 'frog'}.webp`} alt="" /></span>
    <div className="p2-main">
      <span className="k">YOUR PLAYER</span>
      <b className="p2-name">{me ? me.handle : 'Sign in to play'}</b>
      <span className="chips3"><span className="chip3"><Ic name="crews" size={12} />{invited ? st.crew.name : 'No crew yet'}</span><span className="chip3"><Ic name="key" size={12} />{me ? 'Key in this browser' : 'No wallet needed'}</span></span>
    </div>
    <div className="p2-stats">
      <span><small>Stake</small><b className="row" style={{ gap: 5 }}>{stake !== null ? <><TokenLogo sym="NEAR" size={18} />{stake.toFixed(4)}</> : '–'}</b></span>
      <span><small>Share</small><b>{share && share.shares > 0n ? `${(share.bps / 100).toFixed(1)}%` : '–'}</b></span>
      <span><small>Pitched</small><b>{pitched}</b></span>
    </div>
    {!me ? <button className="b3 b3-plum" onClick={onSignIn}>SIGN IN WITH EMAIL <Ic name="arrow" size={16} /></button>
      : <Link to={`/room?crew=${st.crew.id}`} className="b3 b3-plum">{invited ? 'GO TO MY CREW' : 'WATCH THE CHAT'} <Ic name="arrow" size={16} /></Link>}
  </aside>;
}

/** The crew, shown as its members: one clay mascot each, with their share and role. */
function CrewCard({ st }: { st: CrewState }) {
  const { crew } = st;
  return <section className="crew2 c3" aria-label="The crew">
    <div className="row-between"><span className="k">THE CREW</span><span className="chip3">strict majority votes</span></div>
    <div className="members2">{crew.allowed.map(a => {
      const s = memberShare(crew, a);
      const cap = crew.captain?.account_id === a;
      return <div key={a} className="m2">
        <span className={`m2-av m2-${mascotOf(a)}`}><img src={`/art/kumi3-av-${mascotOf(a)}.webp`} alt="" />{cap && <i title="Captain">★</i>}</span>
        <b>{shortName(a)}</b>
        <small>{s.shares > 0n ? `${(s.bps / 100).toFixed(1)}%` : 'invited'}{cap ? ' · captain' : ''}</small>
      </div>;
    })}</div>
  </section>;
}

const KIND: Record<string, [string, string]> = { join: ['IN', 'butter'], ragequit: ['OUT', 'pink'], trade: ['TRADE', 'coral'], captain_trade: ['CAPTAIN', 'coral'], follow: ['FOLLOW', 'mint'], unfollow: ['UNFOLLOW', 'mint'], fee: ['FEE', 'butter'] };
function receiptAmount(r: Receipt, st: CrewState) {
  const a = st.assets.find(x => x.symbol === r.asset);
  const tok = (v: string) => `${formatUnits(v, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 6))} t${r.asset}`;
  if (r.kind === 'join') return { sym: 'NEAR', text: `${formatNear(r.near_in, 3)} NEAR` };
  if (r.kind === 'follow' || r.kind === 'unfollow') return { sym: 'NEAR', text: `${formatNear(r.shares, 3)} vault shares` };
  if (r.kind === 'trade' || r.kind === 'captain_trade') return BigInt(r.near_out) > 0n ? { sym: r.asset ?? 'NEAR', test: true, text: `${formatNear(r.near_out, 4)} N → ${tok(r.token_in)}` } : { sym: r.asset ?? 'NEAR', test: true, text: `${tok(r.token_out)} → ${formatNear(r.near_in, 4)} N` };
  if (r.kind === 'ragequit') return { sym: 'NEAR', text: `${formatNear(r.near_out, 4)} NEAR out` };
  return { sym: 'NEAR', text: `${formatNear(r.near_in, 5)} NEAR fee` };
}

/** The crew record as a till receipt, then the latest on-chain receipts as tickets. */
function Receipts({ st }: { st: CrewState }) {
  const { crew, pnl, receipts } = st;
  const week = seasonRow(crew, pnl).returnPct;
  return <section className="receipts2" aria-label="Crew receipts">
    <div className="till">
      <span className="till-h">KUMI 組 · {crew.name.toUpperCase()}</span>
      <span className="till-c"><small>NAV</small><b className="row" style={{ gap: 6 }}><TokenLogo sym="NEAR" size={20} />{pnl.navNear.toFixed(4)}</b></span>
      <span className="till-c"><small>ALL TIME</small><b className={pnl.returnPct >= 0 ? 'up' : 'down'}>{sign(pnl.returnPct)}</b></span>
      <span className="till-c"><small>THIS WEEK</small><b className={week >= 0 ? 'up' : 'down'}>{sign(week)}</b></span>
      <span className="till-c"><small>TRADES</small><b>{crew.trade_count}</b></span>
      <span className="till-c"><small>MEMBERS</small><b>{crew.members.length}</b></span>
      <span className="till-c"><small>RECEIPTS</small><b>{receipts.length}</b></span>
      <span className={`stamp ${pnl.verified ? '' : 'bad'}`} title={pnl.verifyNote}>{pnl.verified ? 'VERIFIED ON-CHAIN' : 'UNVERIFIED'}</span>
    </div>
    <div className="tickets" role="list" aria-label="Latest receipts">
      {[...receipts].reverse().slice(0, 10).map(r => {
        const [k, tone] = KIND[r.kind] ?? ['', 'butter'];
        const amt = receiptAmount(r, st);
        return <div key={r.seq} className={`ticket tk-${tone}`} role="listitem">
          <span className="tk-k">{k}</span>
          <span className="row" style={{ gap: 6 }}><Avatar id={r.account_id} /><b>{r.kind === 'fee' ? 'follower vault' : shortName(r.account_id)}</b></span>
          <span className="tk-amt"><TokenLogo sym={amt.sym} size={16} test={amt.test} />{amt.text}</span>
          <span className="tk-b mono">#{r.seq} · block {r.block}</span>
        </div>;
      })}
    </div>
  </section>;
}

function CallRow({ t, st, odd }: { t: Trade; st: CrewState; odd: boolean }) {
  const a = st.assets.find(x => x.symbol === t.asset);
  const leg = (v: string, near: boolean) => near ? `${formatNear(v, 4)} NEAR` : `${formatUnits(v, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${t.asset}`;
  const status = t.status === 'executed' ? ['EXECUTED', 'mint'] : t.status === 'failed' ? ['NOT FILLED', 'pink'] : [t.status.toUpperCase(), 'butter'];
  return <div className={`call2 ${odd ? 'odd' : ''}`}>
    <TokenLogo sym={t.asset} size={34} test />
    <span className="c2-main"><span className={`side3 ${t.side}`}>{t.side === 'buy' ? 'BUY' : 'SELL'} {t.asset} {(t.bps / 100).toFixed(0)}%</span><small>{t.kind === 'captain' ? 'Captain key' : `Vote #${t.dao_proposal_id}`} · by {shortName(t.proposer)}</small></span>
    <span className="call-legs">{t.status === 'executed' ? `${leg(t.crew_in, t.side === 'buy')} → ${leg(t.crew_out, t.side !== 'buy')}` : `quoted ${leg(t.quote_in, t.side === 'buy')}`}</span>
    <span className={`st3 st3-${status[1]}`}>{status[0]}</span>
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
  return <section className="builder2 c3" id="pitch">
    <div className="sec-head"><div><span className="k">PITCH A TRADE</span><h2>Build your call</h2></div></div>
    <p className="mini">Kumi drops the command into {st.crew.name}'s chat, where it becomes a trade card with a pool quote and a Sputnik vote. A strict majority executes it once; the pool refuses a fill past {st.crew.slippage_bps / 100}% slippage.</p>
    <div className="seg3" role="group" aria-label="Side">
      <button aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>Buy</button>
      <button aria-pressed={side === 'sell'} onClick={() => setSide('sell')}>Sell</button>
    </div>
    <div className="fields3">
      <label><span>ASSET</span><span className="logo-select"><span className="ls-logo"><TokenLogo sym={asset} size={26} test /></span><select value={asset} onChange={e => setAsset(e.target.value)}>{st.assets.map(a => <option key={a.symbol} value={a.symbol}>t{a.symbol} · test pool</option>)}</select></span></label>
      <label><span>SIZE OF THE {side === 'buy' ? 'NEAR' : `t${asset}`}</span><span className="logo-select"><span className="ls-logo"><TokenLogo sym={side === 'buy' ? 'NEAR' : asset} size={26} test={side !== 'buy'} /></span><select value={size} onChange={e => setSize(e.target.value)}>{['5', '10', '20', '30', '50'].map(s => <option key={s} value={s}>{s}%</option>)}</select></span></label>
      <label><span>LANE</span><select value={lane} onChange={e => setLane(e.target.value as 'vote' | 'captain')}><option value="vote">Crew vote</option><option value="captain" disabled={!isCaptain}>Captain key{isCaptain ? '' : ' (captain only)'}</option></select></label>
      <label><span>CREW</span><select value={st.crew.id} disabled><option value={st.crew.id}>{st.crew.name}</option></select></label>
    </div>
    <div className="cmd-preview"><span className="k">YOUR MESSAGE</span><b className="mono">{cmd}</b></div>
    {!me ? <button className="b3 b3-coral b3-xl" onClick={onSignIn}>SIGN IN TO PITCH <Ic name="arrow" size={20} /></button>
      : <Link to={`/room?crew=${st.crew.id}&pitch=${encodeURIComponent(cmd)}`} className={`b3 b3-coral b3-xl ${member ? '' : 'b3-off'}`}>{member ? 'PITCH IN THE CREW CHAT' : 'MEMBERS ONLY · WATCH THE CHAT'} <Ic name="arrow" size={20} /></Link>}
    <p className="fine">Testnet trades fill against Kumi's NEP-141 test pools (marked "test"). Every card also carries a real mainnet NEAR Intents 1Click dry quote; live swaps need NEAR_MAINNET_ACCOUNT.</p>
  </section>;
}
