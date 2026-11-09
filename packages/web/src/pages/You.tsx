import { useState } from 'react';
import { vaultNav } from '@kumi/sdk';
import { useWorld, type CrewState } from '../lib/api';
import { follows, signed, stakes } from '../lib/activity';
import { setSession, useSession } from '../lib/session';
import { Acct, Art, Avatar, Icon, Link, State } from '../ui/bits';
import { Head } from '../ui/Head';
import { FollowSheet, JoinSheet, QuitSheet } from '../ui/Sheets';

type Sheet = { kind: 'join' | 'quit' | 'follow'; st: CrewState; shares?: bigint } | null;

export function You({ desktop, onSignIn }: { desktop: boolean; onSignIn: () => void }) {
  const me = useSession();
  const world = useWorld();
  const [sheet, setSheet] = useState<Sheet>(null);
  const mine = world.data ? stakes(world.data, me) : [];
  const fol = world.data ? follows(world.data, me) : [];
  const invites = world.data && me ? world.data.crews.filter(st => st.crew.allowed.includes(me.accountId) && !mine.some(m => m.st.crew.id === st.crew.id)) : [];

  return <div className={desktop ? 'web-page' : 'ph-page'}>
    <Head world={world.data} desktop={desktop} onSignIn={onSignIn} onRefresh={world.reload} refreshing={world.loading} />
    {!me ? <div className="state" style={{ alignItems: 'center' }}>
      <div style={{ width: 132, height: 92, borderRadius: 16, overflow: 'hidden', flex: 'none' }}><Art name="kumi-og" alt="" /></div>
      <div><h3>Join with your email</h3><p>No wallet, no seed phrase. Kumi makes you a NEAR testnet account, keeps its key in this browser and pays your gas.</p><button className="pill-coral" onClick={onSignIn}>Sign in with email</button></div>
    </div> : <>
      <div className="you-id">
        <Avatar id={me.accountId} size="lg" />
        <div><b>{me.handle}</b><Acct id={me.accountId} /></div>
        <button className="text-btn" onClick={() => { if (confirm(`Sign out ${me.accountId}? Its key lives only in this browser; you can't sign back in from here without it.`)) setSession(null); }}><Icon name="exit" size={16} />Sign out</button>
      </div>
      <h2 className="sec-title">Your crews</h2>
      {world.error && !world.data ? <State kind="error" title="Could not read the hub" action={<button className="pill-light" onClick={world.reload}>Retry</button>}>{world.error}</State>
        : !world.data ? <div className="skeleton" style={{ height: 120 }} />
        : mine.length === 0 && invites.length === 0 ? <State kind="empty" title="No crew yet" action={<Link to="/app" className="pill-light">See the crews</Link>}>Crews are invite-only: a member adds you when the crew is created. Anyone can follow a crew's vault.</State>
        : <ul className="pos-list">
          {mine.map(({ st, share, near }) => <li key={st.crew.id} className="pos-card">
            <header><span className="crew-dot" style={{ width: 40, height: 40, borderRadius: 14, fontSize: 16 }}>{st.crew.name.slice(0, 1)}</span>
              <div><b>{st.crew.name}</b><span>{(share.bps / 100).toFixed(2)}% of the crew · <span className={st.pnl.returnPct >= 0 ? 'pos' : 'neg'}>{signed(st.pnl.returnPct)}</span> all time</span></div>
              <span className="pos-num">{near.toFixed(4)}<small>NEAR</small></span></header>
            <div className="pastels">
              <Link to={`/chat/${st.crew.id}`} className="pastel pastel-lilac"><Icon name="chat" size={15} />Open chat</Link>
              <button className="pastel pastel-coral" onClick={() => setSheet({ kind: 'quit', st, shares: share.shares })}><Icon name="exit" size={15} />Ragequit</button>
            </div>
          </li>)}
          {invites.map(st => <li key={st.crew.id} className="pos-card">
            <header><span className="crew-dot" style={{ width: 40, height: 40, borderRadius: 14, fontSize: 16 }}>{st.crew.name.slice(0, 1)}</span>
              <div><b>{st.crew.name}</b><span>Invited · no deposit yet</span></div></header>
            <div className="pastels"><Link to={`/chat/${st.crew.id}`} className="pastel pastel-lilac"><Icon name="chat" size={15} />Open chat</Link><button className="pastel pastel-butter" onClick={() => setSheet({ kind: 'join', st })}><Icon name="jar" size={15} />Join</button></div>
          </li>)}
        </ul>}
      {fol.length > 0 && <>
        <h2 className="sec-title">Following</h2>
        <ul className="pos-list">{fol.map(({ st, shares }) => {
          const supply = BigInt(st.crew.vault_supply);
          const worth = supply > 0n ? Number(vaultNav(st.crew, st.marks) * shares / supply) / 1e24 : 0;
          return <li key={st.crew.id} className="pos-card">
            <header><span className="crew-dot" style={{ width: 40, height: 40, borderRadius: 14, fontSize: 16, background: 'var(--p-lilac)' }}>{st.crew.name.slice(0, 1)}</span>
              <div><b>{st.crew.name} vault</b><span>{(Number(shares * 10_000n / (supply || 1n)) / 100).toFixed(2)}% of the follower vault</span></div>
              <span className="pos-num">{worth.toFixed(4)}<small>NEAR</small></span></header>
            <div className="pastels" style={{ gridTemplateColumns: '1fr' }}><button className="pastel pastel-coral" onClick={() => setSheet({ kind: 'follow', st })}><Icon name="star" size={15} />Manage follow</button></div>
          </li>;
        })}</ul>
      </>}
    </>}
    {sheet?.kind === 'join' && me && <JoinSheet st={sheet.st} me={me} onClose={() => setSheet(null)} onDone={world.reload} />}
    {sheet?.kind === 'quit' && me && sheet.shares !== undefined && <QuitSheet st={sheet.st} me={me} shares={sheet.shares} onClose={() => setSheet(null)} onDone={world.reload} />}
    {sheet?.kind === 'follow' && <FollowSheet st={sheet.st} me={me} onSignIn={onSignIn} onClose={() => setSheet(null)} onDone={world.reload} />}
  </div>;
}
