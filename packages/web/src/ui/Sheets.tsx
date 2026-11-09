// Bottom sheets (phone) / dialogs (desktop) for the money actions. Each is a NEP-366 delegate
// signed in this browser and relayed by the Kumi server.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { dryQuote, formatNear, formatUnits, getTokens, parseNear, ragequitPreview, vaultNav, LIVE_SWAP_SETUP } from '@kumi/sdk';
import { HUB, useAsync, type CrewState } from '../lib/api';
import type { Session } from '../lib/session';
import { ragequit, relay } from './actions';
import { Art, Avatar, Icon, Notice, shortName, Tx } from './bits';

export function Sheet({ title, children, onClose, art, label }: { title: string; children: ReactNode; onClose: () => void; art?: string; label?: string }) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', on);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', on); document.body.style.overflow = prev; };
  }, [onClose]);
  return <div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label={label ?? title}>
      {art && <div className="sheet-art"><Art name={art} alt="" eager /></div>}
      <div className="sheet-head"><h3>{title}</h3><button className="icon-round" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button></div>
      {children}
    </div>
  </div>;
}

export function JoinSheet({ st, me, onClose, onDone }: { st: CrewState; me: Session; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('0.05');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  return <Sheet title={`Chip into ${st.crew.name}`} art="kumi-feature-vote" onClose={onClose}>
    <form className="stack" style={{ gap: 14 }} onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError(null);
      try { const r = await relay(me, HUB, 'join', { crew_id: st.crew.id }, parseNear(amount), { crewId: st.crew.id, label: 'join' }); setHash(r.hash); onDone(); }
      catch (x) { setError(String(x instanceof Error ? x.message : x)); } finally { setBusy(false); }
    }}>
      <p className="sub" style={{ margin: 0 }}>Shares are minted at the live NAV, {st.pnl.pps.toFixed(4)} NEAR a share, priced from the pools on-chain. You get a vote and can ragequit any time.</p>
      <label className="field"><span>Amount (testnet NEAR)</span><input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <Notice>New players get a small testnet NEAR gift. Deposits from any chain go through 1Click on mainnet: {LIVE_SWAP_SETUP}.</Notice>
      {error && <Notice error>{error}</Notice>}
      {hash ? <><div className="done-row"><Icon name="check" /> Joined in <Tx hash={hash} /></div><button type="button" className="pill-ink pill-xl" onClick={onClose}>Done</button></>
        : <button className="pill-ink pill-xl" disabled={busy}>{busy ? 'Signing and relaying…' : `Deposit ${amount} NEAR`}</button>}
    </form>
  </Sheet>;
}

