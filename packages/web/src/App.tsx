import { useEffect, useState } from 'react';
import { accountUrl } from '@kumi/sdk';
import { SignIn } from './ui/SignIn';
import { Landing } from './pages/Landing';
import { Crews } from './pages/Crews';
import { Chat } from './pages/Chat';
import { CrewPage } from './pages/CrewPage';
import { You } from './pages/You';
import { Avatar, Icon, Link, Wordmark, useMedia } from './ui/bits';
import { HUB, useWorld } from './lib/api';
import { useSession } from './lib/session';

type Page = 'home' | 'crews' | 'season' | 'chat' | 'crew' | 'you';

function useRoute() {
  const [path, setPath] = useState(location.pathname + location.search);
  useEffect(() => { const on = () => setPath(location.pathname + location.search); addEventListener('popstate', on); return () => removeEventListener('popstate', on); }, []);
  return path;
}

function Sidebar({ page, chatId, onSignIn }: { page: Page; chatId: number | null; onSignIn: () => void }) {
  const me = useSession();
  const world = useWorld();
  const crews = world.data?.hub.crews ?? [];
  const cur = (p: Page) => (page === p ? 'page' : undefined);
  return <aside className="side">
    <Link to="/" className="side-logo" aria-label="Kumi home"><Wordmark small /></Link>
    <nav aria-label="App">
      <Link to="/app" aria-current={cur('crews')}><Icon name="crews" /><span>Crews</span></Link>
      <Link to="/leaderboard" aria-current={cur('season')}><Icon name="trophy" /><span>Season</span></Link>
      <Link to="/you" aria-current={cur('you')}><Icon name="user" /><span>You</span></Link>
      <Link to="/#how"><Icon name="book" /><span>How it works</span></Link>
    </nav>
    <div>
      <p className="side-sec">Crew chats</p>
      <nav aria-label="Crew chats">
        {crews.length === 0 && <span className="side-sec" style={{ textTransform: 'none', letterSpacing: 0 }}>{world.error ? 'Hub unreadable' : world.data ? 'No crews yet' : 'Loading…'}</span>}
        {crews.map(c => <Link key={c.id} to={`/chat/${c.id}`} aria-current={(page === 'chat' && chatId === c.id) || (page === 'crew' && chatId === c.id) ? 'page' : undefined}><span className="crew-dot">{c.name.slice(0, 1)}</span><span>{c.name}</span></Link>)}
      </nav>
    </div>
    <div className="side-foot">
      <span className="net"><i className="live-dot" />NEAR testnet</span>
      <a href={accountUrl(HUB)} target="_blank" rel="noreferrer" className="mono">{HUB.length > 26 ? `${HUB.slice(0, 12)}…${HUB.slice(-10)}` : HUB} <Icon name="external" size={11} /></a>
      {me ? <Link to="/you" className="side-me"><Avatar id={me.accountId} /><div><b>{me.handle}</b><small>{me.accountId}</small></div></Link>
        : <button className="pill-ink pill-block" onClick={onSignIn}>Sign in with email</button>}
    </div>
  </aside>;
}

function TabBar({ page, chatTo }: { page: Page; chatTo: string }) {
  const tabs: { p: Page; to: string; label: string; icon: string }[] = [
    { p: 'crews', to: '/app', label: 'Crews', icon: 'crews' },
    { p: 'chat', to: chatTo, label: 'Chat', icon: 'chat' },
    { p: 'you', to: '/you', label: 'You', icon: 'user' },
  ];
  const active = page === 'season' || page === 'crew' ? 'crews' : page;
  return <nav className="tabbar" aria-label="App">
    {tabs.map(t => <Link key={t.p} to={t.to} className="tab" aria-current={active === t.p ? 'page' : undefined}><Icon name={t.icon} size={20} /><span>{t.label}</span></Link>)}
  </nav>;
}

export function App() {
  const path = useRoute();
  const [signIn, setSignIn] = useState(false);
  const desktop = useMedia('(min-width: 960px)');
  const me = useSession();
  const world = useWorld();
  const open = () => setSignIn(true);

  const [pathname, search] = path.split('?');
  const legacyCrew = pathname === '/app' ? new URLSearchParams(search ?? '').get('crew') : null;
  useEffect(() => { if (legacyCrew !== null) { history.replaceState(null, '', `/chat/${legacyCrew}`); dispatchEvent(new PopStateEvent('popstate')); } }, [legacyCrew]);

  const chatMatch = pathname.match(/^\/chat(?:\/(\d+))?\/?$/);
  const crewMatch = pathname.match(/^\/crew\/(\d+)/);
  const page: Page = chatMatch ? 'chat' : crewMatch ? 'crew' : pathname.startsWith('/app') ? 'crews' : pathname.startsWith('/leaderboard') ? 'season' : pathname.startsWith('/you') ? 'you' : 'home';
  // The chat tab opens the signed-in player's crew, else the first crew on the hub.
  const crews = world.data?.hub.crews ?? [];
  const myCrew = (me && crews.find(c => c.allowed.includes(me.accountId))?.id) ?? crews[0]?.id ?? null;
  const chatId = chatMatch?.[1] !== undefined ? Number(chatMatch[1]) : crewMatch ? Number(crewMatch[1]) : myCrew;

  useEffect(() => {
    const t: Record<Page, string> = { home: 'Kumi · Your group chat is a fund', crews: 'Kumi · Crews', season: 'Kumi · Season', chat: 'Kumi · Crew chat', crew: 'Kumi · Crew', you: 'Kumi · You' };
    document.title = t[page];
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', page !== 'home' && desktop ? '#f7efeb' : '#1b0e1f');
  }, [page, desktop]);

  const modal = signIn && <SignIn onClose={() => setSignIn(false)} />;
  if (page === 'home') return <div className="site"><a className="skip" href="#main">Skip to content</a><Landing onSignIn={open} />{modal}</div>;

  let body;
  if (page === 'crews' || page === 'season') body = <Crews desktop={desktop} tab={page === 'season' ? 'season' : 'crews'} onSignIn={open} />;
  else if (page === 'chat') body = chatId === null ? <Crews desktop={desktop} tab="crews" onSignIn={open} /> : <Chat key={chatId} crewId={chatId} desktop={desktop} onSignIn={open} />;
  else if (page === 'crew') body = <CrewPage crewId={Number(crewMatch![1])} desktop={desktop} onSignIn={open} />;
  else body = <You desktop={desktop} onSignIn={open} />;

  return <div className={desktop ? 'app-web' : 'app-phone'}>
    <a className="skip" href="#main">Skip to content</a>
    {desktop && <Sidebar page={page} chatId={chatId} onSignIn={open} />}
    <main id="main" className="app-main">{body}</main>
    {!desktop && <TabBar page={page} chatTo={chatId !== null ? `/chat/${chatId}` : '/chat'} />}
    {modal}
  </div>;
}

