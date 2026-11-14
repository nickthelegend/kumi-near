import { useEffect, useState } from 'react';
import { Ic } from './bits';

/** "Get the app": the standalone Kumi iPhone app (an Expo build for the iOS Simulator), downloaded in the browser,
 *  checked against its published SHA-256, then installed with one simctl command. The manifest and the zip come from
 *  /download (see app-download.ts); with no build there, the section says Setup required. */
type Manifest = { file: string; bytes: number; sha256: string; builtAt: string; bundleId: string; platform: string };
type St = { k: 'idle' } | { k: 'get'; got: number } | { k: 'hash' } | { k: 'ok'; sha: string } | { k: 'bad'; error: string };

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;
const SHOTS: [string, string][] = [['phone-crews', 'Your crews, with the live on-chain feed'], ['phone-chat', 'The crew chat with a trade card and its vote'], ['phone-fund', 'The crew fund and your exact exit']];

export function GetApp() {
  const [m, setM] = useState<Manifest | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [st, setSt] = useState<St>({ k: 'idle' });
  useEffect(() => {
    fetch('/download/app.json').then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); setM(j); }).catch(e => setErr(String(e.message ?? e)));
  }, []);

  async function download() {
    if (!m) return;
    try {
      setSt({ k: 'get', got: 0 });
      const r = await fetch(`/download/${m.file}`);
      if (!r.ok || !r.body) throw new Error(`Download failed: HTTP ${r.status}`);
      const reader = r.body.getReader(); const parts: Uint8Array[] = []; let got = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got += value.length; setSt({ k: 'get', got }); }
      setSt({ k: 'hash' });
      const blob = new Blob(parts as BlobPart[], { type: 'application/zip' });
      const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (sha !== m.sha256) { setSt({ k: 'bad', error: `SHA-256 mismatch: got ${sha.slice(0, 12)}…, published ${m.sha256.slice(0, 12)}…. The file was not saved.` }); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = m.file; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      setSt({ k: 'ok', sha });
    } catch (e) { setSt({ k: 'bad', error: String((e as Error).message ?? e) }); }
  }

  const pct = st.k === 'get' && m ? Math.min(100, (st.got / m.bytes) * 100) : st.k === 'hash' || st.k === 'ok' ? 100 : 0;
  return (
    <section className="l-sec getapp" id="app">
      <div className="getapp-in">
        <div className="getapp-copy">
          <span className="label">The iPhone app</span>
          <h2>Kumi lives on your phone.</h2>
          <p className="lead">An Expo app with its own NEAR key, made on the phone and kept in the iOS keychain. No wallet app, no seed phrase, no gas to buy.</p>
          <ol className="getapp-steps">
            <li><span className="n">1</span><div><b>Download the build</b><span>Standalone Release build for the iOS Simulator{m ? `, ${mb(m.bytes)}` : ''}.</span></div></li>
            <li><span className="n">2</span><div><b>Install it</b><code>xcrun simctl install booted Kumi.app</code></div></li>
            <li><span className="n">3</span><div><b>Tap Kumi, make your key</b><span>A name and an email code, and Kumi creates your NEAR testnet account.</span></div></li>
          </ol>
          {err ? <div className="getapp-dl bad"><b>Setup required</b><span>{err}</span></div> : (
            <div className={`getapp-dl ${st.k}`}>
              <button className="btn btn-primary btn-lg" onClick={download} disabled={!m || st.k === 'get' || st.k === 'hash'}>
                <Ic name="dl" size={18} />{st.k === 'get' ? `Downloading… ${Math.round(pct)}%` : st.k === 'hash' ? 'Checking SHA-256…' : st.k === 'ok' ? 'Downloaded' : 'Download for iPhone Simulator'}
              </button>
              <div className="bar" aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
              <div className="meta mono">
                {st.k === 'ok' ? <span className="okline"><Ic name="check" size={14} />SHA-256 matches · {m!.file} saved</span>
                  : st.k === 'bad' ? <span className="badline">{st.error}</span>
                  : m ? <span>{m.file} · {mb(m.bytes)} · SHA-256 {m.sha256.slice(0, 10)}…{m.sha256.slice(-6)}</span> : <span>Reading the build…</span>}
              </div>
            </div>
          )}
          <p className="getapp-dev">Developers: <code>cd mobile && npx expo start</code> runs the same app in Expo Go.</p>
        </div>
        <div className="getapp-phones" aria-label="Screens from the Kumi iPhone app">
          {SHOTS.map(([n, alt], i) => <figure className={`phone p${i}`} key={n}><img src={`/art/phone/${n}.webp`} alt={alt} loading="lazy" decoding="async" /></figure>)}
        </div>
      </div>
    </section>
  );
}
