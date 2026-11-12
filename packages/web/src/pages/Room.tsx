import { useEffect, useMemo, useRef, useState } from 'react';
import { crewNav, memberShare, type Crew, type Proposal } from '@kumi/sdk';
import { api, HUB, readCrew, readHub, readProposals, useAsync, useChat, useConfig, type ChatMessage, type CrewState } from '../lib/api';
import { signedChat, useSession, type Session } from '../lib/session';
import { Art, Avatar, CrewAvatar, EmptyArt, Ic, Link, Notice, crewTone, navigate, shortName, Tx } from '../ui/bits';
import { CrewInfo, FundPane, JoinSheet, QuitSheet } from '../ui/Fund';
import { InviteCard } from '../ui/InviteCard';
import { TradeCard } from '../ui/TradeCard';
import { TokenLogo } from '../ui/logos';

const HINTS: [string, string][] = [['/buy SOL 20%', 'coral'], ['/sell SOL 50%', 'pink'], ['/buy BTC 10%', 'butter'], ['/captain buy SOL 5%', 'mint']];
const SEEN = (id: number) => `kumi:seen:v1:${id}`;
const seen = (id: number) => { try { return Number(localStorage.getItem(SEEN(id)) ?? 0); } catch { return 0; } };
type Tab = 'crews' | 'chat' | 'fund';

export function Room({ onSignIn }: { onSignIn: () => void }) {
  const me = useSession();
  const hub = useAsync(() => readHub(), [], 60_000);
  const wanted = new URLSearchParams(location.search).get('crew');
  const crews = hub.data?.crews ?? [];
  const crewId = useMemo(() => {
    if (wanted !== null) return Number(wanted);
    return (me && crews.find(c => c.allowed.includes(me.accountId))?.id) ?? crews[0]?.id ?? null;
  }, [crews, wanted, me]);

  if (hub.error && !hub.data) return <div className="page"><Notice error>Could not read the Kumi hub {HUB} on NEAR testnet: {hub.error}</Notice></div>;
  if (!hub.data) return <div className="room" data-tab="chat"><aside className="pane list"><div className="skeleton" style={{ height: 300, margin: 16 }} /></aside><section className="pane thread"><div className="skeleton" style={{ height: 220, margin: 24 }} /></section><aside className="pane fund"><div className="skeleton" style={{ height: 260 }} /></aside></div>;
  if (crewId === null) return <div className="page"><div className="card"><EmptyArt art={['kumi3-empty', 'kumi-og']} title="No crews on this hub yet">The first crew needs a Sputnik DAO (5.5 testnet NEAR of code storage). Run <span className="mono">pnpm run:testnet</span> to create one.</EmptyArt></div></div>;
  return <CrewRoom key={crewId} crewId={crewId} crews={crews} marks={hub.data.marks} me={me} onSignIn={onSignIn} />;
}

