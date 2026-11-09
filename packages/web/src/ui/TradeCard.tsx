import { useState } from 'react';
import { formatNear, formatUnits, tally, type Asset, type Crew, type DaoPolicy, type Proposal, type Trade } from '@kumi/sdk';
import type { ChatMessage } from '../lib/api';
import { captainKey, type Session } from '../lib/session';
import { captainTrade, fileTrade, vote } from './actions';
import { Avatar, Notice, shortName, Tx } from './bits';

const STATUS: Record<string, [string, string]> = {
  draft: ['Quote ready', 'chip'], filing: ['Filing', 'chip'], voting: ['Voting', 'chip chip-coral'], executing: ['Executing', 'chip chip-coral'],
  executed: ['Executed', 'chip chip-butter'], failed: ['Not filled', 'chip chip-rose'], expired: ['Expired', 'chip chip-rose'],
};

const trim = (v: string) => { const n = Number(v); return n === 0 ? '0' : n.toPrecision(5).replace(/\.?0+$/, ''); };

export function TradeCard({ m, me, crew, trade, proposal, policy, assets, hub, onDone }: {
  m: ChatMessage; me: Session | null; crew: Crew; trade?: Trade; proposal?: Proposal; policy: DaoPolicy; assets: Asset[]; hub: string; onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = m.trade!;
  const q = t.quote;
  const asset = assets.find(a => a.symbol === t.asset);
  const mine = me?.accountId === m.account;
  const isMember = !!me && crew.allowed.includes(me.accountId);
  const status = trade?.status ?? (q ? 'draft' : 'failed');
  const [label, cls] = STATUS[proposal?.status === 'Expired' ? 'expired' : status] ?? ['', 'chip'];
  const votes = proposal ? tally(proposal, policy) : null;
  const myVote = me && proposal?.votes?.[me.accountId];
  const canVote = isMember && proposal?.status === 'InProgress' && !myVote;
  const canFile = mine && t.lane === 'vote' && q && t.proposalId === undefined && !t.error;
  const canCaptain = mine && t.lane === 'captain' && q && m.txs.length === 0 && !!captainKey(crew.id);

  async function act(name: string, fn: () => Promise<unknown>) {
    setBusy(name); setError(null);
    try { await fn(); onDone(); } catch (e) { setError(String(e instanceof Error ? e.message : e)); } finally { setBusy(null); }
  }

  const inAmt = q ? (t.side === 'buy' ? `${formatNear(q.amount_in, 4)}` : formatUnits(q.amount_in, asset?.decimals ?? 0, 6)) : '—';
  const outAmt = q ? (t.side === 'buy' ? formatUnits(q.pool.amount_out, asset?.decimals ?? 0, 6) : formatNear(q.pool.amount_out, 4)) : '—';
  const filled = trade?.status === 'executed';
  const intents = q && 'quote' in q.intents ? q.intents.quote : null;

  return (
    <article className={`trade ${mine ? 'mine' : ''}`} aria-label={`Trade: ${t.side} ${t.asset} ${t.bps / 100}%`}>
      <div className="trade-top">
        <span className={`asset asset-${t.asset}`}>{t.asset}</span>
        <div className="trade-title">
          <b>{t.side === 'buy' ? 'Buy' : 'Sell'} {t.asset} · {(t.bps / 100).toLocaleString()}%</b>
          <span>{t.lane === 'captain' ? 'Captain lane, no vote' : 'Crew vote'} · pitched by {shortName(m.account)}</span>
        </div>
        <span className={cls}><span className="dot" />{label}</span>
      </div>
      {t.error && <div style={{ marginTop: 12 }}><Notice error>{t.error}</Notice></div>}
      {trade?.status === 'failed' && <div style={{ marginTop: 12 }}><Notice>The vote passed, but the pool price had moved more than {crew.slippage_bps / 100}% past the attached quote, so the pool refused the fill. The hub restored every holding; nothing was traded.</Notice></div>}
      {q && (
        <>
          <div className="quote">
            <div className="leg"><div className="label">{filled ? 'Crew paid' : 'Crew pays'}</div>
              <div className="v">{filled ? (t.side === 'buy' ? formatNear(trade!.crew_in, 4) : formatUnits(trade!.crew_in, asset?.decimals ?? 0, 6)) : inAmt} <span className="faint" style={{ fontSize: 13 }}>{t.side === 'buy' ? 'NEAR' : `t${t.asset}`}</span></div></div>
            <span className="arrow" aria-hidden>→</span>
            <div className="leg"><div className="label">{filled ? 'Crew got' : 'Pool quote'}</div>
              <div className="v">{filled ? (t.side === 'buy' ? formatUnits(trade!.crew_out, asset?.decimals ?? 0, 6) : formatNear(trade!.crew_out, 4)) : outAmt} <span className="faint" style={{ fontSize: 13 }}>{t.side === 'buy' ? `t${t.asset}` : 'NEAR'}</span></div></div>
          </div>
          <div className="intents">
            <span>{intents ? <>Mainnet 1Click: {trim(intents.amountInFormatted)} → {trim(intents.amountOutFormatted)} {t.side === 'buy' ? t.asset : 'NEAR'}{intents.amountOutUsd ? ` (~$${Number(intents.amountOutUsd).toFixed(2)})` : ''} <span className="chip" style={{ height: 20 }}>dry: true</span></> : <span className="faint">Mainnet 1Click: {'error' in q.intents ? q.intents.error.replace(/^1Click HTTP \d+: /, '').replace('No liquidity available', 'no liquidity at this size') : 'no quote'}</span>}</span>
            <span className="faint mono" title={q.hash}>quote {q.hash.slice(0, 8)}</span>
          </div>
          {filled && BigInt(trade!.vault_in) > 0n && <div className="intents" style={{ marginTop: 6 }}><span className="up">Followers mirrored in the same swap: {t.side === 'buy' ? formatNear(trade!.vault_in, 4) + ' NEAR' : formatUnits(trade!.vault_in, asset?.decimals ?? 0, 6) + ' t' + t.asset}</span></div>}
        </>
      )}
      {votes && (
        <>
          <div className="seats" aria-label={`${votes.approve} of ${votes.needed} approvals needed`}>
            {Array.from({ length: votes.members }, (_, i) => <span key={i} className={`seat ${i < votes.approve ? 'on' : i >= votes.members - votes.reject ? 'no' : ''} ${i === votes.needed - 1 ? 'need' : ''}`} />)}
          </div>
          <div className="vote-row">
            <span className="row" style={{ gap: 8 }}>
              <span className="avatars">{Object.keys(proposal!.votes ?? {}).map(v => <Avatar key={v} id={v} />)}</span>
              <span className="faint" style={{ fontSize: 13 }}>{votes.approve}/{votes.needed} approvals · Sputnik #{t.proposalId}</span>
            </span>
            {canVote && <span className="actions">
              <button className="btn btn-sm btn-butter" disabled={!!busy} onClick={() => act('yes', () => vote(me!, crew.dao, t.proposalId!, proposal!.kind, true, crew.id, m.id))}>{busy === 'yes' ? 'Signing…' : '👍 Approve'}</button>
              <button className="btn btn-sm" disabled={!!busy} onClick={() => act('no', () => vote(me!, crew.dao, t.proposalId!, proposal!.kind, false, crew.id, m.id))}>👎</button>
            </span>}
            {myVote && <span className="chip">You voted {myVote === 'Approve' ? '👍' : '👎'}</span>}
          </div>
        </>
      )}
      {canFile && <div className="row" style={{ marginTop: 14 }}><button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act('file', () => fileTrade(me!, hub, crew.id, m.id, q!))}>{busy === 'file' ? 'Filing to the DAO…' : 'File to the crew DAO'}</button><span className="faint" style={{ fontSize: 13 }}>Signs once; Kumi pays the gas.</span></div>}
      {canCaptain && <div className="row" style={{ marginTop: 14 }}><button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act('cap', () => captainTrade(hub, crew.id, m.id, q!))}>{busy === 'cap' ? 'Executing…' : 'Execute with captain key'}</button></div>}
      {error && <div style={{ marginTop: 12 }}><Notice error>{error}</Notice></div>}
      {m.txs.length > 0 && <div className="txs">{m.txs.map(x => <span key={x.hash + x.label}><Tx hash={x.hash} label={x.label} /></span>)}</div>}
    </article>
  );
}
