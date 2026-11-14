import { useState, type ReactNode } from 'react';
import { formatNear, formatUnits, txUrl, accountUrl, type Asset } from '@kumi/sdk';
import { useSession, setSession } from '../lib/session';

export function navigate(to: string) {
  history.pushState(null, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}
export function Link({ to, children, className, style, ...rest }: { to: string; children: ReactNode; className?: string; style?: React.CSSProperties; 'aria-current'?: 'page'; 'aria-label'?: string; title?: string }) {
  return <a href={to} className={className} style={style} {...rest} onClick={e => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(to); }}>{children}</a>;
}

/** Generated art: tries each name in order (new set first), then an intentional gradient. */
export function Art({ name, alt, className, eager }: { name: string | string[]; alt: string; className?: string; eager?: boolean }) {
  const names = Array.isArray(name) ? name : [name];
  const [i, setI] = useState(0);
  if (i >= names.length) return <div className={`art-fallback ${className ?? ''}`} role="img" aria-label={alt} />;
  return <img key={names[i]} className={className} src={`/art/${names[i]}.webp`} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" onError={() => setI(n => n + 1)} />;
}

export const TONES = ['coral', 'butter', 'mint', 'pink'] as const;
export type Tone = (typeof TONES)[number];
const ANIMALS = ['owl', 'fox', 'bear', 'frog'];
/** Each crew gets a colour and a clay animal, stable by id. */
export const crewTone = (id: number): Tone => TONES[id % TONES.length];
export function CrewAvatar({ id, name, size }: { id: number; name: string; size?: 'lg' | 'sm' }) {
  const [ok, setOk] = useState(true);
  return <span className={`crew-av tone-${crewTone(id)} ${size ? `crew-av-${size}` : ''}`} aria-hidden>
    {ok ? <img src={`/art/kumi3-av-${ANIMALS[id % ANIMALS.length]}.webp`} alt="" onError={() => setOk(false)} /> : name.slice(0, 1)}
  </span>;
}

const HUES = ['#ff6f59', '#ffd166', '#3ddc97', '#ff8fc7', '#b69cff', '#7cc8ff'];
export function shortName(accountId: string) { return accountId.split('.')[0]; }
const MASCOT_SET = ['owl', 'fox', 'bear', 'frog'];
const hashOf = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
/** Every member is one of the clay crew mascots, picked from their account id. */
export const mascotOf = (id: string) => MASCOT_SET[hashOf(id) % MASCOT_SET.length];
export function Avatar({ id, size, initial }: { id: string; size?: 'lg'; initial?: boolean }) {
  const [ok, setOk] = useState(true);
  return <span className={`avatar ${size === 'lg' ? 'avatar-lg' : ''} ${ok ? 'avatar-m' : ''}`} style={{ background: HUES[hashOf(id) % HUES.length] }} title={shortName(id)} aria-hidden>
    {ok ? <img src={`/art/kumi3-av-${mascotOf(id)}.webp`} alt="" onError={() => setOk(false)} /> : shortName(id).slice(0, initial ? 1 : 2)}
  </span>;
}
export const memberHue = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };

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
  if (error) return <div className="notice notice-error notice-obj" role="alert"><Obj name="warning" size={34} still /><div>{children}</div></div>;
  return <div className="notice" role="status">{children}</div>;
}

export type ObjName = 'captain' | 'chat' | 'coins' | 'crown' | 'door' | 'empty' | 'hourglass' | 'jar' | 'mark' | 'rocket' | 'shield' | 'success' | 'vote' | 'warning';
/** One object from the 3D kit (public/art/3d): fixed size, gentle float unless `still` or reduced motion. */
export function Obj({ name, size = 64, alt, className, still }: { name: ObjName; size?: number; alt?: string; className?: string; still?: boolean }) {
  return <img className={`obj ${still ? 'obj-still' : ''} ${className ?? ''}`} src={`/art/3d/kumi-3d-${name}.webp`} width={size} height={size} alt={alt ?? ''} aria-hidden={alt ? undefined : true} loading="lazy" decoding="async" />;
}

/** A small empty state inside a side-panel card: one object and a line of text. */
export function MiniEmpty({ obj, children }: { obj: ObjName; children: ReactNode }) {
  return <div className="mini-empty"><Obj name={obj} size={56} /><p className="mini">{children}</p></div>;
}

