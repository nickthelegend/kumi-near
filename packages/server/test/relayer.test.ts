// The relayer allow-list, checked against the live testnet hub (its crews' DAOs and pools are read
// on-chain). Delegates are real NEP-366 encodings signed with throwaway keys; nothing is sent.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Buffer } from 'buffer';
import { KeyPair } from '@near-js/crypto';
import { actionCreators, buildDelegateAction, encodeSignedDelegate, signDelegateAction } from '@near-js/transactions';
import { checkDelegate } from '../src/relayer.js';

const ev = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../deployments/testnet-2026-11-09.json'), 'utf8'));
const ctx = { relayerId: ev.accounts.root as string, hub: ev.accounts.hub as string, rpc: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" };
const kp = KeyPair.fromRandom('ed25519');

async function signed(senderId: string, receiverId: string, methodName: string, args: object, deposit = 0n, gas = 100n * 10n ** 12n) {
  const delegateAction = buildDelegateAction({ senderId, receiverId, actions: [actionCreators.functionCall(methodName, Buffer.from(JSON.stringify(args)), gas, deposit)],
    nonce: 1n, maxBlockHeight: 1n, publicKey: kp.getPublicKey() });
  const { signedDelegateAction } = await signDelegateAction({ delegateAction, signer: { sign: async (m: Uint8Array) => kp.sign(new Uint8Array(await crypto.subtle.digest('SHA-256', m as Uint8Array<ArrayBuffer>))).signature } });
  return Buffer.from(encodeSignedDelegate(signedDelegateAction)).toString('base64');
}
const player = `mika.${ctx.relayerId}`;

describe('relayer allow-list', () => {
  it('relays a crew-DAO vote but never a player deposit (the relayer would pay it)', async () => {
    const r = await checkDelegate(await signed(player, ctx.hub, 'join', { crew_id: 0 }, 10n ** 22n), ctx);
    expect(r.ok ? 'ok' : r.reason).toMatch(/sent by the player directly/);
    expect((await checkDelegate(await signed(player, ev.accounts.dao, 'act_proposal', { id: 0, action: 'VoteApprove' }), ctx)).ok).toBe(true);
  }, 30_000);
  it('refuses outsiders, foreign contracts, big deposits and dangerous DAO actions', async () => {
    const reason = async (b64: Promise<string>) => { const r = await checkDelegate(await b64, ctx); return r.ok ? 'ok' : r.reason; };
    expect(await reason(signed('someone.testnet', ctx.hub, 'join', { crew_id: 0 }))).toMatch(/Only Kumi player accounts/);
    expect(await reason(signed(player, 'wrap.testnet', 'near_deposit', {}))).toMatch(/not a Kumi contract/);
    expect(await reason(signed(player, ctx.hub, 'join', { crew_id: 0 }, 2n * 10n ** 24n))).toMatch(/sent by the player directly/);
    expect(await reason(signed(player, ctx.hub, 'add_asset', {}))).toMatch(/not relayed/);
    expect(await reason(signed(player, ev.accounts.dao, 'act_proposal', { id: 0, action: 'RemoveProposal' }))).toMatch(/approve and reject/);
    expect(await reason(signed(player, ev.accounts.dao, 'add_proposal', { proposal: { kind: { Transfer: { receiver_id: player, amount: '1' } } } }))).toMatch(/captain and crew invite/);
    expect(await reason(Promise.resolve('bm90IGEgZGVsZWdhdGU='))).toMatch(/Not a NEP-366/);
  }, 30_000);
});

it('limits invitation role proposals to current shareholders and the crew role', async () => {
  const role = (name = 'crew') => ({ proposal: { kind: { AddMemberToRole: { member_id: 'fresh.testnet', role: name } } } });
  expect((await checkDelegate(await signed(player, ev.accounts.dao, 'add_proposal', role()), ctx)).ok).toBe(true);
  expect((await checkDelegate(await signed(`outsider.${ctx.relayerId}`, ev.accounts.dao, 'add_proposal', role()), ctx)).ok).toBe(false);
  expect((await checkDelegate(await signed(player, ev.accounts.dao, 'add_proposal', role('council')), ctx)).ok).toBe(false);
  expect((await checkDelegate(await signed(player, ctx.hub, 'propose_invite', { crew_id: 0, account_id: 'fresh.testnet', role_proposal_id: 0 }), ctx)).ok).toBe(true);
  expect((await checkDelegate(await signed(player, ctx.hub, 'add_member', { crew_id: 0, account_id: 'fresh.testnet' }), ctx)).ok).toBe(false);
}, 30_000);
