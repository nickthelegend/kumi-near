import { crewNav, formatNear, formatUnits, accountUrl, type Receipt } from '@kumi/sdk';
import { EVIDENCE, HUB, readCrew, readHub, useAsync, type CrewState } from '../lib/api';
import { Art, Avatar, Link, Notice, Tx, Icon, shortName } from '../ui/bits';

const LABELS: Record<string, string> = {
  create_crew: 'Crew created, Sputnik DAO via factory', join_mika: 'Mika joins by meta transaction', join_bo: 'Bo joins', join_juno: 'Juno joins',
  vote1_propose: '/buy SOL 30% filed as a DAO proposal', vote1_vote_bo: 'Second approval: trade executes', vote2_vote_juno: 'Vote 2 executes, follower mirrored',
  follow_rin: 'Rin follows the crew', captain_vote_bo: 'Captain key installed by vote', captain_trade: 'Captain trade, function-call key', ragequit_bo: 'Bo ragequits, exact share',
  deploy_hub: 'Hub contract deployed', liquidity_tsol: 'Test SOL pool seeded at spot',
};

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const hub = useAsync(() => readHub(), [], 30_000);
  const crews = hub.data?.crews ?? [];
  const nav = crews.reduce((a, c) => a + crewNav(c, hub.data!.marks), 0n);
  const top = useAsync(() => crews.length ? readCrew(crews[0].id) : Promise.resolve(null), [crews.length]);
  const trades = crews.reduce((a, c) => a + c.trade_count, 0);
  const members = crews.reduce((a, c) => a + c.members.length, 0);
  const proof = EVIDENCE.transactions.filter(t => LABELS[t.step]).slice(-9).reverse();

  return (
    <main>
      <section className="hero">
        <div className="hero-art"><Art name="kumi-hero" alt="Smiling chat bubbles giving thumbs up around a glowing jar of coins" eager /></div>
        <div className="hero-in">
          <div className="hero-copy">
            <span className="kicker"><b>NEAR testnet</b> Sputnik DAO + NEAR Intents</span>
            <h1>Your group chat<br />is a <em>fund.</em></h1>
            <p className="lead">Pool money with friends. Pitch a trade in chat with <span className="mono" style={{ color: 'var(--butter)' }}>/buy SOL 20%</span>. When the vote passes, it executes. Everyone's share is exact and on-chain, and anyone can leave with it.</p>
            <div className="hero-cta">
              <Link to="/app" className="btn btn-primary btn-lg">Open the crew room {Icon.arrow}</Link>
              <button className="btn btn-lg" onClick={onSignIn}>Join with email</button>
            </div>
          </div>
        </div>
      </section>

      <div className="stats" aria-live="polite">
        <div className="stats-in">
          {[
            ['Crews on testnet', hub.data ? String(crews.length) : null, 'Each with its own Sputnik DAO'],
            ['Crew NAV', hub.data ? formatNear(nav, 3) : null, 'NEAR, marked at on-chain pool prices'],
            ['Trades filed', hub.data ? String(trades) : null, 'Voted and captain trades'],
            ['Members', hub.data ? String(members) : null, 'Email sign-ups, no wallet'],
          ].map(([k, v, s]) => (
            <div className="stat" key={k}>
              <div className="label">{k}</div>
              {v === null ? <div className="skeleton" style={{ height: 32, marginTop: 8, width: '60%' }} /> : <div className="v">{v}</div>}
              <div className="s">{s}</div>
            </div>
          ))}
        </div>
        {hub.error && <div style={{ marginTop: 12 }}><Notice error>Could not read the hub {HUB} from NEAR testnet: {hub.error}</Notice></div>}
      </div>

      <section className="section" id="how">
        <div className="section-head">
          <div><span className="label">How it works</span><h2>Three moves. No multisig homework.</h2></div>
          <p>Kumi is built on what groups already do: talk, agree, chip in. The chain only shows up as receipts.</p>
        </div>
        <div className="beats">
          <article className="beat">
            <div className="beat-art"><Art name="kumi-feature-vote" alt="Three hands dropping coins into one glass jar" /></div>
            <div className="beat-body"><div className="beat-n">01 · Pool</div><h3>Chip into one jar</h3>
              <p>Each member deposits and gets crew shares at the current NAV. The jar is your crew's own Sputnik DAO plus a vault only that DAO can trade.</p></div>
          </article>
          <article className="beat">
            <div className="beat-art"><Art name="kumi-feature-chat" alt="A chat bubble streaming into a rising trade card" /></div>
            <div className="beat-body"><div className="beat-n">02 · Pitch</div><h3>Say <code>/buy SOL 20%</code></h3>
              <p>The message becomes a trade card with a live quote and a DAO proposal. Members vote with a tap. A strict majority executes it, once.</p></div>
          </article>
          <article className="beat">
            <div className="beat-art"><Art name="kumi-og" alt="Four friends at a round table sharing a treasure chest" eager /></div>
            <div className="beat-body"><div className="beat-n">03 · Own it</div><h3>Leave whenever, exactly</h3>
              <p>Ragequit any time for your precise slice of every asset, no vote needed. Returns are recomputed from on-chain receipts, so no one can fake their gains.</p></div>
          </article>
        </div>
      </section>

      <section className="section" id="proof">
        <div className="section-head">
          <div><span className="label">Live proof</span><h2>Read straight from NEAR testnet.</h2></div>
          <p>Numbers above come from the hub contract at <a className="hash" href={accountUrl(HUB)} target="_blank" rel="noreferrer">{HUB}</a>. Every step of the recorded run links to NearBlocks.</p>
        </div>
        <div className="proof">
          <div className="panel">
            <div className="panel-head"><h3>The recorded crew lifecycle</h3><span className="chip chip-butter"><span className="dot" />{EVIDENCE.transactions.length} transactions</span></div>
            {proof.length === 0 ? <div className="empty"><h4>No run recorded yet</h4>Run <span className="mono">pnpm run:testnet</span> to record one.</div> : (
              <ul className="txlist">{proof.map(t => <li key={t.step}><span className="what">{LABELS[t.step]}</span><Tx hash={t.hash} /></li>)}</ul>
            )}
          </div>
          <div className="panel">
            <div className="panel-head"><h3>A crew right now</h3>{hub.data && <span className="faint mono" style={{ fontSize: 12 }}>read {new Date(hub.data.readAt).toLocaleTimeString()}</span>}</div>
            {hub.loading && !hub.data ? <div className="skeleton" style={{ height: 220 }} /> : crews.length === 0 ? (
              <div className="empty"><h4>No crews yet</h4>The hub is deployed; the first crew appears here as soon as it is created.</div>
            ) : !top.data ? <div className="skeleton" style={{ height: 220 }} /> : <CrewMini st={top.data} />}
          </div>
        </div>
      </section>

      <section className="section" id="near">
        <div className="section-head">
          <div><span className="label">The NEAR parts</span><h2>What each NEAR feature does here.</h2></div>
          <p>Named precisely, so a judge can check each one in the contract or the transaction log.</p>
        </div>
        <div className="tech">
          {[
            ['Sputnik DAO v2', 'The hub creates one DAO per crew through sputnikv2.testnet, with the members as the only voting role. Only that DAO can execute a crew trade.'],
            ['Function-call keys', 'A vote installs a key on the hub that may call only captain_trade. The contract caps size, trades per day and assets. It cannot withdraw.'],
            ['NEP-366 meta transactions', 'Players sign in with email. Their browser key signs delegates; Kumi’s relayer submits them and pays gas.'],
            ['NEAR Intents (1Click)', 'Every trade card carries a real mainnet dry quote for the real asset. Live swaps need a funded NEAR_MAINNET_ACCOUNT, and say so.'],
            ['Sub-accounts', 'Each player is a named sub-account of the relayer, created at sign-up. The hub and test pools are sub-accounts too.'],
            ['NEP-245 + NEP-141', 'Crew and follower shares are NEP-245 token ids (non-transferable). Testnet trades settle against NEP-141 test pools, labelled as such.'],
          ].map(([h, p]) => <div className="tech-item" key={h}><span className="chip chip-coral">NEAR</span><h4>{h}</h4><p>{p}</p></div>)}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-in">
          <div className="cta-art"><Art name="kumi-hero" alt="" /></div>
          <div className="cta-copy">
            <h2>Start a crew with the people you already text.</h2>
            <p>Sign in with email, invite your friends, and make your first call together.</p>
            <div className="hero-cta"><Link to="/app" className="btn btn-primary btn-lg">Open the crew room</Link><Link to="/leaderboard" className="btn btn-lg">See the season</Link></div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <span>Kumi 組 · MIT · Copyright (c) 2026 Nivesh Gajengi</span>
        <span>Testnet build. Mainnet swaps: Setup required: NEAR_MAINNET_ACCOUNT. Inspired by Alpha Group Trading (Colosseum Frontier 2026).</span>
      </footer>
    </main>
  );
}

