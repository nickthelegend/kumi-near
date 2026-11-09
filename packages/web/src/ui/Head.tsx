import type { ReactNode } from 'react';
import type { World } from '../lib/api';
import { stakes } from '../lib/activity';
import { useSession } from '../lib/session';
import { Avatar, Icon, Link, Wordmark } from './bits';

/** Crew balance header: the player's live stake across crews, or every crew's NAV for a guest. */
export function Head({ world, desktop, onSignIn, onDeposit, onRefresh, refreshing, title }: {
  world: World | undefined; desktop: boolean; onSignIn: () => void; onDeposit?: () => void; onRefresh?: () => void; refreshing?: boolean; title?: ReactNode;
}) {
  const me = useSession();
  const mine = world ? stakes(world, me) : [];
  const total = world ? (me ? mine.reduce((a, s) => a + s.near, 0) : world.crews.reduce((a, s) => a + s.pnl.navNear, 0)) : null;
  const label = me ? (mine.length ? `Your stake in ${mine.length} ${mine.length === 1 ? 'crew' : 'crews'}` : 'Your crew balance') : `All crews · ${world?.crews.length ?? '…'} on testnet`;
  const [whole, frac] = total === null ? ['', ''] : total.toFixed(4).split('.');
  const amount = total === null ? <p className="bal bal-empty">Loading…</p>
    : <p className="bal">{whole}<span className="bal-frac">.{frac}</span><small> NEAR</small></p>;
  const action = !me ? <button className={desktop ? 'pill-ink' : 'pill-light'} onClick={onSignIn}>Sign in</button>
    : onDeposit ? <button className={desktop ? 'pill-ink' : 'pill-light'} onClick={onDeposit}><Icon name="plus" size={16} />Deposit</button>
    : <Link to="/you" className={desktop ? 'pill-ink' : 'pill-light'}>Your crews</Link>;

  if (desktop) return <header className="web-head">
    <div className="web-head-row">
      <Link to="/" className="wordmark" aria-label="Kumi home"><span className="wm">{title ?? <>Kumi<small>組</small></>}</span></Link>
      <div className="web-head-tools">
        <span className="net"><i className="live-dot" />Testnet</span>
        {onRefresh && <button className="icon-round" onClick={onRefresh} aria-label="Refresh from chain" disabled={refreshing}><Icon name="refresh" size={16} /></button>}
      </div>
    </div>
    <div className="web-bal"><div><p className="lbl">{label}</p>{amount}</div>{action}</div>
  </header>;

  return <header className="ph-head">
    <div className="ph-top">
      <Link to="/" aria-label="Kumi home"><Wordmark /></Link>
      {me ? <Link to="/you" aria-label="You"><Avatar id={me.accountId} /></Link> : <span className="net"><i className="live-dot" />Testnet</span>}
    </div>
    <div className="ph-bal"><div><p className="lbl">{label}</p>{amount}</div>{action}</div>
  </header>;
}
