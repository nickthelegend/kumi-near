// Player actions: each is a NEP-366 delegate signed here and relayed by the Kumi server.
import { Account, Connection, InMemorySigner, keyStores } from 'near-api-js';
import { sendDirect, storageBalance, txFailure, kumiEvents, TGAS, TESTNET_RPC, type TradeQuote } from '@kumi/sdk';
import { api, type RelayResult } from '../lib/api';
import { captainKey, delegate, keyPair, type Session } from '../lib/session';

export async function relay(s: Session, receiverId: string, methodName: string, args: Record<string, unknown>, deposit = 0n, link?: { crewId: number; messageId?: string; label?: string }) {
  const gas = (methodName === 'act_proposal' ? 190n : methodName === 'ragequit' || methodName === 'unfollow' ? 155n : 100n) * TGAS;
  let r: RelayResult;
  if (deposit > 0n) {
    // Attached NEAR comes from the player's own account (a relayed delegate would make Kumi's relayer pay it).
    const tx = await sendDirect({ senderId: s.accountId, keyPair: keyPair(s), receiverId, calls: [{ methodName, args, deposit, gas }] });
    r = link ? await api<RelayResult>('/api/link', { hash: tx.transaction.hash, sender: s.accountId, ...link })
      : { hash: tx.transaction.hash, failure: txFailure(tx), events: kumiEvents(tx), value: null };
  } else {
    const d = await delegate(s, receiverId, [{ methodName, args, deposit, gas }]);
    r = await api<RelayResult>('/api/relay', { delegate: d, ...(link ?? {}) });
  }
  // A pool refusing a fill (ERR_SLIPPAGE) is handled by the hub, which restores holdings and
  // marks the trade failed; that is an outcome, not an error.
  const handled = r.events.some(e => e.event === 'trade_failed');
  if (r.failure && !handled) {
    const reasons: [RegExp, string][] = [
      [/ERR_MIN_DEPOSIT/, 'The minimum deposit is 0.01 testnet NEAR.'],
      [/ERR_NOT_REGISTERED/, 'A token payout needs storage registration on your account.'],
      [/ERR_TRADE_IN_FLIGHT/, 'A trade is settling. Wait for its receipt, then try again.'],
      [/ERR_STALE_VOTES/, 'Membership changed after this trade was proposed. Pitch a new trade.'],
      [/ERR_PERMISSION_DENIED|ERR_DAO_ONLY/, 'Your account cannot approve this action.'],
      [/NotEnoughBalance|lack_balance_for_state|insufficient/i, 'Your testnet account needs more NEAR for this action.'],
    ];
    const message = reasons.find(([pattern]) => pattern.test(r.failure!))?.[1] ?? 'The transaction did not complete. Check its testnet receipt before trying again.';
    throw new Error(`${message} Transaction: ${r.hash}`);
  }
  return r;
}

export const fileTrade = (s: Session, hub: string, crewId: number, messageId: string, q: TradeQuote) =>
  relay(s, hub, 'propose_trade', { crew_id: crewId, side: q.side, asset: q.asset, bps: q.bps, quote_in: q.amount_in, quote_out: q.pool.amount_out, quote_hash: q.hash },
    0n, { crewId, messageId, label: `proposed by ${s.handle}` });

export const vote = (s: Session, dao: string, id: number, kind: unknown, approve: boolean, crewId: number, messageId?: string) =>
  relay(s, dao, 'act_proposal', { id, action: approve ? 'VoteApprove' : 'VoteReject', proposal: kind }, 0n, { crewId, messageId, label: `${approve ? '👍' : '👎'} ${s.handle}` });

/** Registers the player on every token the payout includes, then ragequits. */
async function registerPayout(s: Session, tokens: { token: string }[]) {
  for (const t of tokens) {
    if (!await storageBalance(t.token, s.accountId)) await relay(s, t.token, 'storage_deposit', {}, 1_250_000_000_000_000_000_000n);
  }
}

export async function unfollow(s: Session, hub: string, crew: { id: number; vault_tokens: [string, string][] }, shares: bigint, assets: { symbol: string; token: string }[]) {
  await registerPayout(s, assets.filter(a => crew.vault_tokens.some(([symbol, amount]) => symbol === a.symbol && BigInt(amount) > 0n)));
  return relay(s, hub, 'unfollow', { crew_id: crew.id, shares: shares.toString() }, 0n, { crewId: crew.id, label: 'unfollow' });
}

export async function ragequit(s: Session, hub: string, crew: { id: number }, shares: bigint, tokens: { symbol: string; token: string }[]) {
  await registerPayout(s, tokens);
  return relay(s, hub, 'ragequit', { crew_id: crew.id, shares: shares.toString() }, 0n, { crewId: crew.id, label: 'ragequit' });
}

/** Captain trades are signed with the function-call key on the hub, straight to RPC. */
export async function captainTrade(hub: string, crewId: number, messageId: string, q: TradeQuote) {
  const key = captainKey(crewId);
  if (!key) throw new Error('This browser does not hold the captain key for this crew');
  const ks = new keyStores.InMemoryKeyStore();
  await ks.setKey('testnet', hub, key);
  const connection = Connection.fromConfig({ networkId: 'testnet', provider: { type: 'JsonRpcProvider', args: { url: TESTNET_RPC } }, signer: new InMemorySigner(ks), jsvmAccountId: 'jsvm.testnet' });
  const out = await new Account(connection, hub).functionCall({ contractId: hub, methodName: 'captain_trade', gas: 100n * TGAS,
    args: { crew_id: crewId, side: q.side, asset: q.asset, bps: q.bps, quote_in: q.amount_in, quote_out: q.pool.amount_out, quote_hash: q.hash } });
  const hash = (out as unknown as { transaction: { hash: string } }).transaction.hash;
  return api<RelayResult>('/api/record', { crewId, messageId, hash });
}


/** The native DAO role and the hub admission gate are deliberately separate receipts. */
export async function fileInvite(s: Session, hub: string, crew: { id: number; dao: string }, messageId: string, accountId: string, roleId?: number) {
  if (roleId === undefined) {
    const result = await relay(s, crew.dao, 'add_proposal', { proposal: { description: `Kumi invite role: ${accountId}`, kind: { AddMemberToRole: { member_id: accountId, role: 'crew' } } } }, 0n, { crewId: crew.id, messageId, label: 'invitation role filed' });
    if (result.value === null || !Number.isSafeInteger(Number(result.value))) throw new Error('Missing DAO role proposal receipt');
    roleId = Number(result.value);
  }
  return relay(s, hub, 'propose_invite', { crew_id: crew.id, account_id: accountId, role_proposal_id: roleId }, 0n, { crewId: crew.id, messageId, label: 'invitation gate filed' });
}
