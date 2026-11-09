import { useEffect, useMemo, useRef, useState } from 'react';
import { accountUrl, formatNear, getProposal, memberShare, type Proposal } from '@kumi/sdk';
import { HUB, readCrew, readHub, readProposals, useAsync, useChat, useConfig, type ChatMessage } from '../lib/api';
import { makeCaptainKey, signedChat, useSession, type Session } from '../lib/session';
import { relay, vote } from '../ui/actions';
import { Art, Avatar, Icon, Link, Notice, shortName, Tx } from '../ui/bits';
import { FundPane } from '../ui/Fund';
import { TradeCard } from '../ui/TradeCard';

const HINTS = ['/buy SOL 20%', '/sell SOL 50%', '/buy BTC 10%', '/captain buy SOL 5%'];

export function Room({ onSignIn }: { onSignIn: () => void }) {
  const me = useSession();
  const hub = useAsync(() => readHub(), [], 60_000);
  const params = new URLSearchParams(location.search);
  const wanted = params.get('crew');
  const crewId = useMemo(() => {
    const crews = hub.data?.crews ?? [];
    if (wanted !== null) return Number(wanted);
    return (me && crews.find(c => c.allowed.includes(me.accountId))?.id) ?? crews[0]?.id ?? null;
  }, [hub.data, wanted, me]);

  if (hub.error) return <div className="page"><Notice error>Could not read the Kumi hub {HUB} on NEAR testnet: {hub.error}</Notice></div>;
  if (!hub.data) return <div className="room" data-tab="chat"><div className="rail"><div className="skeleton" style={{ height: 200 }} /></div><div className="thread"><div className="messages"><div className="skeleton" style={{ height: 120 }} /><div className="skeleton" style={{ height: 220 }} /></div></div><div className="fund"><div className="skeleton" style={{ height: 260 }} /></div></div>;
  if (crewId === null) return (
    <div className="page"><div className="panel empty" style={{ padding: 48 }}>
      <div className="empty-art" style={{ width: 240, height: 160 }}><Art name="kumi-og" alt="Friends around a table" /></div>
      <h4>No crews on this hub yet</h4><p>The first crew needs a Sputnik DAO (5.5 testnet NEAR of code storage). Run <span className="mono">pnpm run:testnet</span> to create one.</p>
    </div></div>
  );
  return <CrewRoom key={crewId} crewId={crewId} me={me} onSignIn={onSignIn} />;
}