export function QuitSheet({ st, me, shares, onClose, onDone }: { st: CrewState; me: Session; shares: bigint; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'kind' | 'chain'>('kind');
  const [dest, setDest] = useState('nep141:sol.omft.near');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const preview = useMemo(() => ragequitPreview(st.crew, shares), [st.crew, shares]);
  const tokens = useAsync(() => getTokens(), []);
  const destOptions = (tokens.data ?? []).filter(t => ['sol', 'btc', 'base', 'eth', 'arb'].includes(t.blockchain) && ['SOL', 'BTC', 'USDC', 'ETH'].includes(t.symbol)).slice(0, 8);
  const quote = useAsync(async () => mode === 'chain' && preview.near > 0n ? dryQuote({ originAsset: 'nep141:wrap.near', destinationAsset: dest, amount: preview.near.toString(), recipientType: 'INTENTS' }) : null, [mode, dest, preview.near.toString()]);
  return <Sheet title="Ragequit" onClose={onClose}>
    <p className="sub" style={{ margin: '-6px 0 0' }}>Leave {st.crew.name} with your exact slice of every asset. No vote, no permission.</p>
    <dl className="receipt">
      <div><dt>NEAR</dt><dd>{formatNear(preview.near, 6)}</dd></div>
      {preview.tokens.map(t => <div key={t.symbol}><dt>t{t.symbol} <small className="faint">test pool token</small></dt><dd>{formatUnits(t.amount, st.assets.find(a => a.symbol === t.symbol)?.decimals ?? 0, 8)}</dd></div>)}
    </dl>
    <div className="seg" role="group" aria-label="Payout">
      <button aria-pressed={mode === 'kind'} onClick={() => setMode('kind')}>In kind on NEAR</button>
      <button aria-pressed={mode === 'chain'} onClick={() => setMode('chain')}>To any chain</button>
    </div>
    {mode === 'chain' && <div className="stack" style={{ gap: 10 }}>
      <label className="field"><span>Receive as</span>
        <select className="input" value={dest} onChange={e => setDest(e.target.value)}>
          {destOptions.length === 0 && <option value={dest}>SOL on Solana</option>}
          {destOptions.map(t => <option key={t.assetId} value={t.assetId}>{t.symbol} on {t.blockchain.toUpperCase()}</option>)}
        </select></label>
      {quote.loading ? <div className="skeleton" style={{ height: 52, borderRadius: 14 }} /> : quote.error ? <Notice error>1Click: {quote.error}</Notice> : quote.data && (
        <Notice>Mainnet 1Click dry quote for your NEAR: <b className="mono">{Number(quote.data.quote.amountInFormatted).toPrecision(5)} → {Number(quote.data.quote.amountOutFormatted).toPrecision(5)}</b>{quote.data.quote.amountOutUsd ? ` (~$${Number(quote.data.quote.amountOutUsd).toFixed(2)})` : ''}. Live cross-chain payout: <b>{LIVE_SWAP_SETUP}</b>. On testnet you exit in kind.</Notice>
      )}
    </div>}
    {error && <Notice error>{error}</Notice>}
    {hash ? <><div className="done-row"><Icon name="check" /> Exited in <Tx hash={hash} /></div><button className="pill-ink pill-xl" onClick={onClose}>Done</button></> : (
      <button className="pill-coral pill-xl" disabled={busy} onClick={async () => {
        setBusy(true); setError(null);
        try {
          const r = await ragequit(me, HUB, st.crew, shares, preview.tokens.map(t => ({ symbol: t.symbol, token: st.assets.find(a => a.symbol === t.symbol)!.token })));
          setHash(r.hash); onDone();
        } catch (x) { setError(String(x instanceof Error ? x.message : x)); } finally { setBusy(false); }
      }}>{busy ? 'Signing and relaying…' : 'Ragequit on testnet, in kind'}</button>
    )}
  </Sheet>;
}

/** Follower vault: a deposit mirrored into every crew trade, with a fee above the high-water mark. */
export function FollowForm({ st, me, onSignIn, onDone }: { st: CrewState; me: Session | null; onSignIn: () => void; onDone: () => void }) {
  const { crew, marks } = st;
  const [amount, setAmount] = useState('0.05');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const nav = vaultNav(crew, marks);
  const supply = BigInt(crew.vault_supply);
  const mine = me ? BigInt(crew.followers.find(f => f[0] === me.accountId)?.[1] ?? '0') : 0n;
  const pps = supply > 0n ? Number(nav * 10_000n / supply) / 10_000 : 1;
  async function act(name: string, fn: () => Promise<{ hash: string }>) {
    setBusy(name); setError(null);
    try { setHash((await fn()).hash); onDone(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(null); }
  }
  return <div className="stack" style={{ gap: 14 }}>
    <dl className="receipt">
      <div><dt>Vault NAV</dt><dd>{formatNear(nav, 4)} NEAR</dd></div>
      <div><dt>Followers</dt><dd>{crew.followers.length}</dd></div>
      <div><dt>Performance fee <small className="faint" style={{ display: 'block' }}>only above the high-water mark</small></dt><dd>{crew.vault_fee_bps / 100}%</dd></div>
      <div><dt>Fees paid to the crew</dt><dd>{formatNear(crew.vault_fees_paid, 5)} NEAR</dd></div>
    </dl>
    {crew.followers.length > 0 && <div className="done-row">{crew.followers.map(([f]) => <span key={f} className="tag"><Avatar id={f} size="sm" />{shortName(f)}</span>)}</div>}
    {!me ? <button className="pill-ink pill-xl" onClick={onSignIn}>Sign in to follow</button> : <>
      {mine > 0n && <Notice>You hold <b>{(Number(mine * 10_000n / supply) / 100).toFixed(2)}%</b> of the vault, worth about <b>{(pps * Number(mine) / 1e24).toFixed(4)} NEAR</b>.</Notice>}
      <div className="amount-row">
        <input className="input mono" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} aria-label="Amount in testnet NEAR" />
        <button className="pastel pastel-coral" style={{ minHeight: 50, padding: '0 22px' }} disabled={!!busy} onClick={() => act('f', () => relay(me, HUB, 'follow', { crew_id: crew.id }, parseNear(amount), { crewId: crew.id, label: 'follow' }))}><Icon name="star" size={16} />{busy === 'f' ? 'Following…' : 'Follow'}</button>
      </div>
      {mine > 0n && <button className="pill-ghost" disabled={!!busy} onClick={() => act('u', () => relay(me, HUB, 'unfollow', { crew_id: crew.id, shares: mine.toString() }))}>{busy === 'u' ? 'Exiting…' : 'Exit the vault, exact share'}</button>}
    </>}
    {error && <Notice error>{error}</Notice>}
    {hash && <div className="done-row"><Icon name="check" /> Done in <Tx hash={hash} /></div>}
  </div>;
}

export function FollowSheet({ st, me, onSignIn, onClose, onDone }: { st: CrewState; me: Session | null; onSignIn: () => void; onClose: () => void; onDone: () => void }) {
  return <Sheet title={`Follow ${st.crew.name}`} art="kumi-feature-chat" onClose={onClose}>
    <p className="sub" style={{ margin: '-6px 0 0' }}>Your deposit sits in the crew's follower vault. Every crew trade is mirrored pro rata in the same swap. Exit any time.</p>
    <FollowForm st={st} me={me} onSignIn={() => { onClose(); onSignIn(); }} onDone={onDone} />
  </Sheet>;
}
