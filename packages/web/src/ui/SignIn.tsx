import { useState } from 'react';
import { api } from '../lib/api';
import { newKey, setSession } from '../lib/session';
import { Acct, Art, Notice, Tx } from './bits';

type Start = { delivery: 'email' | 'setup-required'; setup?: string; previewCode?: string; existing: boolean };

/** Email sign-in. The relayer creates `<name>.<relayer>` keyed to a key made in this browser. */
export function SignIn({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [code, setCode] = useState('');
  const [start, setStart] = useState<Start | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ accountId: string; createdTx?: string } | null>(null);
  const [key] = useState(() => newKey());

  async function go(fn: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(false); }
  }

  return (
    <div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="signin-title">
        <div className="sheet-art"><Art name={['kumi3-hero', 'kumi-og']} alt="Clay friends cheering around a jar of coins" eager /></div>
        {step === 'email' && (
          <form className="stack" onSubmit={e => { e.preventDefault(); void go(async () => { setStart(await api<Start>('/api/auth/start', { email })); setStep('code'); }); }}>
            <div>
              <h3 id="signin-title">Join with your email</h3>
              <p className="sub">No wallet, no seed phrase. Kumi makes you a NEAR account and pays your gas.</p>
            </div>
            <label className="field"><span className="label">Email</span>
              <input className="input" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoFocus /></label>
            <label className="field"><span className="label">Name in the chat</span>
              <input className="input" required minLength={2} maxLength={20} pattern="[A-Za-z0-9-]+" value={handle} onChange={e => setHandle(e.target.value)} placeholder="mika" />
              <span className="faint" style={{ fontSize: 13 }}>Letters, digits and dashes. It becomes your account name.</span></label>
            {error && <Notice error>{error}</Notice>}
            <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Sending…' : 'Send my code'}</button>
          </form>
        )}
        {step === 'code' && start && (
          <form className="stack" onSubmit={e => { e.preventDefault(); void go(async () => {
            const r = await api<{ accountId: string; createdTx?: string }>('/api/auth/verify', { email, code, handle, publicKey: key.getPublicKey().toString() });
            setSession({ accountId: r.accountId, handle, key: key.toString() });
            setMade(r); setStep('done');
          }); }}>
            <div>
              <h3 id="signin-title">Check your inbox</h3>
              <p className="sub">Enter the 6-digit code for <b>{email}</b>.</p>
            </div>
            {start.delivery === 'setup-required' && (
              <Notice>
                <div><b>Email delivery: {start.setup}.</b> This testnet preview has no email provider, so your code is shown here: <b className="mono" style={{ fontSize: 16 }}>{start.previewCode}</b></div>
              </Notice>
            )}
            <input className="input mono" inputMode="numeric" pattern="\d{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} placeholder="000000" autoFocus aria-label="Code" style={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' }} />
            {error && <Notice error>{error}</Notice>}
            <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? 'Creating your account on NEAR…' : 'Verify and create my account'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('email')}>Use a different email</button>
          </form>
        )}
        {step === 'done' && made && (
          <div className="stack">
            <h3 id="signin-title">You're in</h3>
            <p className="sub" style={{ margin: 0 }}>Your account <Acct id={made.accountId} /> lives on NEAR testnet. Its key stays in this browser.</p>
            {made.createdTx && <div className="row faint" style={{ fontSize: 14 }}>Created in <Tx hash={made.createdTx} /></div>}
            <button className="btn btn-primary btn-lg" onClick={onClose}>Go to the crew chat</button>
          </div>
        )}
      </div>
    </div>
  );
}
