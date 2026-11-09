import { crewNav, formatNear, accountUrl, seasonRow } from '@kumi/sdk';
import { EVIDENCE, HUB, readCrew, readHub, useAsync, type CrewState } from '../lib/api';
import { Art, Avatar, CrewAvatar, Ic, Link, Notice, Sticker, Tx, shortName } from '../ui/bits';
import { Spark } from '../ui/Fund';

const LABELS: Record<string, [string, string]> = {
  create_crew: ['Crew created, Sputnik DAO via factory', 'coral'], join_mika: ['Mika chips in by meta transaction', 'butter'], join_bo: ['Bo chips in', 'butter'], join_juno: ['Juno chips in', 'butter'],
  vote1_propose: ['/buy SOL 30% filed as a DAO proposal', 'coral'], vote1_vote_bo: ['Second yes vote: the trade executes', 'butter'], vote2_vote_juno: ['Vote 2 executes, follower mirrored', 'butter'],
  follow_rin: ['Rin follows the crew', 'mint'], captain_vote_bo: ['Captain key installed by vote', 'coral'], captain_trade: ['Captain trade, function-call key', 'coral'], ragequit_bo: ['Bo ragequits with an exact share', 'pink'],
  deploy_hub: ['Hub contract deployed', 'mint'], liquidity_tsol: ['Test SOL pool seeded at spot', 'mint'],
};