const KIND: Record<string, [string, string]> = { join: ['＋', 'joined'], ragequit: ['↩', 'ragequit'], trade: ['⇄', 'voted trade'], captain_trade: ['⚑', 'captain trade'], follow: ['★', 'followed'], unfollow: ['☆', 'unfollowed'], fee: ['%', 'paid the crew a fee'] };
function receiptLine(r: Receipt, st: CrewState) {
  const a = st.assets.find(x => x.symbol === r.asset);
  if (r.kind === 'join') return `${formatNear(r.near_in, 3)} NEAR in`;
  if (r.kind === 'trade' || r.kind === 'captain_trade') return BigInt(r.near_out) > 0n ? `${formatNear(r.near_out, 3)} NEAR → ${formatUnits(r.token_in, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${r.asset}` : `${formatUnits(r.token_out, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${r.asset} → ${formatNear(r.near_in, 3)} NEAR`;
  if (r.kind === 'ragequit') return `${formatNear(r.near_out, 3)} NEAR${BigInt(r.token_out) > 0n ? ` + ${formatUnits(r.token_out, a?.decimals ?? 0, Math.min(a?.decimals ?? 0, 8))} t${r.asset}` : ''} out`;
  if (r.kind === 'fee') return `${formatNear(r.near_in, 5)} NEAR (plus tokens in kind) above the high-water mark`;
  return `${formatNear(r.shares, 3)} vault shares`;
}
function CrewMini({ st }: { st: CrewState }) {
  const { crew, pnl, receipts } = st;
  return (
    <div className="crew-mini">
      <div className="crew-mini-head">
        <span className="crew-badge" style={{ width: 44, height: 44, borderRadius: 14, fontSize: 18 }}>{crew.name.slice(0, 1)}</span>
        <div style={{ minWidth: 0, flex: 1 }}><Link to={`/crew/${crew.id}`}><b>{crew.name}</b></Link><div className="faint mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{crew.dao}</div></div>
        <span className="avatars">{crew.members.map(([m]) => <Avatar key={m} id={m} />)}</span>
      </div>
      <div className="kpis">
        <div className="kpi"><div className="label">NAV</div><div className="v">{pnl.navNear.toFixed(4)}</div></div>
        <div className="kpi"><div className="label">Return</div><div className={`v ${pnl.returnPct >= 0 ? 'up' : 'down'}`}>{pnl.returnPct >= 0 ? '+' : ''}{pnl.returnPct.toFixed(2)}%</div></div>
      </div>
      <div className="row-between"><span className="label">On-chain receipts</span><span className={pnl.verified ? 'chip chip-butter' : 'chip chip-rose'}><span className="dot" />{pnl.verified ? 'verified' : 'unverified'}</span></div>
      <ul className="receipts">{receipts.slice(-6).reverse().map(r => (
        <li key={r.seq}><span className="k" aria-hidden>{KIND[r.kind]?.[0]}</span><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b>{r.kind === 'fee' ? 'follower vault' : shortName(r.account_id)}</b> <span className="muted">{KIND[r.kind]?.[1]} · {receiptLine(r, st)}</span></span><span className="faint mono" style={{ fontSize: 11 }}>#{r.block}</span></li>
      ))}</ul>
    </div>
  );
}
