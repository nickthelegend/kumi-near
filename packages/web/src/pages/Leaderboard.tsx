import { rankSeason, seasonRow, seasonStart } from '@kumi/sdk';
import { readCrew, readHub, useAsync } from '../lib/api';
import { Art, CrewAvatar, EmptyArt, Ic, Link, Notice } from '../ui/bits';

export function Leaderboard() {
  const start = seasonStart();
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const thu = new Date(start.getTime() + 3 * 86_400_000);
  const week = 1 + Math.floor((thu.getTime() - Date.UTC(thu.getUTCFullYear(), 0, 1)) / (7 * 86_400_000));
  const left = Math.max(0, start.getTime() + 7 * 86_400_000 - Date.now());
  const data = useAsync(async () => {
    const hub = await readHub();
    const states = await Promise.all(hub.crews.map(c => readCrew(c.id)));
    return rankSeason(states.map(s => seasonRow(s.crew, s.pnl, start)));
  }, [], 30_000);
  const fmt = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}%`;
  return (
    <main className="page">
      <div className="page-head">
        <div><span className="chip chip-butter"><Ic name="trophy" size={13} />Season {week} · {fmt(start)} to {fmt(end)} UTC</span><h1>The crew season</h1>
          <p>Ranked by return minus half the max drawdown, both recomputed from each crew's on-chain receipts. A crew can't edit its own numbers.</p></div>
        <div className="tile tone-coral" style={{ minWidth: 200 }}><div className="label">Season ends in</div><div className="v">{Math.floor(left / 86_400_000)}d {Math.floor((left % 86_400_000) / 3_600_000)}h</div></div>
      </div>
      {data.error && <Notice error>{data.error}</Notice>}
      <div className="season-hero">
        <div className="podium">
          {!data.data ? [0, 1].map(i => <div key={i} className="skeleton" style={{ height: 86 }} />)
            : data.data.length === 0 ? <div className="card"><EmptyArt art={['kumi3-empty', 'kumi-og']} title="No crews yet this season">The first crew to trade takes the top spot.</EmptyArt></div>
            : data.data.map((r, i) => <Link to={`/crew/${r.crewId}`} className="rank-card" key={r.crewId}>
              <span className="rank-n">{String(i + 1).padStart(2, '0')}</span>
              <CrewAvatar id={r.crewId} name={r.name} />
              <span style={{ minWidth: 0 }}><span className="n" style={{ display: 'block' }}>{r.name}</span><span className="s">{r.members} member{r.members === 1 ? '' : 's'} · {r.followers} following · {r.trades} trade{r.trades === 1 ? '' : 's'}</span></span>
              <span className="score"><b className={r.returnPct >= 0 ? 'up' : 'down'}>{sign(r.returnPct)}</b><span className="faint" style={{ fontSize: 12 }}>score {r.score.toFixed(2)}</span></span>
            </Link>)}
          {data.data && data.data.length > 0 && <div className="card" style={{ padding: '8px 6px', overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Crew</th><th className="num">Return</th><th className="num">Drawdown</th><th className="num hide-sm">NAV</th><th className="hide-sm">Proof</th></tr></thead>
              <tbody>{data.data.map(r => <tr key={r.crewId}><td><b>{r.name}</b></td><td className={`num ${r.returnPct >= 0 ? 'up' : 'down'}`}>{sign(r.returnPct)}</td><td className="num down">{r.maxDrawdownPct.toFixed(2)}%</td><td className="num hide-sm">{r.navNear.toFixed(3)} N</td>
                <td className="hide-sm"><span className={r.verified ? 'chip chip-mint' : 'chip chip-pink'}><span className="dot" />{r.verified ? 'verified' : 'unverified'}</span></td></tr>)}</tbody>
            </table>
          </div>}
        </div>
        <div className="season-art"><Art name={['kumi3-season', 'kumi-og']} alt="Clay friends celebrating around a trophy of coins" /></div>
      </div>
      <div className="rules">
        <div className="rule tone-mint"><span className="label">Window</span><h4>Monday to Sunday, UTC</h4><p>Season return compares price per share now with the last receipt before Monday 00:00 UTC.</p></div>
        <div className="rule tone-butter"><span className="label">Score</span><h4>Return − ½ × max drawdown</h4><p>A crew that got lucky on one wild swing ranks below one that climbed steadily.</p></div>
        <div className="rule tone-pink"><span className="label">Proof</span><h4>Recomputed, not reported</h4><p>Every point comes from the hub's receipts. "Verified" means the latest receipt equals the crew's live on-chain state.</p></div>
      </div>
    </main>
  );
}
