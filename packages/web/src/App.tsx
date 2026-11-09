import { useEffect, useState } from 'react';
import { TopNav } from './ui/bits';
import { SignIn } from './ui/SignIn';
import { Landing } from './pages/Landing';
import { Room } from './pages/Room';
import { Lobby } from './pages/Lobby';
import { CrewPage } from './pages/CrewPage';
import { Leaderboard } from './pages/Leaderboard';

export function App() {
  const [path, setPath] = useState(location.pathname);
  const [signIn, setSignIn] = useState(false);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  const open = () => setSignIn(true);
  // Old links: /app?crew=N opened the chat; it now lives at /room.
  useEffect(() => {
    if (path === '/app' && new URLSearchParams(location.search).has('crew')) { history.replaceState(null, '', `/room${location.search}`); dispatchEvent(new PopStateEvent('popstate')); }
  }, [path]);
  const crew = path.match(/^\/crew\/(\d+)/);
  let page;
  if (path === '/app') page = <Lobby onSignIn={open} />;
  else if (path === '/room') page = <Room onSignIn={open} />;
  else if (path === '/leaderboard') page = <Leaderboard />;
  else if (crew) page = <CrewPage crewId={Number(crew[1])} onSignIn={open} />;
  else page = <Landing onSignIn={open} />;
  return (
    <>
      {path !== '/app' && <TopNav path={path} onSignIn={open} />}
      {page}
      {signIn && <SignIn onClose={() => setSignIn(false)} />}
    </>
  );
}
