import { useState } from 'react';
import { formatNear, formatUnits, shareholderTally, type Asset, type Crew, type DaoPolicy, type Proposal, type Trade } from '@kumi/sdk';
import type { ChatMessage } from '../lib/api';
import { captainKey, type Session } from '../lib/session';
import { captainTrade, fileTrade, vote } from './actions';
import { Avatar, Ic, Notice, shortName, Tx } from './bits';
import { IntentsGlyph, TokenLogo } from './logos';

const STATUS: Record<string, string> = { draft: 'Quote ready', filing: 'Filing', voting: 'Voting', executing: 'Executing', executed: 'Executed', failed: 'Not filled', expired: 'Expired' };
const trim = (v: string) => { const n = Number(v); return n === 0 ? '0' : n.toPrecision(5).replace(/\.?0+$/, ''); };

/** A trade pitched in chat: coral proposal header, the attached quote, a butter vote band. */
export function TradeCard({ m, me, crew, trade, proposal, policy, assets, hub, onDone }: {
  m: ChatMessage; me: Session | null; crew: Crew; trade?: Trade; proposal?: Proposal; policy: DaoPolicy; assets: Asset[]; hub: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = m.trade!;
  const q = t.quote;
  const asset = assets.find(a => a.symbol === t.asset);
  const mine = me?.accountId === m.account;
  const isMember = !!me && crew.members.some(([a, n]) => a === me.accountId && BigInt(n) > 0n);
  const status = proposal?.status === 'Expired' ? 'expired' : trade?.status ?? (q ? 'draft' : 'failed');
  const votes = proposal ? shareholderTally(proposal, crew) : null;
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
    try { await fn(); onDone(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(null); }
  }

  return (
    <article className={`trade ${mine ? 'mine' : ''}`} aria-label={`Trade proposal: ${t.side} ${t.asset} ${t.bps / 100}%, ${STATUS[status]}`} data-vote={canVote ? 'open' : undefined}>
      <div className={`trade-top ${t.side}`}>
        <TokenLogo sym={t.asset} size={46} test />
        <div className="trade-title">
          <span className="trade-kind">{t.lane === 'captain' ? 'Captain trade · no vote' : 'Trade proposal · crew vote'}</span>
          <b>{t.side === 'buy' ? 'Buy' : 'Sell'} {t.asset} with {(t.bps / 100).toLocaleString()}%</b>
          <span>pitched by {mine ? 'you' : shortName(m.account)} · {time}</span>
        </div>
        <span className={`status st-${status}`}><i />{STATUS[status]}</span>
      </div>
      <div className="trade-body">
        {t.error && <Notice error>{t.error}</Notice>}
        {trade?.status === 'failed' && <Notice>The vote passed, but the pool moved more than {crew.slippage_bps / 100}% past the attached quote, so it refused the fill. The hub restored every holding; nothing was traded.</Notice>}
        {q && <>
          <div className="quote">
            <div><div className="label">{filled ? 'Crew paid' : 'Crew pays'}</div>
              <div className="v qv"><TokenLogo sym={t.side === 'buy' ? 'NEAR' : t.asset} size={20} test={t.side !== 'buy'} />{filled ? units(trade!.crew_in, t.side === 'buy') : units(q.amount_in, t.side === 'buy')} <small>{t.side === 'buy' ? 'NEAR' : `t${t.asset}`}</small></div></div>
            <span className="arrow" aria-hidden><Ic name="arrow" /></span>
            <div className="r"><div className="label">{filled ? 'Crew got' : 'Pool quote'}</div>
              <div className="v qv qv-r">{filled ? units(trade!.crew_out, t.side !== 'buy') : units(q.pool.amount_out, t.side !== 'buy')} <small>{t.side === 'buy' ? `t${t.asset}` : 'NEAR'}</small><TokenLogo sym={t.side === 'buy' ? t.asset : 'NEAR'} size={20} test={t.side === 'buy'} /></div></div>
          </div>
          <div className="intents">
            <span className="row" style={{ gap: 6 }}><IntentsGlyph size={15} />{intents ? <>NEAR Intents 1Click (mainnet): {trim(intents.amountInFormatted)} → {trim(intents.amountOutFormatted)} {t.side === 'buy' ? t.asset : 'NEAR'}{intents.amountOutUsd ? ` (~$${Number(intents.amountOutUsd).toFixed(2)})` : ''} · dry quote</> : <>NEAR Intents 1Click (mainnet): {'error' in q.intents ? q.intents.error.replace(/^1Click HTTP \d+: /, '').replace('No liquidity available', 'no liquidity at this size') : 'no quote'}</>}</span>
            <span className="mono faint" title={q.hash}>quote {q.hash.slice(0, 8)}</span>
          </div>
          {filled && BigInt(trade!.vault_in) > 0n && <div className="mirror"><Ic name="star" size={15} />Followers mirrored {units(trade!.vault_in, t.side === 'buy')} {t.side === 'buy' ? 'NEAR' : `t${t.asset}`} in the same swap</div>}
        </>}
        {votes && <div className="vote-band">
          <div className="row-between"><span><b>{votes.approve} of {votes.needed}</b> approvals needed · Sputnik #{t.proposalId}</span>
            <span className="row" style={{ gap: 6 }}>{Object.keys(proposal!.votes ?? {}).map(v => <Avatar key={v} id={v} />)}</span></div>
          <div className="seats" aria-hidden>{Array.from({ length: votes.members }, (_, i) => <span key={i} className={`seat ${i < votes.approve ? 'on' : i >= votes.members - votes.reject ? 'no' : ''}`} />)}</div>
          {canVote && <div className="vote-actions">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => act('yes', () => vote(me!, crew.dao, t.proposalId!, proposal!.kind, true, crew.id, m.id))}><Ic name="thumb" size={16} />{busy === 'yes' ? 'Signing…' : 'Vote yes'}</button>
            <button className="btn" disabled={!!busy} onClick={() => act('no', () => vote(me!, crew.dao, t.proposalId!, proposal!.kind, false, crew.id, m.id))}><Ic name="thumbDown" size={16} />{busy === 'no' ? 'Signing…' : 'Vote no'}</button>
          </div>}
          {myVote && <span className="chip chip-butter" style={{ justifySelf: 'start' }}><Ic name={myVote === 'Approve' ? 'thumb' : 'thumbDown'} size={13} />You voted {myVote === 'Approve' ? 'yes' : 'no'}</span>}
          {!isMember && proposal?.status === 'InProgress' && <span className="mini" style={{ fontSize: 13 }}>Only crew members vote.</span>}
        </div>}
        {canFile && <div className="row" style={{ flexWrap: 'wrap' }}><button className="btn btn-primary" disabled={!!busy} onClick={() => act('file', () => fileTrade(me!, hub, crew.id, m.id, q!))}>{busy === 'file' ? 'Filing to the DAO…' : <>Put it to a vote <Ic name="arrow" size={16} /></>}</button><span className="faint" style={{ fontSize: 13 }}>Files a Sputnik proposal. Kumi pays the gas.</span></div>}
        {canCaptain && <button className="btn btn-butter" disabled={!!busy} onClick={() => act('cap', () => captainTrade(hub, crew.id, m.id, q!))}>{busy === 'cap' ? 'Executing…' : 'Execute with the captain key'}</button>}
        {error && <Notice error>{error}</Notice>}
        {m.txs.length > 0 && <div className="txs">{m.txs.map(x => <Tx key={x.hash + x.label} hash={x.hash} label={x.label} />)}</div>}
      </div>
    </article>
  );
}
