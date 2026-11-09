import { rankSeason, seasonRow, seasonStart } from '@kumi/sdk';
import { readCrew, readHub, useAsync } from '../lib/api';
import { Art, Link, Notice } from '../ui/bits';

export function Leaderboard() {
  const start = seasonStart();
  const end = new Date(start.getTime() + 6 * 86_400_000);
  // ISO week number of the season's Monday.
  const thu = new Date(start.getTime() + 3 * 86_400_000);
  const week = 1 + Math.floor((thu.getTime() - Date.UTC(thu.getUTCFullYear(), 0, 1)) / (7 * 86_400_000));
  const data = useAsync(async () => {
    const hub = await readHub();
    const states = await Promise.all(hub.crews.map(c => readCrew(c.id)));
    return rankSeason(states.map(s => seasonRow(s.crew, s.pnl, start)));
  }, [], 30_000);
  const fmt = (d: Date) => d.toLocaleDateString([], { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <main className="page">
      <div className="page-head">
        <div><span className="label">Season {week} · {fmt(start)} to {fmt(end)} UTC</span><h1>The crew season</h1>
          <p className="muted" style={{ maxWidth: 560, margin: '12px 0 0' }}>Ranked by return minus half the max drawdown, both recomputed from each crew's on-chain receipts. A crew can't edit its own numbers.</p></div>
        <div style={{ width: 220, height: 146, borderRadius: 22, overflow: 'hidden' }}><Art name="kumi-feature-vote" alt="Hands dropping coins into a jar" /></div>
      </div>
      {data.error && <Notice error>{data.error}</Notice>}
      <div className="panel" style={{ padding: '18px 10px', overflowX: 'auto' }}>
        {!data.data ? <div className="skeleton" style={{ height: 160, margin: 10 }} /> : data.data.length === 0 ? <div className="empty"><h4>No crews yet this season</h4>The first crew to trade takes the top spot.</div> : (
          <table className="table">
            <thead><tr><th>#</th><th>Crew</th><th className="num">Season return</th><th className="num hide-sm">Max drawdown</th><th className="num">Score</th><th className="num hide-sm">NAV</th><th className="hide-sm">Proof</th></tr></thead>
            <tbody>{data.data.map((r, i) => (
              <tr key={r.crewId}>
                <td className="rank">{String(i + 1).padStart(2, '0')}</td>
                <td><Link to={`/crew/${r.crewId}`}><b>{r.name}</b></Link><div className="faint" style={{ fontSize: 13 }}>{r.members} member{r.members === 1 ? '' : 's'} · {r.followers} follower{r.followers === 1 ? '' : 's'} · {r.trades} trade{r.trades === 1 ? '' : 's'}</div></td>
                <td className={`num ${r.returnPct >= 0 ? 'up' : 'down'}`}>{r.returnPct >= 0 ? '+' : ''}{r.returnPct.toFixed(2)}%</td>
                <td className="num down hide-sm">{r.maxDrawdownPct.toFixed(2)}%</td>
                <td className="num">{r.score.toFixed(2)}</td>
                <td className="num hide-sm">{r.navNear.toFixed(3)} N</td>
                <td className="hide-sm"><span className={r.verified ? 'chip chip-butter' : 'chip chip-rose'}><span className="dot" />{r.verified ? 'verified' : 'unverified'}</span></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="tech" style={{ marginTop: 20 }}>
        <div className="tech-item"><span className="label">Window</span><h4>Monday to Sunday, UTC</h4><p>Season return compares price per share now with the last receipt before Monday 00:00 UTC.</p></div>
        <div className="tech-item"><span className="label">Score</span><h4>Return − ½ × max drawdown</h4><p>A crew that got lucky on one wild swing ranks below one that climbed steadily.</p></div>
        <div className="tech-item"><span className="label">Proof</span><h4>Recomputed, not reported</h4><p>Every point comes from the hub's receipts. "Verified" means the latest receipt equals the crew's live on-chain state.</p></div>
      </div>
    </main>
  );
}
