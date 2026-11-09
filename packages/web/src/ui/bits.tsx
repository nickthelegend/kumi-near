import { useState, type ReactNode } from 'react';
import { formatNear, formatUnits, txUrl, accountUrl, type Asset } from '@kumi/sdk';
import { useSession, setSession } from '../lib/session';

export function navigate(to: string) {
  history.pushState(null, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}
export function Link({ to, children, className, ...rest }: { to: string; children: ReactNode; className?: string; 'aria-current'?: 'page' }) {
  return <a href={to} className={className} {...rest} onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(to); }}>{children}</a>;
}

/** Generated art with an intentional gradient stand-in if the file is missing. */
export function Art({ name, alt, className, eager }: { name: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`art-fallback ${className ?? ''}`} role="img" aria-label={alt} />;
  return <img className={className} src={`/art/${name}.webp`} alt={alt} loading={eager ? 'eager' : 'lazy'} onError={() => setFailed(true)} />;
}

const HUES = ['#ff7a59', '#ffd36e', '#ffb38a', '#f5a3c7', '#c9a7ff', '#9fe0c6'];
export function shortName(accountId: string) { return accountId.split('.')[0]; }
export function Avatar({ id, size }: { id: string; size?: 'lg' }) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`avatar ${size === 'lg' ? 'avatar-lg' : ''}`} style={{ background: HUES[h % HUES.length] }} aria-hidden>{shortName(id).slice(0, 2)}</span>;
}

export const Near = ({ y, d = 3 }: { y: bigint | string; d?: number }) => <span className="mono">{formatNear(y, d)}<span className="faint"> NEAR</span></span>;
export const Units = ({ amount, asset, d = 4 }: { amount: bigint | string; asset: Asset | undefined; d?: number }) =>
  <span className="mono">{asset ? formatUnits(amount, asset.decimals, d) : String(amount)}<span className="faint"> t{asset?.symbol ?? ''}</span></span>;

export function Tx({ hash, label }: { hash: string; label?: string }) {
  return <a className="hash" href={txUrl(hash)} target="_blank" rel="noreferrer" title={`${label ?? 'transaction'} ${hash} on NearBlocks (testnet)`}>{label ? `${label} · ` : ''}{hash.slice(0, 6)}…{hash.slice(-4)}</a>;
}
export function Acct({ id }: { id: string }) {
  return <a className="hash" href={accountUrl(id)} target="_blank" rel="noreferrer">{id}</a>;
}

export function Notice({ children, error }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? 'notice-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}

export function Brand() {
  return <Link to="/" className="brand"><span className="brand-mark"><i /></span>Kumi<small>組</small></Link>;
}

export function TopNav({ path, onSignIn }: { path: string; onSignIn: () => void }) {
  const s = useSession();
  const cur = (p: string) => (path === p || (p !== '/' && path.startsWith(p)) ? 'page' : undefined);
  return (
    <header className="nav">
      <div className={`nav-in ${path === '/app' ? 'wide' : ''}`}>
        <Brand />
        <nav className="nav-links" aria-label="Main">
          <Link to="/app" aria-current={cur('/app')}>Crew room</Link>
          <Link to="/leaderboard" aria-current={cur('/leaderboard')}>Season</Link>
          <Link to="/crew/0" aria-current={cur('/crew')}>Follow a crew</Link>
          <a href="/#proof">Proof</a>
        </nav>
        <div className="nav-right">
          {s ? (
            <button className="who" onClick={() => { if (confirm(`Sign out ${s.accountId}? Your key stays only if you saved it.`)) setSession(null); }} title={s.accountId}>
              <Avatar id={s.accountId} /><span className="h">{s.handle}</span>
            </button>
          ) : <button className="btn btn-sm" onClick={onSignIn}>Sign in</button>}
          {path === '/' && <Link to="/app" className="btn btn-primary btn-sm">Open app</Link>}
        </div>
      </div>
    </header>
  );
}

export const Icon = {
  send: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 12l16-8-6 16-2.5-6.5L4 12z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>,
  up: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M7 11l5-5 5 5M12 6v13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>,
  check: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>,
  arrow: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>,
};
