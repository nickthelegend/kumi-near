import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { seasonRow, type Proposal } from '@kumi/sdk';
import { HUB, readCrew, readProposals, useAsync, useChat, useConfig, type ChatMessage, type CrewState } from '../lib/api';
import { signed } from '../lib/activity';
import { signedChat, useSession, type Session } from '../lib/session';
import { Art, Avatar, Avatars, Icon, Link, Notice, State, shortName, Tx } from '../ui/bits';
import { CrewInfo, FundPane } from '../ui/Fund';
import { Sheet } from '../ui/Sheets';
import { TradeCard } from '../ui/TradeCard';

const HINTS = ['/buy SOL 20%', '/sell SOL 50%', '/buy BTC 10%', '/captain buy SOL 5%'];

export function Chat({ crewId, desktop, onSignIn }: { crewId: number; desktop: boolean; onSignIn: () => void }) {
  const me = useSession();
  const st = useAsync(() => readCrew(crewId), [crewId], 15_000);
  const chat = useChat(crewId);
  const config = useConfig();
  const cardIds = chat.messages.filter(m => m.kind === 'trade' && m.trade?.proposalId !== undefined).map(m => m.trade!.proposalId!);
  const props = useAsync(() => st.data ? readProposals(st.data.crew.dao, cardIds) : Promise.resolve({} as Record<number, Proposal>), [st.data?.crew.dao, cardIds.join(','), st.data?.readAt]);
  const [text, setText] = useState('');
  const [sheet, setSheet] = useState<'fund' | 'crew' | null>(null);
  const stuck = useRef(true);

  // Keep the newest message in view unless the reader scrolled up.
  useEffect(() => {
    const on = () => { stuck.current = document.documentElement.scrollHeight - scrollY - innerHeight < 160; };
    addEventListener('scroll', on, { passive: true });
    // Late content (quotes, votes, fonts) grows the page; follow it while the reader is at the bottom.
    const ro = new ResizeObserver(() => { if (stuck.current) scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); });
    ro.observe(document.body);
    return () => { removeEventListener('scroll', on); ro.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    if (!chat.messages.length || !stuck.current) return;
    scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
  }, [chat.messages, props.data, st.data?.readAt]);

  if (st.error && !st.data) return <div className={desktop ? 'web-page' : 'ph-page'} style={{ paddingTop: 24 }}><State kind="error" title={`Could not read crew ${crewId}`} action={<button className="pill-light" onClick={st.reload}>Retry</button>}>{st.error}</State></div>;
  if (!st.data) return <div className={desktop ? 'web-page' : 'chat-page'} style={{ paddingTop: 24 }}><div className="skeleton" style={{ height: 72 }} /><div className="skeleton" style={{ height: 300, marginTop: 14, borderRadius: 26 }} /><div className="skeleton" style={{ height: 120, marginTop: 14 }} /></div>;
  const { crew, pnl } = st.data;
  const week = seasonRow(crew, pnl).returnPct;
  const isMember = !!me && crew.allowed.includes(me.accountId);
  const refresh = () => { st.reload(); props.reload(); };

  async function send(t: string) {
    if (!me || !t.trim()) return;
    stuck.current = true;
    if (chat.send(await signedChat(me, crewId, t.trim()))) setText('');
  }

  const column = <div className="chat-page">
    <header className="chat-head">
      {!desktop && <Link to="/app" className="icon-round" aria-label="All crews"><Icon name="chevL" size={18} /></Link>}
      <span className="crew-dot">{crew.name.slice(0, 1)}</span>
      <div className="chat-head-id"><h1>{crew.name}</h1>
        <span><i className={`live-dot ${chat.status === 'live' ? '' : 'off'}`} />{chat.status === 'live' ? 'Live' : chat.status === 'connecting' ? 'Connecting' : 'Offline'} · {crew.members.length} in · {crew.followers.length} following</span></div>
      <Avatars ids={crew.allowed} max={3} />
    </header>
    {!desktop && <div className="crew-strip dark-ctx">
      <div><p className="lbl">Treasury NAV · <span className={week >= 0 ? 'pos' : 'neg'}>{signed(week)}</span> this week</p><div className="crew-strip-nav">{pnl.navNear.toFixed(4)}<small>NEAR</small></div></div>
      <div className="crew-strip-btns"><button className="pill-light pill-sm" onClick={() => setSheet('fund')}>Fund</button><button className="pill-ghost pill-sm" onClick={() => setSheet('crew')}>Crew</button></div>
    </div>}
    <div className="messages" aria-live="polite">
      {chat.status === 'offline' && chat.messages.length === 0 && <State kind="error" title="Chat is offline">The Kumi server is not running. Start it with <code>pnpm server</code>. The fund numbers still read the chain directly.</State>}
      {chat.status !== 'offline' && chat.messages.length === 0 && <div className="state"><div style={{ width: 120, height: 80, borderRadius: 14, overflow: 'hidden', flex: 'none' }}><Art name="kumi-feature-chat" alt="" /></div><div><h3>Quiet in here</h3><p>Say hi, or pitch the first trade with <code>/buy SOL 20%</code>.</p></div></div>}
      {chat.messages.map((m, i) => <Message key={m.id} m={m} prev={chat.messages[i - 1]} me={me} st={st.data!} proposals={props.data ?? {}} onDone={refresh} />)}
    </div>
    <div className="composer">
      {chat.error && <div style={{ marginBottom: 8 }}><Notice error>{chat.error}</Notice></div>}
      {!me ? <button className="pill-coral pill-xl pill-block" onClick={onSignIn}>Sign in with email to talk</button>
        : !isMember ? <Notice>You're reading as a guest. Only {crew.name} members can post; anyone can <Link to={`/crew/${crew.id}`}>follow the crew</Link>.</Notice>
        : <>
          <div className="hints">{HINTS.map(h => <button key={h} className="hint" onClick={() => setText(h)}>{h}</button>)}</div>
          <form className="composer-box" onSubmit={e => { e.preventDefault(); void send(text); }}>
            <input value={text} onChange={e => setText(e.target.value)} placeholder="Message the crew, or /buy SOL 20%" aria-label="Message" maxLength={500} />
            <button className="send" aria-label="Send"><Icon name="send" size={19} /></button>
          </form>
          {config.data?.setup.liveSwaps && <p className="composer-note">Testnet trades fill against test pools. Mainnet 1Click swaps: {config.data.setup.liveSwaps}.</p>}
        </>}
    </div>
  </div>;

  if (desktop) return <div className="chat-wrap">{column}<aside className="pane" aria-label="Crew fund"><FundPane st={st.data} me={me} weekPct={week} onChanged={refresh} /><CrewInfo st={st.data} me={me} onChanged={refresh} /></aside></div>;
  return <>
    {column}
    {sheet === 'fund' && <Sheet title={`${crew.name} fund`} onClose={() => setSheet(null)}><FundPane st={st.data} me={me} weekPct={week} onChanged={refresh} /></Sheet>}
    {sheet === 'crew' && <Sheet title={crew.name} onClose={() => setSheet(null)}><CrewInfo st={st.data} me={me} onChanged={refresh} /></Sheet>}
  </>;
}