function CrewRoom({ crewId, crews, marks, me, onSignIn }: { crewId: number; crews: Crew[]; marks: import('@kumi/sdk').Mark[]; me: Session | null; onSignIn: () => void }) {
  const [tab, setTab] = useState<Tab>('chat');
  const [sheet, setSheet] = useState<'join' | 'quit' | null>(null);
  const st = useAsync(() => readCrew(crewId), [crewId], 15_000);
  const config = useConfig();
  const online = !!config.data;
  const chat = useChat(crewId, online);
  useEffect(() => { if (!config.loading && !online) setTab('fund'); }, [online, config.data === undefined]);
  const cardIds = [...new Set([...chat.messages.filter(m => m.kind === 'trade' && m.trade?.proposalId !== undefined).map(m => m.trade!.proposalId!), ...chat.messages.flatMap(m => m.invite ? [m.invite.roleProposalId, m.invite.proposalId].filter((id): id is number => id !== undefined) : []), ...(st.data?.invites ?? []).flatMap(i => [i.role_proposal_id, i.dao_proposal_id].filter((id): id is number => id !== null)), ...(!online ? (st.data?.trades ?? []).flatMap(t => t.dao_proposal_id === null ? [] : [t.dao_proposal_id]) : [])])];
  const props = useAsync(() => st.data ? readProposals(st.data.crew.dao, cardIds) : Promise.resolve({} as Record<number, Proposal>), [st.data?.crew.dao, cardIds.join(','), st.data?.readAt]);
  const [text, setText] = useState(() => new URLSearchParams(location.search).get('pitch') ?? '');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const stuck = useRef(true);
  useEffect(() => { const b = box.current; if (b && stuck.current) b.scrollTop = b.scrollHeight; }, [chat.messages, st.data?.readAt, props.data, tab]);
  // Mark this crew read up to its newest message.
  useEffect(() => { const last = chat.messages[chat.messages.length - 1]; if (last) try { localStorage.setItem(SEEN(crewId), String(last.ts)); } catch { /* private mode */ } }, [chat.messages, crewId]);

  const refresh = () => { st.reload(); props.reload(); };
  const isMember = !!me && !!st.data && st.data.crew.allowed.includes(me.accountId);
  const offlineNote = <p className="mini">Chat and actions need <span className="mono">pnpm run server</span>.</p>;
  const pitch = (t = '/buy SOL 10%') => { setTab('chat'); setText(t); requestAnimationFrame(() => input.current?.focus()); };
  const toVote = () => { setTab('chat'); requestAnimationFrame(() => document.querySelector('[data-vote="open"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })); };

  async function send(t: string) {
    if (!me || !t.trim()) return;
    stuck.current = true;
    if (chat.send(await signedChat(me, crewId, t.trim()))) setText('');
  }

  const list = <aside className="pane list" aria-label="Crews">
    <div className="list-head">
      <div className="row-between"><h2>Crews</h2><Link to="/leaderboard" className="chip chip-butter"><Ic name="trophy" size={13} />Season</Link></div>
      <label className="search"><Ic name="search" size={16} /><span className="sr">Search crews</span><input placeholder={`Search ${crews.length} ${crews.length === 1 ? 'crew' : 'crews'}`} disabled title="Search arrives when the hub lists more crews" /></label>
    </div>
    <CrewList crews={crews} marks={marks} current={crewId} me={me} online={online} />
    <div className="list-foot">
      {!online && tab === 'crews' && offlineNote}
      {st.data && online && <FirstRun st={st.data} me={me} messages={chat.messages} proposals={props.data ?? {}} onSignIn={onSignIn} onJoin={() => setSheet('join')} onPitch={() => pitch()} onVote={toVote} />}
      <Link to="/leaderboard" className="season-mini"><Art name={['kumi3-season', 'kumi-og']} alt="" /><span><b>This week's season</b><small>Return minus half the drawdown, from receipts. See the board →</small></span></Link>
      <section className="legend" aria-label="What the colours mean"><h3>Reading the chat</h3><ul>
        <li className="tone-coral"><i /><span><b>Coral</b> trade proposals</span></li>
        <li className="tone-butter"><i /><span><b>Butter</b> votes and deposits</span></li>
        <li className="tone-mint"><i /><span><b>Mint</b> followers and gains</span></li>
        <li className="tone-pink"><i /><span><b>Pink</b> ragequits and losses</span></li>
      </ul></section>
      <Link to={`/crew/${crewId}`} className="btn btn-sm btn-ghost"><Ic name="star" size={15} />Not in a crew? Follow one</Link>
    </div>
  </aside>;

  if (st.error && !st.data) return <div className="page"><Notice error>{st.error}</Notice></div>;
  if (!st.data) return <div className="room" data-tab={tab}>{list}<section className="pane thread"><div className="skeleton" style={{ height: 220, margin: 24 }} /></section><aside className="pane fund"><div className="skeleton" style={{ height: 260 }} /></aside></div>;
  const { crew } = st.data;
  const mine = me ? memberShare(crew, me.accountId) : null;

  return (
    <div className="room" data-tab={tab}>
      {list}
      <section className="pane thread" aria-label={`${crew.name} chat`}>
        <div className="thread-head">
          <CrewAvatar id={crew.id} name={crew.name} />
          <div className="grow">
            <h1>{crew.name}</h1>
            <div className="sub"><span className={`live ${chat.status === 'live' ? '' : 'off'}`}><i />{chat.status === 'live' ? 'Live' : chat.status === 'connecting' ? 'Connecting' : 'Offline'}</span>{crew.members.length} members · {crew.followers.length} following</div>
          </div>
          <span className="avatars hide-sm">{crew.allowed.map(a => <Avatar key={a} id={a} initial />)}</span>
          <button className="btn btn-sm btn-plum thread-tabs" onClick={() => setTab('fund')}><Ic name="chart" size={15} />{st.data.pnl.navNear.toFixed(3)} N</button>
        </div>
        <div className="messages" aria-live="polite" ref={box} onScroll={e => { const b = e.currentTarget; stuck.current = b.scrollHeight - b.scrollTop - b.clientHeight < 80; }}>
          {!online && st.data.invites.map(i => <InviteCard key={`invite-${i.id}`} m={{ id: `chain-invite-${i.id}`, crewId, account: i.proposer, ts: Number(BigInt(i.created_at) / 1_000_000n), text: '', kind: 'invite', txs: [], invite: { accountId: i.account_id, roleProposalId: i.role_proposal_id, proposalId: i.dao_proposal_id ?? undefined, inviteId: i.id } }} me={null} st={st.data!} proposals={props.data ?? {}} hub={HUB} onDone={refresh} />)}
          {!online && st.data.trades.slice(-8).reverse().map(t => <TradeCard key={t.id} m={{ id: `chain-${t.id}`, crewId, account: t.proposer, ts: Number(BigInt(t.created_at) / 1_000_000n), text: '', kind: 'trade', txs: [], trade: { side: t.side, asset: t.asset, bps: t.bps, lane: t.kind === 'captain' ? 'captain' : 'vote', tradeId: t.id, proposalId: t.dao_proposal_id ?? undefined } }} me={null} crew={st.data!.crew} trade={t} proposal={props.data?.[t.dao_proposal_id ?? -1]} policy={st.data!.policy} assets={st.data!.assets} hub={HUB} onDone={refresh} />)}
          {online && chat.status !== 'offline' && chat.messages.length === 0 && <EmptyArt art={['kumi3-empty', 'kumi-feature-chat']} title="Quiet in here" action={isMember ? <button className="btn btn-primary" onClick={() => pitch()}>Pitch the first trade</button> : undefined}>Say hi, or pitch the first trade with <span className="mono">/buy SOL 20%</span>.</EmptyArt>}
          {chat.messages.map((m, i) => <Message key={m.id} m={m} prev={chat.messages[i - 1]} me={me} st={st.data!} proposals={props.data ?? {}} onDone={refresh} />)}
        </div>
        <div className="composer">
          {chat.error && <div style={{ marginBottom: 10 }}><Notice error>{chat.error}</Notice></div>}
          {!online ? tab === 'chat' && offlineNote : !me ? <div className="guest-bar"><p><b>Read-only.</b> Sign in with email to talk, pitch trades and vote. No wallet needed.</p><button className="btn btn-primary" onClick={onSignIn}>Sign in</button></div>
            : !isMember ? <div className="guest-bar"><p><b>You're a guest here.</b> Only {crew.name} members post. Anyone can follow the crew and mirror its trades.</p><Link to={`/crew/${crew.id}`} className="btn btn-mint">Follow</Link></div>
            : <>
              <div className="hints"><span className="lbl">Pitch a trade:</span>{HINTS.map(([h, tone]) => <button key={h} className={`hint tone-${tone}`} onClick={() => pitch(h)}>{h}</button>)}</div>
              <form className="composer-box" onSubmit={e => { e.preventDefault(); void send(text); }}>
                <input ref={input} value={text} onChange={e => setText(e.target.value)} placeholder={mine && mine.shares > 0n ? 'Message the crew, or /buy SOL 20%' : 'Say hi, then chip in to get a vote'} aria-label="Message" maxLength={500} />
                <button className="send" aria-label="Send"><Ic name="send" size={19} /></button>
              </form>
              {config.data?.setup.liveSwaps && <p className="composer-note">Testnet trades fill against test pools. Mainnet 1Click swaps: {config.data.setup.liveSwaps}.</p>}
            </>}
        </div>
      </section>
      <aside className="pane fund" aria-label="Crew fund">
        {!online && tab === 'fund' && offlineNote}
        <FundPane st={st.data} me={online ? me : null} onJoin={() => (me ? setSheet('join') : onSignIn())} onQuit={() => setSheet('quit')} />
        <CrewInfo st={st.data} me={online ? me : null} onChanged={refresh} />
      </aside>
      <nav className="tabs" aria-label="Sections">
        {([['crews', 'Crews', 'crews'], ['chat', 'Chat', 'chat'], ['fund', 'Fund', 'chart']] as const).map(([t, l, ic]) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}><Ic name={ic} size={19} />{l}</button>)}
      </nav>
      {sheet === 'join' && me && <JoinSheet st={st.data} me={me} hub={HUB} onClose={() => setSheet(null)} onDone={refresh} />}
      {sheet === 'quit' && me && mine && <QuitSheet st={st.data} me={me} hub={HUB} shares={mine.shares} onClose={() => setSheet(null)} onDone={refresh} />}
    </div>
  );
}

/** Telegram-style crew list: colour avatar, last message, time, unread count. */
function CrewList({ crews, marks, current, me, online }: { crews: Crew[]; marks: import('@kumi/sdk').Mark[]; current: number; me: Session | null; online: boolean }) {
  const last = useAsync(async () => {
    const out: Record<number, { msg?: ChatMessage; unread: number }> = {};
    if (!online) return out;
    await Promise.all(crews.map(async c => {
      try {
        const ms = await api<ChatMessage[]>(`/api/messages?crew=${c.id}`);
        const s = seen(c.id);
        out[c.id] = { msg: ms[ms.length - 1], unread: c.id === current ? 0 : ms.filter(m => m.ts > s && m.account !== me?.accountId).length };
      } catch { out[c.id] = { unread: 0 }; }
    }));
    return out;
  }, [crews.map(c => c.id).join(','), current, me?.accountId, online], 20_000);
  return <ul className="crew-list">
    {crews.map(c => {
      const l = last.data?.[c.id];
      const preview = l?.msg ? `${l.msg.account === me?.accountId ? 'You' : shortName(l.msg.account)}: ${l.msg.kind === 'trade' ? `pitched ${l.msg.text}` : l.msg.text}` : last.loading ? 'Loading…' : `${c.members.length} members · ${c.trade_count} trades`;
      const nav = Number(crewNav(c, marks)) / 1e24;
      return <li key={c.id}>
        <a href={`/room?crew=${c.id}`} className={`crew-item tone-${crewTone(c.id)}`} aria-current={c.id === current ? 'page' : undefined} onClick={e => { e.preventDefault(); navigate(`/room?crew=${c.id}`); }}>
          <CrewAvatar id={c.id} name={c.name} />
          <span style={{ minWidth: 0 }}><span className="n" style={{ display: 'block' }}>{c.name}</span><span className="p" style={{ display: 'block' }}>{preview}</span></span>
          <span className="meta">
            <span className="t">{l?.msg ? new Date(l.msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
            {l && l.unread > 0 ? <span className="badge" aria-label={`${l.unread} unread`}>{l.unread > 99 ? '99+' : l.unread}</span> : <span className="badge badge-ret row" style={{ gap: 4 }}><TokenLogo sym="NEAR" size={14} />{nav.toFixed(2)}</span>}
          </span>
        </a>
      </li>;
    })}
  </ul>;
}

/** The first-run path, checked against real state: sign in → invited → chip in → pitch → vote. */
function FirstRun({ st, me, messages, proposals, onSignIn, onJoin, onPitch, onVote }: { st: CrewState; me: Session | null; messages: ChatMessage[]; proposals: Record<number, Proposal>; onSignIn: () => void; onJoin: () => void; onPitch: () => void; onVote: () => void }) {
  const { crew } = st;
  const invited = !!me && crew.allowed.includes(me.accountId);
  const shares = me ? memberShare(crew, me.accountId).shares > 0n : false;
  const pitched = !!me && messages.some(m => m.kind === 'trade' && m.account === me.accountId);
  const voted = !!me && Object.values(proposals).some(p => p.votes?.[me.accountId]);
  const steps = [
    { label: 'Sign in with email', done: !!me, act: onSignIn, cta: 'Sign in' },
    { label: `Join ${crew.name}`, done: invited, act: undefined, cta: '' },
    { label: 'Chip in NEAR', done: shares, act: onJoin, cta: 'Chip in' },
    { label: 'Pitch a trade', done: pitched, act: onPitch, cta: 'Pitch /buy SOL 10%' },
    { label: 'Vote on a trade', done: voted, act: onVote, cta: 'Find the open vote' },
  ];
  const now = steps.findIndex(s => !s.done);
  const done = steps.filter(s => s.done).length;
  if (now === -1) return null;
  const step = steps[now];
  return <section className="steps" aria-label="Getting started">
    <h3>Get into the crew</h3>
    <p>{done} of {steps.length} done · each step is a real on-chain action</p>
    <div className="bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div>
    <ol>{steps.map((s, i) => <li key={s.label} className={s.done ? 'done' : i === now ? 'now' : ''}><span className="n">{s.done ? '✓' : i + 1}</span>{s.label}</li>)}</ol>
    {now === 1 ? <p style={{ margin: '12px 0 0', color: '#eadcf0' }}>Crews are invite-only: ask a shareholder to post /invite with your testnet account. A majority must approve before you chip in. Meanwhile you can follow {crew.name}.</p>
      : step.act && <button className="btn btn-butter btn-block" onClick={step.act}>{step.cta} <Ic name="arrow" size={16} /></button>}
  </section>;
}

const EVENT: [RegExp, string, string][] = [[/ragequit|left/, 'pink', 'exit'], [/follow/, 'mint', 'star'], [/joined|chipped/, 'butter', 'jar'], [/captain/, 'coral', 'key']];
function Message({ m, prev, me, st, proposals, onDone }: { m: ChatMessage; prev?: ChatMessage; me: Session | null; st: CrewState; proposals: Record<number, Proposal>; onDone: () => void }) {
  const day = new Date(m.ts).toDateString();
  const showDay = !prev || new Date(prev.ts).toDateString() !== day;
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const mine = me?.accountId === m.account;
  let body;
  if (m.kind === 'system') {
    const [, tone, ic] = EVENT.find(([re]) => re.test(m.text)) ?? [null, 'butter', 'bolt'];
    body = <div className={`event tone-${tone}`}><span className="ev-ic"><Ic name={ic} size={14} /></span><b>{shortName(m.account)}</b> {m.text} {m.txs.map(t => <Tx key={t.hash} hash={t.hash} />)}</div>;
  } else if (m.kind === 'invite') {
    body = <InviteCard m={m} me={me} st={st} proposals={proposals} hub={HUB} onDone={onDone} />;
  } else if (m.kind === 'trade') {
    const trade = m.trade?.tradeId !== undefined ? st.trades.find(t => t.id === m.trade!.tradeId) : undefined;
    body = <TradeCard m={m} me={me} crew={st.crew} trade={trade} proposal={m.trade?.proposalId !== undefined ? proposals[m.trade.proposalId] : undefined} policy={st.policy} assets={st.assets} hub={HUB} onDone={onDone} />;
  } else {
    body = <div className={`msg ${mine ? 'mine' : ''}`}>
      <Avatar id={m.account} />
      <div style={{ minWidth: 0 }}>
        <div className="msg-meta"><b>{mine ? 'You' : shortName(m.account)}</b><span>{time}</span>{m.sig && <span className="verified" title={`ed25519 signature by ${m.publicKey}, an access key on ${m.account}`}><Ic name="check" size={11} />signed</span>}</div>
        <div className="bubble">{m.text.startsWith('/') ? <span className="cmd">{m.text}</span> : m.text}</div>
      </div>
    </div>;
  }
  return <>{showDay && <div className="daysep">{new Date(m.ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>}{body}</>;
}