function CrewRoom({ crewId, me, onSignIn }: { crewId: number; me: Session | null; onSignIn: () => void }) {
  const [tab, setTab] = useState<'chat' | 'fund' | 'crew'>('chat');
  const st = useAsync(() => readCrew(crewId), [crewId], 15_000);
  const chat = useChat(crewId);
  const config = useConfig();
  const cardIds = chat.messages.filter(m => m.kind === 'trade' && m.trade?.proposalId !== undefined).map(m => m.trade!.proposalId!);
  const props = useAsync(() => st.data ? readProposals(st.data.crew.dao, cardIds) : Promise.resolve({} as Record<number, Proposal>), [st.data?.crew.dao, cardIds.join(','), st.data?.readAt]);
  const [text, setText] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  // Keep the newest message in view unless the reader scrolled up.
  useEffect(() => { const b = box.current; if (b && stuck.current) b.scrollTop = b.scrollHeight; }, [chat.messages, st.data?.readAt, props.data]);

  if (st.error) return <div className="page"><Notice error>{st.error}</Notice></div>;
  if (!st.data) return <div className="room" data-tab="chat"><div className="rail"><div className="skeleton" style={{ height: 200 }} /></div><div className="thread"><div className="messages"><div className="skeleton" style={{ height: 220 }} /></div></div><div className="fund"><div className="skeleton" style={{ height: 260 }} /></div></div>;
  const { crew } = st.data;
  const isMember = !!me && crew.allowed.includes(me.accountId);
  const refresh = () => { st.reload(); props.reload(); };

  async function send(t: string) {
    if (!me || !t.trim()) return;
    if (chat.send(await signedChat(me, crewId, t.trim()))) setText('');
  }

  return (
    <div className="room" data-tab={tab}>
      <Rail st={st.data} me={me} onChanged={refresh} />
      <section className="thread" aria-label="Crew chat">
        <div className="thread-head">
          <h3># {crew.name.toLowerCase().replace(/\s+/g, '-')}</h3>
          <span className={`live ${chat.status === 'live' ? '' : 'off'}`}><span className="dot" />{chat.status === 'live' ? 'live' : chat.status}</span>
          <span style={{ marginLeft: 'auto' }} className="faint mono">{crew.members.length} in · {crew.followers.length} following</span>
        </div>
        <div className="messages" aria-live="polite" ref={box} onScroll={e => { const b = e.currentTarget; stuck.current = b.scrollHeight - b.scrollTop - b.clientHeight < 80; }}>
          {chat.status === 'offline' && chat.messages.length === 0 && <Notice error>Chat is offline: the Kumi server is not running. Start it with <span className="mono">pnpm server</span>. The fund pane still reads the chain directly.</Notice>}
          {chat.status !== 'offline' && chat.messages.length === 0 && (
            <div className="empty"><div className="empty-art"><Art name="kumi-feature-chat" alt="A chat bubble becoming a trade card" /></div><h4>Quiet in here</h4>Say hi, or pitch the first trade with <span className="mono">/buy SOL 20%</span>.</div>
          )}
          {chat.messages.map((m, i) => <Message key={m.id} m={m} prev={chat.messages[i - 1]} me={me} st={st.data!} proposals={props.data ?? {}} onDone={refresh} />)}
        </div>
        <div className="composer">
          {chat.error && <div style={{ marginBottom: 10 }}><Notice error>{chat.error}</Notice></div>}
          {!me ? <button className="btn btn-primary" style={{ width: '100%' }} onClick={onSignIn}>Sign in with email to talk</button>
            : !isMember ? <Notice>You're reading as a guest. Only {crew.name} members can post; anyone can follow the crew from its public page.</Notice>
            : <>
              <div className="hints">{HINTS.map(h => <button key={h} className="hint" onClick={() => setText(h)}>{h}</button>)}</div>
              <form className="composer-box" onSubmit={e => { e.preventDefault(); void send(text); }}>
                <input value={text} onChange={e => setText(e.target.value)} placeholder="Message the crew, or /buy SOL 20%" aria-label="Message" maxLength={500} />
                <button className="send" aria-label="Send">{Icon.send}</button>
              </form>
              {config.data?.setup.liveSwaps && <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Testnet trades fill against test pools. Mainnet 1Click swaps: {config.data.setup.liveSwaps}.</div>}
            </>}
        </div>
      </section>
      <FundPane st={st.data} me={me} hub={HUB} onChanged={refresh} />
      <nav className="tabs" aria-label="Sections">
        {(['chat', 'fund', 'crew'] as const).map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'chat' ? 'Chat' : t === 'fund' ? 'Fund' : 'Crew'}</button>)}
      </nav>
    </div>
  );
}