function Message({ m, prev, me, st, proposals, onDone }: { m: ChatMessage; prev?: ChatMessage; me: Session | null; st: CrewState; proposals: Record<number, Proposal>; onDone: () => void }) {
  const day = new Date(m.ts).toDateString();
  const showDay = !prev || new Date(prev.ts).toDateString() !== day;
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const mine = me?.accountId === m.account;
  let body;
  if (m.kind === 'system') {
    body = <div className="sys"><Avatar id={m.account} /><b>{shortName(m.account)}</b> {m.text} {m.txs.map(t => <Tx key={t.hash} hash={t.hash} />)}</div>;
  } else if (m.kind === 'trade') {
    const trade = m.trade?.tradeId !== undefined ? st.trades.find(t => t.id === m.trade!.tradeId) : undefined;
    body = <TradeCard m={m} me={me} crew={st.crew} trade={trade} proposal={m.trade?.proposalId !== undefined ? proposals[m.trade.proposalId] : undefined} policy={st.policy} assets={st.assets} hub={HUB} onDone={onDone} />;
  } else {
    body = <div className={`msg ${mine ? 'mine' : ''}`}>
      <Avatar id={m.account} />
      <div>
        <div className="msg-meta"><b>{mine ? 'You' : shortName(m.account)}</b><span>{time}</span>{m.sig && <span className="signed" title={`ed25519 signature by ${m.publicKey}, an access key on ${m.account}`}><Icon name="check" size={11} />signed</span>}</div>
        <div className="bubble">{m.text.startsWith('/') ? <span className="cmd">{m.text}</span> : m.text}</div>
      </div>
    </div>;
  }
  return <>{showDay && <div className="daysep">{new Date(m.ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>}{body}</>;
}
