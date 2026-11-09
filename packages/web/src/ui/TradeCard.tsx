import { useState } from 'react';
import { formatNear, formatUnits, tally, type Asset, type Crew, type DaoPolicy, type Proposal, type Trade } from '@kumi/sdk';
import type { ChatMessage } from '../lib/api';
import { captainKey, type Session } from '../lib/session';
import { captainTrade, fileTrade, vote } from './actions';
import { Avatars, Icon, Notice, shortName, Tx, VoteBar } from './bits';

const STATUS: Record<string, string> = { draft: 'Quote ready', filing: 'Filing', voting: 'Voting', executing: 'Executing', executed: 'Executed', failed: 'Not filled', expired: 'Expired' };
const trim = (v: string) => { const n = Number(v); return n === 0 ? '0' : n.toPrecision(5).replace(/\.?0+$/, ''); };

/** A crew trade pitched in chat: the attached quote, the Sputnik vote and its transactions. */
export function TradeCard({ m, me, crew, trade, proposal, policy, assets, hub, onDone }: {
  m: ChatMessage; me: Session | null; crew: Crew; trade?: Trade; proposal?: Proposal; policy: DaoPolicy; assets: Asset[]; hub: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const t = m.trade!;
  const q = t.quote;
  const asset = assets.find(a => a.symbol === t.asset);
  const mine = me?.accountId === m.account;
  const isMember = !!me && crew.allowed.includes(me.accountId);
  const status = proposal?.status === 'Expired' ? 'expired' : trade?.status ?? (q ? 'draft' : 'failed');
  const votes = proposal ? tally(proposal, policy) : null;
  const myVote = me && proposal?.votes?.[me.accountId];
  const canVote = isMember && proposal?.status === 'InProgress' && !myVote;
  const canFile = mine && t.lane === 'vote' && q && t.proposalId === undefined && !t.error;
  const canCaptain = mine && t.lane === 'captain' && q && m.txs.length === 0 && !!captainKey(crew.id);
  const units = (v: string, near: boolean) => (near ? formatNear(v, 4) : formatUnits(v, asset?.decimals ?? 0, Math.min(asset?.decimals ?? 0, 8)));
  const filled = trade?.status === 'executed';
  const intents = q && 'quote' in q.intents ? q.intents.quote : null;
  const time = new Date(m.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name); setError(null);
    try { await fn(); setPicking(false); onDone(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(null); }
  }

  return (
    <article className={`tcard ${mine ? 'mine' : ''}`} aria-label={`Trade: ${t.side} ${t.asset} ${t.bps / 100}%, ${STATUS[status]}`}>
      <div className="tcard-notch"><span className={`tstatus ts-${status}`}><i />{STATUS[status]}{status === 'voting' && votes ? ` ${votes.approve}/${votes.needed}` : ''}</span></div>
      <div className="tcard-head">
        <span className="asset-chip"><span className={`asset-coin coin-${t.asset}`}>{t.asset}</span>{t.lane === 'captain' ? 'Captain lane' : 'Crew vote'}</span>
        <h3><span className={`side-${t.side}`}>{t.side === 'buy' ? 'Buy' : 'Sell'}</span> {t.asset} · {(t.bps / 100).toLocaleString()}%</h3>
        <p className="tcard-sub">Pitched by {shortName(m.account)} · {time}{t.proposalId !== undefined ? ` · Sputnik #${t.proposalId}` : ''}</p>
      </div>
      {t.error && <Notice error>{t.error}</Notice>}
      {trade?.status === 'failed' && <Notice>The vote passed, but the pool moved more than {crew.slippage_bps / 100}% past the attached quote, so it refused the fill. The hub restored every holding; nothing was traded.</Notice>}
      {q && <>
        <div className="quote">
          <div><div className="lbl">{filled ? 'Crew paid' : 'Crew pays'}</div>
            <div className="quote-v">{filled ? units(trade!.crew_in, t.side === 'buy') : units(q.amount_in, t.side === 'buy')} <small>{t.side === 'buy' ? 'NEAR' : `t${t.asset}`}</small></div></div>
          <span className="arrow" aria-hidden><Icon name="arrow" size={18} /></span>
          <div className="quote-side"><div className="lbl">{filled ? 'Crew got' : 'Pool quote'}</div>
            <div className="quote-v">{filled ? units(trade!.crew_out, t.side !== 'buy') : units(q.pool.amount_out, t.side !== 'buy')} <small>{t.side === 'buy' ? `t${t.asset}` : 'NEAR'}</small></div></div>
        </div>
        <div className="intents">
          <span>{intents ? <>Mainnet 1Click: {trim(intents.amountInFormatted)} → {trim(intents.amountOutFormatted)} {t.side === 'buy' ? t.asset : 'NEAR'}{intents.amountOutUsd ? ` (~$${Number(intents.amountOutUsd).toFixed(2)})` : ''} · dry quote</> : <>Mainnet 1Click: {'error' in q.intents ? q.intents.error.replace(/^1Click HTTP \d+: /, '').replace('No liquidity available', 'no liquidity at this size') : 'no quote'}</>}</span>
          <span className="mono" title={q.hash}>quote {q.hash.slice(0, 8)}</span>
        </div>
        {filled && BigInt(trade!.vault_in) > 0n && <p className="tcard-sub">Followers mirrored <b>{units(trade!.vault_in, t.side === 'buy')} {t.side === 'buy' ? 'NEAR' : `t${t.asset}`}</b> in the same swap.</p>}
      </>}
      {votes && <VoteBar approve={votes.approve} reject={votes.reject} needed={votes.needed} members={votes.members} />}
      {(votes || canFile || canCaptain) && <div className="tcard-foot">
        {proposal && <Avatars ids={Object.keys(proposal.votes ?? {})} />}
        {canVote && !picking && <button className="pill-ink" onClick={() => setPicking(true)}>Vote <Icon name="arrow" size={15} /></button>}
        {myVote && <span className="voted"><Icon name={myVote === 'Approve' ? 'thumb' : 'thumbDown'} size={15} />You voted {myVote === 'Approve' ? 'yes' : 'no'}</span>}
        {!canVote && !myVote && votes && proposal?.status === 'InProgress' && !isMember && <span className="voted">Members vote</span>}
        {canFile && <button className="pill-ink" disabled={!!busy} onClick={() => act('file', () => fileTrade(me!, hub, crew.id, m.id, q!))}>{busy === 'file' ? 'Filing to the DAO…' : <>File to the crew DAO <Icon name="arrow" size={15} /></>}</button>}
        {canCaptain && <button className="pill-ink" disabled={!!busy} onClick={() => act('cap', () => captainTrade(hub, crew.id, m.id, q!))}>{busy === 'cap' ? 'Executing…' : <>Execute with captain key <Icon name="arrow" size={15} /></>}</button>}
      </div>}
      {canVote && picking && <div className="vote-pick">
        <button className="pastel pastel-butter" disabled={!!busy} onClick={() => act('yes', () => vote(me!, crew.dao, t.proposalId!, proposal!.kind, true, crew.id, m.id))}><Icon name="thumb" size={16} />{busy === 'yes' ? 'Signing…' : 'Approve'}</button>
        <button className="pastel pastel-coral" disabled={!!busy} onClick={() => act('no', () => vote(me!, crew.dao, t.proposalId!, proposal!.kind, false, crew.id, m.id))}><Icon name="thumbDown" size={16} />{busy === 'no' ? 'Signing…' : 'Reject'}</button>
      </div>}
      {canFile && <p className="tcard-sub" style={{ marginTop: -4 }}>Signs once; Kumi pays the gas.</p>}
      {error && <Notice error>{error}</Notice>}
      {m.txs.length > 0 && <div className="txs">{m.txs.map(x => <Tx key={x.hash + x.label} hash={x.hash} label={x.label} />)}</div>}
    </article>
  );
}