function Message({ m, prev, me, st, proposals, onDone }: { m: ChatMessage; prev?: ChatMessage; me: Session | null; st: import('../lib/api').CrewState; proposals: Record<number, Proposal>; onDone: () => void }) {
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
    body = (
      <div className={`msg ${mine ? 'mine' : ''}`}>
        <Avatar id={m.account} />
        <div>
          <div className="msg-meta"><b>{shortName(m.account)}</b><span className="t">{time}</span>{m.sig && <span className="verified" title={`ed25519 signature by ${m.publicKey}, an access key on ${m.account}`}>{Icon.check} signed</span>}</div>
          <div className="bubble">{m.text.startsWith('/') ? <span className="cmd">{m.text}</span> : m.text}</div>
        </div>
      </div>
    );
  }
  return <>{showDay && <div className="day">{new Date(m.ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</div>}{body}</>;
}

function Rail({ st, me, onChanged }: { st: import('../lib/api').CrewState; me: Session | null; onChanged: () => void }) {
  const { crew } = st;
  const open = useAsync(async () => {
    const last = await import('@kumi/sdk').then(s => s.view<number>(crew.dao, 'get_last_proposal_id'));
    const ids = Array.from({ length: Math.min(last, 8) }, (_, i) => last - 1 - i);
    const ps = await Promise.all(ids.map(id => getProposal(crew.dao, id).catch(() => null)));
    return ps.filter((p): p is Proposal => !!p && p.status === 'InProgress' && !p.description.startsWith('Kumi trade'));
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

  return (
    <aside className="rail" aria-label="Crew">
      <div className="crew-id">
        <span className="crew-badge">{crew.name.slice(0, 1)}</span>
        <div style={{ minWidth: 0 }}><h2>{crew.name}</h2><a href={accountUrl(crew.dao)} target="_blank" rel="noreferrer" title="Sputnik DAO">{crew.dao}</a></div>
      </div>
      <div className="pills">
        <span className="chip chip-coral">Sputnik DAO v2</span>
        <span className="chip">{crew.slippage_bps / 100}% max slippage</span>
        <span className="chip">fee {crew.vault_fee_bps / 100}% over HWM</span>
      </div>
      <div>
        <div className="label" style={{ margin: '4px 8px 8px' }}>Members · strict majority votes</div>
        <ul className="member-list">
          {crew.allowed.map(a => {
            const s = memberShare(crew, a);
            return <li className="member" key={a}><Avatar id={a} /><div style={{ minWidth: 0 }}><div className="n">{shortName(a)}{crew.captain?.account_id === a && <span className="chip chip-butter" style={{ marginLeft: 6, height: 20 }}>captain</span>}</div><div className="sub">{s.shares > 0n ? `${(s.bps / 100).toFixed(1)}% of shares` : 'invited, no deposit'}</div></div></li>;
          })}
        </ul>
      </div>
      <div className="panel" style={{ padding: 16 }}>
        <div className="label">Captain lane</div>
        {crew.captain ? (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 14 }}><b style={{ color: 'var(--ink)' }}>{shortName(crew.captain.account_id)}</b> can trade up to {crew.captain.max_bps / 100}% at once, {crew.captain.max_daily} a day, in {crew.captain.assets.join(', ')}. {crew.captain_trades_today} used today. The key can call only <span className="mono">captain_trade</span>.</p>
        ) : <p className="faint" style={{ margin: '8px 0 0', fontSize: 14 }}>No captain. A vote can give one member a key for small instant trades.</p>}
        {isMember && !isCaptain && <button className="btn btn-sm" style={{ marginTop: 12, width: '100%' }} disabled={!!busy} onClick={() => act('cap', proposeMe)}>{busy === 'cap' ? 'Filing…' : 'Propose me as captain'}</button>}
      </div>
      <div>
        <div className="label" style={{ margin: '4px 8px 8px' }}>Open DAO votes</div>
        {open.loading && !open.data ? <div className="skeleton" style={{ height: 60 }} /> : (open.data ?? []).length === 0 ? <p className="faint" style={{ margin: '0 8px', fontSize: 14 }}>None open. Trade votes live in the chat.</p> :
          open.data!.map(p => (
            <div className="panel" key={p.id} style={{ padding: 14, marginBottom: 8 }}>
              <div style={{ fontSize: 14 }}>{p.description}</div>
              <div className="row-between" style={{ marginTop: 10 }}><span className="faint mono" style={{ fontSize: 11 }}>#{p.id} · {Object.keys(p.votes).length} voted</span>
                {isMember && !p.votes[me!.accountId] && <button className="btn btn-sm btn-butter" disabled={!!busy} onClick={() => act(`v${p.id}`, () => vote(me!, crew.dao, p.id, p.kind, true, crew.id))}>👍 Approve</button>}</div>
            </div>
          ))}
        {error && <Notice error>{error}</Notice>}
      </div>
      <div style={{ marginTop: 'auto' }} className="stack">
        <Link to={`/crew/${crew.id}`} className="btn btn-sm">Public page and follow</Link>
        <span className="faint mono" style={{ fontSize: 11, textAlign: 'center' }}>vault {formatNear(crew.near, 3)} NEAR · receipts {crew.receipt_count}</span>
      </div>
    </aside>
  );
}
