import { useState } from 'react';
import { shareholderTally, type Proposal } from '@kumi/sdk';
import type { ChatMessage, CrewState } from '../lib/api';
import type { Session } from '../lib/session';
import { fileInvite, vote } from './actions';
import { Avatar, Ic, Notice, shortName, Tx } from './bits';

/** Invitations reuse the approved trade card and vote band. Both DAO votes are visible. */
export function InviteCard({ m, me, st, proposals, hub, onDone }: { m: ChatMessage; me: Session | null; st: CrewState; proposals: Record<number, Proposal>; hub: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const i = m.invite!, crew = st.crew;
  const stored = st.invites.find(x => x.id === i.inviteId);
  const role = proposals[i.roleProposalId ?? -1], gate = proposals[i.proposalId ?? -1];
  const holder = !!me && crew.members.some(([a, n]) => a === me.accountId && BigInt(n) > 0n);
  const admitted = stored?.status === 'admitted';
  const failed = stored?.status === 'failed' || [role, gate].some(p => p && ['Rejected', 'Expired', 'Failed'].includes(p.status));
  const status = admitted ? 'executed' : failed ? 'failed' : gate ? 'voting' : 'draft';
  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); onDone(); }
  }
  async function cast(yes: boolean) {
    for (const p of [role, gate]) if (p?.status === 'InProgress' && !p.votes?.[me!.accountId]) await vote(me!, crew.dao, p.id, p.kind, yes, crew.id, m.id);
  }
  const canVote = holder && !admitted && !failed && [role, gate].some(p => p?.status === 'InProgress' && !p.votes?.[me!.accountId]);
  return <article className={`trade ${me?.accountId === m.account ? 'mine' : ''}`} aria-label={`Invitation: ${i.accountId}`} data-vote={canVote ? 'open' : undefined}>
    <div className="trade-top buy"><Avatar id={i.accountId} /><div className="trade-title"><span className="trade-kind">Member proposal · crew vote</span><b style={{ overflowWrap: 'anywhere' }}>Invite {shortName(i.accountId)}</b><span>pitched by {shortName(m.account)}</span></div><span className={`status st-${status}`}><i />{admitted ? 'Admitted' : failed ? 'Not admitted' : gate ? 'Voting' : 'Ready'}</span></div>
    <div className="trade-body">
      <p className="mini" style={{ overflowWrap: 'anywhere' }}>{i.accountId} joins after both proposals have a strict majority of current shareholders. Then they can chip in.</p>
      {[['DAO crew role', role], ['Hub admission', gate]].map(([label, value]) => {
        const p = value as Proposal | undefined; if (!p) return null;
        const count = shareholderTally(p, crew);
        return <div className="vote-band" key={String(label)}><div className="row-between"><span><b>{count.approve} of {count.needed}</b> approvals · {String(label)} #{p.id} · {p.status}</span></div><div className="seats" aria-hidden>{Array.from({ length: count.members }, (_, n) => <span key={n} className={`seat ${n < count.approve ? 'on' : ''}`} />)}</div></div>;
      })}
      {holder && me?.accountId === m.account && i.proposalId === undefined && !failed && <button className="btn btn-primary" disabled={busy} onClick={() => act(() => fileInvite(me, hub, crew, m.id, i.accountId, i.roleProposalId))}>{busy ? 'Filing…' : 'Put invitation to a vote'}</button>}
      {canVote && <div className="vote-actions"><button className="btn btn-primary" disabled={busy} onClick={() => act(() => cast(true))}><Ic name="thumb" size={16} />{busy ? 'Signing…' : 'Vote yes'}</button><button className="btn" disabled={busy} onClick={() => act(() => cast(false))}>Vote no</button></div>}
      {error && <Notice error>{error}</Notice>}
      {m.txs.length > 0 && <div className="txs">{m.txs.map(t => <Tx key={t.hash + t.label} hash={t.hash} label={t.label} />)}</div>}
    </div>
  </article>;
}