/** A finished on-chain action: the success object and the transaction. */
export function Done({ obj = 'success', children }: { obj?: ObjName; children: ReactNode }) {
  return <div className="done-row" role="status"><Obj name={obj} size={44} />{children}</div>;
}

/** A small clay sticker that simply stays out of the way until its art file exists. */
export function Sticker({ name, className }: { name: string; className?: string }) {
  const [ok, setOk] = useState(true);
  return ok ? <img className={`sticker ${className ?? ''}`} src={`/art/${name}.webp`} alt="" aria-hidden loading="lazy" onError={() => setOk(false)} /> : null;
}

/** A designed empty state with clay art. */
export function EmptyArt({ art, title, children, action }: { art: string | string[]; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-art"><div className="img"><Art name={art} alt="" /></div><h4>{title}</h4>{children && <p>{children}</p>}{action}</div>;
}

export function Brand() {
  return <Link to="/" className="brand" aria-label="Kumi home"><span className="brand-mark"><i /></span>Kumi<small>組</small></Link>;
}

export function TopNav({ path, onSignIn }: { path: string; onSignIn: () => void }) {
  const s = useSession();
  const cur = (p: string) => (path === p || (p !== '/' && path.startsWith(p)) ? 'page' : undefined);
  return (
    <header className="nav">
      <div className={`nav-in ${path.startsWith('/room') ? 'wide' : ''}`}>
        <Brand />
        <nav className="nav-links" aria-label="Main">
          <Link to="/app" aria-current={cur('/app')}><Ic name="crews" size={16} />Lobby</Link>
          <Link to="/room" aria-current={cur('/room')}><Ic name="chat" size={16} />Crew chat</Link>
          <Link to="/leaderboard" aria-current={cur('/leaderboard')}><Ic name="trophy" size={16} />Season</Link>
          <Link to="/crew/0" aria-current={cur('/crew')}><Ic name="star" size={16} />Follow a crew</Link>
        </nav>
        <div className="nav-right">
          <span className="net-pill"><i />NEAR testnet</span>
          {s ? (
            <button className="who" onClick={() => { if (confirm(`Sign out ${s.accountId}? Its key lives only in this browser.`)) setSession(null); }} title={`${s.accountId} · click to sign out`}>
              <Avatar id={s.accountId} /><span className="who-label">{s.handle}</span>
            </button>
          ) : <button className="btn btn-sm btn-plum" onClick={onSignIn}>Sign in</button>}
          {path === '/' && <Link to="/app" className="btn btn-primary btn-sm">Open app</Link>}
        </div>
      </div>
    </header>
  );
}

const paths: Record<string, string> = {
  send: 'M4 12l16-8-6 16-2.5-6.5L4 12z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  dl: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  phone: 'M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2zM11 18h2',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  up: 'M7 17L17 7M9 7h8v8',
  down: 'M7 7l10 10M17 9v8H9',
  chat: 'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-4 3.5V17H6a2 2 0 0 1-2-2z',
  crews: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2.5 19a5.5 5.5 0 0 1 11 0M10.5 19a5.5 5.5 0 0 1 11 0',
  jar: 'M8 3h8M7 6h10M7 6l-1 3v9a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V9l-1-3M9 13h6',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7M10 17h4',
  star: 'M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z',
  thumb: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 16.8 20H7',
  thumbDown: 'M17 13V4h3v9zM17 13l-4 7a2 2 0 0 1-2-2v-4H6a2 2 0 0 1-2-2.3l1.2-6A2 2 0 0 1 7.2 4H17',
  exit: 'M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10',
  plus: 'M12 6v12M6 12h12',
  key: 'M14.5 9.5a4.5 4.5 0 1 0-3.9 4.46L10 15h-2v2H6v2H3v-3l6.04-6.04A4.5 4.5 0 0 0 14.5 9.5zM15.5 8.5h.01',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  chart: 'M4 19h16M6 15l4-4 3 3 5-6',
  bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  book: 'M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
};
export function Ic({ name, size = 18 }: { name: string; size?: number }) {
  return <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
/** Kept for older call sites. */
export const Icon = { send: <Ic name="send" size={19} />, up: <Ic name="up" size={16} />, check: <Ic name="check" size={12} />, arrow: <Ic name="arrow" size={18} /> };