const STEPS: { tone: string; art: string[]; title: React.ReactNode; body: string }[] = [
  { tone: 'butter', art: ['kumi3-pool', 'kumi-feature-vote'], title: 'Chip into one jar', body: 'Everyone deposits and gets crew shares at the live NAV. The jar is your crew\'s own Sputnik DAO plus a vault only that DAO can trade.' },
  { tone: 'coral', art: ['kumi3-vote', 'kumi-feature-chat'], title: <>Say <code>/buy SOL 20%</code></>, body: 'Your message becomes a trade card with a live quote and a DAO proposal. Friends vote with a tap; a strict majority executes it, once.' },
  { tone: 'pink', art: ['kumi3-leave', 'kumi-og'], title: 'Leave whenever, exactly', body: 'Ragequit any time for your precise slice of every asset. No vote, no permission, no waiting on the group.' },
  { tone: 'mint', art: ['kumi3-season', 'kumi-hero'], title: 'Climb the season', body: 'Every crew is ranked weekly on return minus half its drawdown, recomputed from on-chain receipts. Nobody can fake gains.' },
];

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  const hub = useAsync(() => readHub(), [], 30_000);
  const crews = hub.data?.crews ?? [];
  const nav = crews.reduce((a, c) => a + crewNav(c, hub.data!.marks), 0n);
  const top = useAsync(() => crews.length ? readCrew(crews[0].id) : Promise.resolve(null), [crews.length]);
  const trades = crews.reduce((a, c) => a + c.trade_count, 0);
  const members = crews.reduce((a, c) => a + c.members.length, 0);
  const proof = EVIDENCE.transactions.filter(t => LABELS[t.step]).slice(-9).reverse();
  const ret = top.data?.pnl.returnPct;

  return (
    <main>
      <section className="l-hero">
        <div className="l-hero-in">
          <div>
            <span className="kicker"><b>LIVE</b>On NEAR testnet · Sputnik DAO + NEAR Intents</span>
            <h1>Your group chat is a <em>fund.</em></h1>
            <p className="lead">Pool money with friends. Pitch a trade in chat with <code>/buy SOL 20%</code>. When the vote passes, it executes, and everyone's share stays exact and on-chain.</p>
            <div className="l-cta">
              <Link to="/room" className="btn btn-primary btn-lg">Open the crew chat <Ic name="arrow" /></Link>
              <button className="btn btn-lg" onClick={onSignIn}>Join with email</button>
            </div>
          </div>
          <div className="l-art">
            <Art name={['kumi3-hero', 'kumi-hero']} alt="Clay chat bubbles cheering around a glowing jar of coins" eager />
            {top.data && <div className="l-float f1 tone-mint"><span className="ic"><Ic name="up" /></span><span><span className="faint">{top.data.crew.name} all time</span><b className={ret! >= 0 ? 'up' : 'down'}>{ret! >= 0 ? '+' : '−'}{Math.abs(ret!).toFixed(2)}%</b></span></div>}
            {top.data && <div className="l-float f2 tone-butter"><span className="ic"><Ic name="thumb" /></span><span><span className="faint">Trades voted in chat</span><b>{trades} filed</b></span></div>}
          </div>
        </div>
      </section>

      <div className="l-stats" aria-live="polite">
        {[['Crews on testnet', hub.data ? String(crews.length) : null, 'each with its own Sputnik DAO', 'coral'],
          ['Crew NAV', hub.data ? formatNear(nav, 3) : null, 'NEAR, marked at on-chain pool prices', 'butter'],
          ['Trades filed', hub.data ? String(trades) : null, 'voted and captain trades', 'mint'],
          ['Members', hub.data ? String(members) : null, 'email sign-ups, no wallet', 'pink']].map(([k, v, s, tone]) => (
          <div className={`l-stat tone-${tone}`} key={k}>
            <div className="label">{k}</div>
            {v === null ? <div className="skeleton" style={{ height: 34, marginTop: 8, width: '60%' }} /> : <div className="v">{v}{k === 'Crew NAV' && <small> NEAR</small>}</div>}
            <div className="s">{s}</div>
          </div>
        ))}
      </div>
      {hub.error && <div className="l-sec" style={{ paddingTop: 16 }}><Notice error>Could not read the hub {HUB} from NEAR testnet: {hub.error}</Notice></div>}

      <section className="l-sec" id="how">
        <div className="l-head"><div><span className="label">How it works</span><h2>Four moves. No multisig homework. <Sticker name="kumi3-st-rocket" /></h2></div><p>Kumi is built on what friends already do: talk, agree, chip in. The chain only shows up as receipts.</p></div>
        <div className="how">{STEPS.map((s, i) => <article className={`how-card tone-${s.tone}`} key={i}>
          <div className="art"><Art name={s.art} alt="" /></div>
          <div className="in"><span className="n">0{i + 1}</span><h3>{s.title}</h3><p>{s.body}</p></div>
        </article>)}</div>
      </section>

      <section className="l-sec" id="proof">
        <div className="l-head"><div><span className="label">Live proof</span><h2>Read straight from NEAR testnet. <Sticker name="kumi3-st-chart" /></h2></div><p>Numbers come from the hub at <a className="hash" href={accountUrl(HUB)} target="_blank" rel="noreferrer">{HUB}</a>. Every step of the recorded run links to NearBlocks.</p></div>
        <div className="proof">
          <div className="card">
            <div className="card-head"><h3>A crew right now</h3>{hub.data && <span className="chip chip-mint chip-live"><span className="dot" />read {new Date(hub.data.readAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}</div>
            {!hub.data || (crews.length && !top.data) ? <div className="skeleton" style={{ height: 260 }} /> : !top.data ? <p className="mini">The hub is deployed; the first crew appears here as soon as it is created.</p> : <CrewMini st={top.data} />}
          </div>
          <div className="card">
            <div className="card-head"><h3>The recorded crew lifecycle</h3><span className="chip chip-plum">{EVIDENCE.transactions.length} transactions</span></div>
            <ul className="txlist">{proof.map(t => <li key={t.step} className={`tone-${LABELS[t.step][1]}`}><span className="what"><i className="ic" /><span>{LABELS[t.step][0]}</span></span><Tx hash={t.hash} /></li>)}</ul>
          </div>
        </div>
      </section>

      <section className="l-sec" id="near">
        <div className="l-head"><div><span className="label">The NEAR parts</span><h2>What each NEAR feature does here. <Sticker name="kumi3-st-coin" /></h2></div><p>Named precisely, so you can check each one in the contract or the transaction log.</p></div>
        <div className="tech">
          {[['Sputnik DAO v2', 'One DAO per crew through sputnikv2.testnet; the members are the only voting role, and only that DAO can execute a crew trade.', 'coral'],
            ['Function-call keys', 'A vote installs a key that may call only captain_trade. The contract caps size, trades a day and assets. It cannot withdraw.', 'butter'],
            ['NEP-366 meta transactions', 'Players sign in with email. Their browser key signs delegates; Kumi\'s relayer submits them and pays the gas.', 'mint'],
            ['NEAR Intents (1Click)', 'Every trade card carries a real mainnet dry quote for the real asset. Live swaps need a funded NEAR_MAINNET_ACCOUNT, and say so.', 'pink'],
            ['Sub-accounts', 'Each player is a named sub-account of the relayer, created at sign-up. The hub and test pools are sub-accounts too.', 'butter'],
            ['NEP-245 + NEP-141', 'Crew and follower shares are NEP-245 ids, non-transferable. Testnet trades settle against NEP-141 test pools, labelled as such.', 'mint']].map(([h, p, tone]) =>
            <div className={`tech-item tone-${tone}`} key={h}><h4>{h}</h4><p>{p}</p></div>)}
        </div>
      </section>

      <section className="cta-band">
        <div className="cta-in">
          <div className="cta-copy">
            <h2>Start a crew with the people you already text.</h2>
            <p>Sign in with email, chip in, and make your first call together.</p>
            <div className="l-cta"><Link to="/room" className="btn btn-primary btn-lg">Open the crew chat</Link><Link to="/leaderboard" className="btn btn-lg btn-butter">See the season</Link></div>
          </div>
          <div className="cta-art"><Art eager name={['kumi3-season', 'kumi-og']} alt="Four clay friends around a table with a treasure chest" /></div>
        </div>
      </section>

      <footer className="footer">
        <span>Kumi 組 · MIT · Copyright (c) 2026 Nivesh Gajengi</span>
        <span>Testnet build. Mainnet swaps: Setup required: NEAR_MAINNET_ACCOUNT. Inspired by Alpha Group Trading (Colosseum Frontier 2026).</span>
      </footer>
    </main>
  );
}

function CrewMini({ st }: { st: CrewState }) {
  const { crew, pnl } = st;
  const week = seasonRow(crew, pnl).returnPct;
  return <div className="mini-crew">
    <div className="row">
      <CrewAvatar id={crew.id} name={crew.name} size="lg" />
      <div style={{ minWidth: 0, flex: 1 }}><Link to={`/room?crew=${crew.id}`}><b style={{ fontSize: 20 }}>{crew.name}</b></Link><div className="faint mono" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis' }}>{crew.dao}</div></div>
      <span className="avatars">{crew.allowed.map(m => <Avatar key={m} id={m} initial />)}</span>
    </div>
    <div className="hero-card" style={{ marginTop: 14, boxShadow: 'none' }}>
      <div className="row-between"><span className="label">NAV</span><span className={`verify ${pnl.verified ? '' : 'bad'}`}><i />{pnl.verified ? 'Verified on-chain' : 'Unverified'}</span></div>
      <div className="big">{pnl.navNear.toFixed(4)} <small>NEAR</small></div>
      <span className={`ret ${pnl.returnPct >= 0 ? '' : 'neg'}`}>{pnl.returnPct >= 0 ? '+' : '−'}{Math.abs(pnl.returnPct).toFixed(2)}% all time</span>
      <Spark pnl={pnl} />
    </div>
    <div className="kpis">
      <div className="tile tone-mint"><div className="label">This week</div><div className="v">{week >= 0 ? '+' : '−'}{Math.abs(week).toFixed(2)}%</div></div>
      <div className="tile tone-coral"><div className="label">Trades</div><div className="v">{crew.trade_count}</div></div>
      <div className="tile tone-butter"><div className="label">Captain</div><div className="v">{crew.captain ? shortName(crew.captain.account_id) : 'none'}</div></div>
      <div className="tile tone-pink"><div className="label">Followers</div><div className="v">{crew.followers.length}</div></div>
    </div>
    <Link to={`/room?crew=${crew.id}`} className="btn btn-plum btn-block">Open {crew.name}'s chat <Ic name="arrow" size={16} /></Link>
  </div>;
}
