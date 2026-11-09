import { useEffect, useState, type ReactNode, type MouseEvent } from 'react';
import { formatNear, formatUnits, txUrl, accountUrl, type Asset } from '@kumi/sdk';

export function navigate(to: string) {
  if (location.pathname + location.search === to) return;
  history.pushState(null, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
  const hash = to.split('#')[1];
  if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  else window.scrollTo({ top: 0 });
}
export function Link({ to, children, className, ...rest }: { to: string; children: ReactNode; className?: string; 'aria-current'?: 'page'; 'aria-label'?: string; title?: string }) {
  const onClick = (e: MouseEvent) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); navigate(to); };
  return <a href={to} className={className} {...rest} onClick={onClick}>{children}</a>;
}

export function useMedia(query: string) {
  const [match, setMatch] = useState(() => matchMedia(query).matches);
  useEffect(() => { const mq = matchMedia(query); const on = () => setMatch(mq.matches); mq.addEventListener('change', on); on(); return () => mq.removeEventListener('change', on); }, [query]);
  return match;
}

/** Generated art with an intentional gradient stand-in if the file is missing. */
export function Art({ name, alt, className, eager }: { name: string; alt: string; className?: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={`art-fallback ${className ?? ''}`} role="img" aria-label={alt} />;
  return <img className={className} src={`/art/${name}.webp`} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />;
}

/** A clay die-cut sticker: a crop of Kumi's art on a cream backing. */
export function Sticker({ name, className }: { name: string; className?: string }) {
  const [ok, setOk] = useState(true);
  return <div className={`sticker ${className ?? ''}`} aria-hidden="true">
    <div className="sticker-face">{ok ? <img src={`/art/kumi-st-${name}.webp`} alt="" decoding="async" onError={() => setOk(false)} /> : <div className="art-fallback" />}</div>
  </div>;
}

const HUES = ['#ff7a59', '#ffd36e', '#ffb38a', '#f5a3c7', '#c9a7ff', '#9fe0c6'];
export function shortName(accountId: string) { return accountId.split('.')[0]; }
export function Avatar({ id, size, initial }: { id: string; size?: 'lg' | 'sm'; initial?: boolean }) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return <span className={`avatar ${size ? `avatar-${size}` : ''}`} style={{ background: HUES[h % HUES.length] }} aria-hidden>{shortName(id).slice(0, initial ? 1 : 2)}</span>;
}
export function Avatars({ ids, max = 4 }: { ids: string[]; max?: number }) {
  return <span className="avs" aria-label={ids.map(shortName).join(', ')}>{ids.slice(0, max).map(a => <Avatar key={a} id={a} initial />)}{ids.length > max && <span className="avatar avatar-more">+{ids.length - max}</span>}</span>;
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

export function State({ kind, title, children, action }: { kind: 'loading' | 'empty' | 'error' | 'setup'; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className={`state state-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <span className="state-mark" aria-hidden="true">{kind === 'loading' ? <i className="pulse" /> : kind === 'error' ? '!' : kind === 'setup' ? '◇' : '○'}</span>
    <div><h3>{title}</h3>{children && <p>{children}</p>}{action}</div>
  </div>;
}

export function Mark({ size = 30 }: { size?: number }) {
  return <span className="mark" style={{ width: size, height: size }} aria-hidden="true"><i /></span>;
}
export function Wordmark({ small }: { small?: boolean }) {
  return <span className={`wordmark ${small ? 'wordmark-sm' : ''}`}><Mark size={small ? 26 : 30} /><span className="wm">Kumi<small>組</small></span></span>;
}

/** Center-zero bar for a return in percent. */
export function PnlBar({ pct, label, scale }: { pct: number | null; label: ReactNode; scale?: number }) {
  const s = Math.max(scale ?? 0, Math.abs(pct ?? 0), 2);
  const w = pct === null ? 0 : Math.min(50, (Math.abs(pct) / s) * 50);
  return <div className="pnl-bar">
    <div className="split-row"><span className="split-l">{label}</span>
      <span className="split-v">{pct === null ? <span className="faint">Loading…</span> : <><b className={pct >= 0 ? 'pos' : 'neg'}>{pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%</b></>}</span></div>
    <div className="pnl-track" role="img" aria-label={pct === null ? 'Loading' : `${pct.toFixed(2)} percent`}>
      <i className="pnl-zero" />
      {pct !== null && <span className={pct >= 0 ? 'pnl-up' : 'pnl-down'} style={pct >= 0 ? { left: '50%', width: `${Math.max(w, 1.5)}%` } : { right: '50%', width: `${Math.max(w, 1.5)}%` }} />}
    </div>
  </div>;
}

/** Approve / reject / still-needed seats for a Sputnik vote. */
export function VoteBar({ approve, reject, needed, members }: { approve: number; reject: number; needed: number; members: number }) {
  const rest = Math.max(0, members - approve - reject);
  return <div className="vote-bar">
    <div className="split-row"><span className="split-l">{approve >= needed ? 'Passed' : `${needed - approve} more ${needed - approve === 1 ? 'approval' : 'approvals'} to pass`}</span>
      <span className="split-v"><b className="pos">{approve}</b> for · <b className="neg">{reject}</b> against</span></div>
    <div className="split-track" role="img" aria-label={`${approve} approve, ${reject} reject, ${needed} needed of ${members}`}>
      {approve > 0 && <span className="yes" style={{ flexGrow: approve }} />}
      {rest > 0 && <span className="rest" style={{ flexGrow: rest }} />}
      {reject > 0 && <span className="no" style={{ flexGrow: reject }} />}
    </div>
  </div>;
}

const paths: Record<string, string> = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowUp: 'M7 17L17 7M9 7h8v8',
  arrowDown: 'M7 7l10 10M17 9v8H9',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  chevL: 'M15 6l-6 6 6 6',
  chevR: 'M9 6l6 6-6 6',
  crews: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0',
  chat: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-4 3.5V17H6a2 2 0 0 1-2-2z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4',
  book: 'M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9',
  refresh: 'M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4',
  jar: 'M8 3h8M7 6h10M7 6l-1 3v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9l-1-3M9 13h6',
  star: 'M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z',
  send: 'M4 12l16-8-6 16-2.5-6.5L4 12z',
  plus: 'M12 6v12M6 12h12',
  exit: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  key: 'M14.5 9.5a4.5 4.5 0 1 0-3.9 4.46L10 15h-2v2H6v2H3v-3l6.04-6.04A4.5 4.5 0 0 0 14.5 9.5zM15.5 8.5h.01',
  thumb: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7',
  thumbDown: 'M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 7.2 4H17',
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
