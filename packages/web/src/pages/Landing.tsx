import { accountUrl, crewNav, formatNear } from '@kumi/sdk';
import { EVIDENCE, HUB, useWorld } from '../lib/api';
import { season } from '../lib/activity';
import { useSession } from '../lib/session';
import { Icon, Link, Sticker, Tx, Wordmark, navigate } from '../ui/bits';
import { CrewWCard, TradeWCard } from './Crews';

const LABELS: Record<string, string> = {
  create_crew: 'Crew created, Sputnik DAO via factory', join_mika: 'Mika joins by meta transaction', join_bo: 'Bo joins', join_juno: 'Juno joins',
  vote1_propose: '/buy SOL 30% filed as a DAO proposal', vote1_vote_bo: 'Second approval: trade executes', vote2_vote_juno: 'Vote 2 executes, follower mirrored',
  follow_rin: 'Rin follows the crew', captain_vote_bo: 'Captain key installed by vote', captain_trade: 'Captain trade, function-call key', ragequit_bo: 'Bo ragequits, exact share',
  deploy_hub: 'Hub contract deployed', liquidity_tsol: 'Test SOL pool seeded at spot',
};

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const world = useWorld();
  const me = useSession();
  const crews = world.data?.crews ?? [];
  const ranked = world.data ? season(world.data) : [];
  const nav = world.data ? world.data.crews.reduce((a, s) => a + crewNav(s.crew, world.data!.hub.marks), 0n) : null;
  const trades = crews.reduce((a, s) => a + s.crew.trade_count, 0);
  const members = crews.reduce((a, s) => a + s.crew.members.length, 0);
  const executed = crews.flatMap(s => s.trades.filter(t => t.status === 'executed').map(t => ({ st: s, t })));
  const last = executed.sort((a, b) => Number(BigInt(b.t.created_at) - BigInt(a.t.created_at)))[0];
  const top = ranked[0];
  const proof = EVIDENCE.transactions.filter(t => LABELS[t.step]).slice(-8).reverse();
  const stat = (v: string | number | null) => (world.error && !world.data ? '—' : v ?? '…');

  return <>
    <header className="l-nav">
      <Link to="/" aria-label="Kumi home"><Wordmark /></Link>
      <nav aria-label="Primary">
        <a href="#how" className="l-link">How it works</a>
        {!me && <button className="l-link" onClick={onSignIn}>Sign in</button>}
        <Link to="/app" className="pill-white">Open app</Link>
      </nav>
    </header>

    <main id="main">
      <section className="l-hero">
        <div className="stickers" aria-hidden="true">
          <Sticker name="bubble" className="st st-bubble" />
          <Sticker name="jar" className="st st-jar" />
          <div className="st st-table"><Sticker name="table" /><span className="st-tag st-tag-cmd">/buy SOL 20%</span><span className="st-tag st-tag-kanji">組</span></div>
          <Sticker name="chart" className="st st-chart" />
          <Sticker name="bubble-lilac" className="st st-lilac" />
          <div className="clay-slab" />
          <div className="st st-coins"><Sticker name="coins" /><span className="st-tag st-tag-vote">2 of 3 said yes</span></div>
        </div>
        <div className="l-hero-copy">
          <h1>Your group chat<br />is a <em>fund.</em></h1>
          <Link to="/app" className="pill-coral pill-xl">Open your crew</Link>
          <p className="l-sub">{world.data ? <>Live on NEAR testnet: {crews.length} {crews.length === 1 ? 'crew holds' : 'crews hold'} <b>{nav !== null ? formatNear(nav, 3) : '…'} NEAR</b>{top ? <>, {top.name} leads the season at <b>{top.returnPct >= 0 ? '+' : '−'}{Math.abs(top.returnPct).toFixed(2)}%</b></> : null}.</>
            : world.error ? 'Pool money with friends, pitch trades in chat, let the vote execute them.' : 'Reading the crews from NEAR testnet…'}</p>
        </div>
      </section>

      <section className="l-sec" id="how">
        <header className="l-head"><p className="lbl">How it works</p><h2>Talk, vote, own your slice.</h2></header>
        <ol className="beats">
          <li>
            <span className="beat-n">01</span>
            <div className="beat-copy"><h3>Chip into one jar.</h3><p>Each member deposits and gets crew shares at the live NAV. The jar is your crew's own Sputnik DAO plus a vault only that DAO can trade.</p></div>
            <div className="beat-live">{top ? <p className="beat-fig"><b>{top.st.pnl.navNear.toFixed(3)}</b><span>NEAR in {top.name}'s vault right now, {top.members} members, marked at on-chain pool prices</span></p> : <span className="lbl">{world.error ? 'Hub unreadable' : 'Loading a live crew…'}</span>}</div>
          </li>
          <li>
            <span className="beat-n">02</span>
            <div className="beat-copy"><h3>Say <code>/buy SOL 20%</code>.</h3><p>The message becomes a trade card with a live quote and a DAO proposal. Members vote with a tap; a strict majority executes it, once.</p></div>
            <div className="beat-live">{world.data ? <p className="beat-fig"><b>{trades}</b><span>trades filed from chat{last ? `, the latest ${last.t.side} ${last.t.asset} ${(last.t.bps / 100).toFixed(0)}% in ${last.st.crew.name}` : ''}</span></p> : <span className="lbl">{world.error ? 'Hub unreadable' : 'Loading…'}</span>}</div>
          </li>
          <li>
            <span className="beat-n">03</span>
            <div className="beat-copy"><h3>Leave whenever, exactly.</h3><p>Ragequit any time for your precise slice of every asset, no vote needed. Returns are recomputed from on-chain receipts, so nobody can fake their gains.</p></div>
            <div className="beat-live">{top ? <p className="beat-fig"><b>{top.verified ? 'Verified' : 'Unverified'}</b><span>{top.st.pnl.verifyNote}</span></p> : <span className="lbl">{world.error ? 'Hub unreadable' : 'Loading…'}</span>}</div>
          </li>
        </ol>
      </section>

      <section className="l-sec" id="live">
        <header className="l-head l-head-row"><div><p className="lbl">Live proof</p><h2>Read straight from NEAR testnet.</h2></div><Link to="/app" className="l-more">Open the crews <Icon name="arrow" size={16} /></Link></header>
        <dl className="l-stats">
          <div><dt>Crews</dt><dd>{stat(world.data ? crews.length : null)}</dd></div>
          <div><dt>Crew NAV</dt><dd>{stat(nav !== null ? formatNear(nav, 3) : null)}<small>NEAR</small></dd></div>
          <div><dt>Trades filed</dt><dd>{stat(world.data ? trades : null)}</dd></div>
          <div><dt>Members</dt><dd>{stat(world.data ? members : null)}</dd></div>
        </dl>
        {world.error && !world.data ? <p className="l-err" role="alert">Could not read the hub {HUB}: {world.error}</p>
          : <div className="l-cards">
            {top ? <CrewWCard r={top} me={me} onJoin={() => (me ? navigate(`/chat/${top.crewId}`) : onSignIn())} onFollow={st => navigate(`/crew/${st.crew.id}`)} /> : <div className="wcard skeleton" style={{ minHeight: 300 }} />}
            {last ? <TradeWCard st={last.st} id={last.t.id} /> : <div className="wcard skeleton" style={{ minHeight: 300 }} />}
          </div>}
        <div className="beat-live" style={{ marginTop: 16 }}>
          <div className="row-between" style={{ marginBottom: 6 }}><p className="lbl">The recorded crew lifecycle</p><span className="lbl">{EVIDENCE.transactions.length} transactions</span></div>
          <ul className="txlist">{proof.map(t => <li key={t.step}><span className="what">{LABELS[t.step]}</span><Tx hash={t.hash} /></li>)}</ul>
        </div>
      </section>

      <section className="l-sec" id="tech">
        <header className="l-head"><p className="lbl">The NEAR parts</p><h2>What each piece does, plainly.</h2></header>
        <div className="tech">
          <article><h3>Sputnik DAO v2</h3><p>The hub creates one DAO per crew through <code>sputnikv2.testnet</code>, with the members as the only voting role. Only that DAO can execute a crew trade.</p></article>
          <article><h3>Function-call keys</h3><p>A vote installs a key on the hub that may call only <code>captain_trade</code>. The contract caps size, trades per day and assets. It cannot withdraw.</p></article>
          <article><h3>NEP-366 meta transactions</h3><p>Players sign in with email. Their browser key signs delegates; Kumi's relayer submits them and pays the gas.</p></article>
          <article><h3>NEAR Intents (1Click)</h3><p>Every trade card carries a real mainnet <code>dry: true</code> quote for the real asset. Live swaps need a funded <code>NEAR_MAINNET_ACCOUNT</code>, and say so.</p></article>
          <article><h3>Sub-accounts</h3><p>Each player is a named sub-account of the relayer, created at sign-up. The hub and test pools are sub-accounts too.</p></article>
          <article><h3>NEP-245 + NEP-141</h3><p>Crew and follower shares are NEP-245 ids, non-transferable. Testnet trades settle against NEP-141 test pools, labelled as such. Hub: <a href={accountUrl(HUB)} target="_blank" rel="noreferrer">{HUB}</a>.</p></article>
        </div>
      </section>
    </main>

    <footer className="l-foot">
      <div className="l-foot-row">
        <Wordmark />
        <p>Crew funds on NEAR testnet. Mainnet swaps: Setup required: NEAR_MAINNET_ACCOUNT. Inspired by Alpha Group Trading (Colosseum Frontier 2026). MIT · © 2026 Nivesh Gajengi</p>
        <div className="l-foot-links"><a href={accountUrl(HUB)} target="_blank" rel="noreferrer">Hub <Icon name="external" size={12} /></a><Link to="/leaderboard">Season</Link></div>
      </div>
      <p className="l-foot-mark" aria-hidden="true">組</p>
    </footer>
  </>;
}
