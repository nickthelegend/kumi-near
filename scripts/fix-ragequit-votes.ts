// Ships the ragequit vote fix to NEAR testnet and checks it on the Night Owls crew:
//  1. redeploys the hub (same state layout; the crew must read back unchanged),
//  2. asks the new hub to remove bo, who ragequit on Nov 9 and still held a DAO vote. The Nov 9 DAO
//     policy does not let the hub file a removal, so this must fail loudly and be recorded,
//  3. mika and juno vote the hub's DAO role up to the new permissions (2 of 3, bo not needed),
//  4. anyone retries the removal: bo leaves the DAO's crew role,
//  5. bo tries to vote on an open DAO proposal and the DAO refuses him; mika and juno then reject
//     that check proposal so it doesn't stay open in the app.
// Idempotent: finished steps are read back from the evidence file. Keys are read from gitignored
// .near-credentials/ and never printed.
//   KUMI_RELAYER_ACCOUNT=kumi-77b50457fb.testnet pnpm tsx scripts/fix-ragequit-votes.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transactions } from 'near-api-js';
import { getCrew, getPolicy, getProposal, getReceipts, kumiEvents, txFailure, txUrl, view, viewAccessKeys, viewAccount, type TxStatus } from '@kumi/sdk';
import { account, credPath, done, fmt, ROOT, TGAS, type Evidence } from './lib.js';

const rootId = process.env.KUMI_RELAYER_ACCOUNT;
if (!rootId) throw new Error('Setup required: KUMI_RELAYER_ACCOUNT (the Nov 9 relayer/owner, key in .near-credentials/<id>.json)');
const HUB = `hub.${rootId}`;
const CREW = 0;
const EVIDENCE = resolve(ROOT, 'deployments/testnet-2026-11-10-ragequit-fix.json');
const HUB_PERMISSIONS = ['call:AddProposal', 'remove_member_from_role:AddProposal', 'remove_member_from_role:VoteApprove'];

const e: Evidence = existsSync(EVIDENCE) ? JSON.parse(readFileSync(EVIDENCE, 'utf8'))
  : { network: 'testnet', rpc: 'https://test.rpc.fastnear.com', started_at: new Date().toISOString(), accounts: { root: rootId, hub: HUB }, config: {}, transactions: [] };
const save = () => { mkdirSync(resolve(ROOT, 'deployments'), { recursive: true }); e.updated_at = new Date().toISOString(); writeFileSync(EVIDENCE, JSON.stringify(e, null, 2) + '\n'); };

/** Records a transaction. `expectEvent` must appear among its Kumi events; a failed receipt is
 *  allowed only when `expectFailure` names it (a step meant to show a refusal). */
function record(step: string, outcome: unknown, opts: { note?: string; expectEvent?: string; expectFailure?: string } = {}) {
  const tx = outcome as TxStatus;
  const hash = tx.transaction.hash;
  const failure = txFailure(tx);
  const events = kumiEvents(tx).map(x => x.event);
  e.transactions.push({ step, hash, signer: tx.transaction.signer_id, receiver: tx.transaction.receiver_id, explorer: txUrl(hash),
    note: [opts.note, events.length ? `events: ${events.join(', ')}` : '', failure ? `receipt failure: ${failure}` : ''].filter(Boolean).join('; ') });
  save();
  if (opts.expectFailure ? !failure?.includes(opts.expectFailure) : failure) throw new Error(`${step} (${hash}): unexpected outcome ${failure ?? 'success'}`);
  if (opts.expectEvent && !events.includes(opts.expectEvent)) throw new Error(`${step} (${hash}): expected event ${opts.expectEvent}, got [${events.join(', ')}]`);
  console.log(`  ok  ${step.padEnd(30)} ${hash}`);
  return tx;
}

type P = { accountId: string; key: string };
const players = JSON.parse(readFileSync(resolve(ROOT, '.near-credentials/run-players.json'), 'utf8')) as Record<string, P>;
const player = (handle: string) => {
  const p = Object.values(players).find(x => x.accountId?.startsWith(`${handle}.`));
  if (!p) throw new Error(`No ${handle} in run-players.json`);
  return account({ account_id: p.accountId, private_key: p.key });
};
const root = account(JSON.parse(readFileSync(credPath(rootId), 'utf8')));
const hub = account(JSON.parse(readFileSync(credPath(HUB), 'utf8')));
const [mika, juno, bo] = ['mika', 'juno', 'bo'].map(player);
/** Views read at `final`, a block or two behind a just-sent transaction: retry briefly. */
async function proposal(dao: string, id: number) {
  for (let i = 0; ; i++) {
    try { return await getProposal(dao, id); } catch (err) {
      if (i >= 10 || !String(err).includes('ERR_NO_PROPOSAL')) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}
const crewRole = async (dao: string) => {
  const r = (await getPolicy(dao)).roles.find(x => x.name === 'crew');
  return r && typeof r.kind === 'object' ? (r.kind.Group ?? []) : [];
};

// 0. Preconditions: the hub still has a full-access key, and the crew state to compare against.
const keys = await viewAccessKeys(HUB);
if (!keys.keys.some(k => k.access_key.permission === 'FullAccess')) throw new Error(`BLOCKED: ${HUB} has no full-access key, so it cannot be redeployed`);
const before = await getCrew(HUB, CREW);
if (!before) throw new Error(`No crew ${CREW} on ${HUB}`);
const dao = before.dao;
console.log(`Hub ${HUB}: ${fmt(BigInt((await viewAccount(HUB)).amount))} NEAR; crew ${before.name}; DAO ${dao}`);

// 1. Redeploy the hub. No state migration: the Borsh layout is unchanged.
if (!done(e, 'redeploy_hub')) {
  const wasm = new Uint8Array(readFileSync(`${ROOT}/target/near/kumi_contract/kumi_contract.wasm`));
  record('redeploy_hub', await hub.deployContract(wasm), { note: 'hub code with ragequit vote removal and the vote recount' });
}
const after = await getCrew(HUB, CREW);
for (const k of ['members', 'supply', 'near', 'tokens', 'receipt_count', 'trade_count'] as const) {
  if (JSON.stringify(after![k]) !== JSON.stringify(before[k]) && !done(e, 'remove_bo_retry')) throw new Error(`State changed across the upgrade: ${k}`);
}
console.log('  ok  crew state reads back unchanged after the upgrade');

// 2. The fix-up call for bo (Nov 9 ragequit), with his ragequit receipt as proof.
const boId = bo.accountId;
const receipts = await getReceipts(HUB, after!);
const quit = receipts.filter(r => r.kind === 'ragequit' && r.account_id === boId).at(-1);
if (!quit) throw new Error('No ragequit receipt for bo');
e.config.bo_ragequit_receipt = quit.seq;
if (!done(e, 'remove_bo_first_try')) {
  // The Nov 9 DAO policy only lets the hub file FunctionCall proposals, so the DAO refuses the
  // removal proposal. The hub must record it and log member_removal_failed, not fail silently.
  record('remove_bo_first_try', await root.functionCall({ contractId: HUB, methodName: 'remove_ex_member', gas: 200n * TGAS,
    args: { crew_id: CREW, account_id: boId, ragequit_seq: quit.seq } }),
    { note: 'Nov 9 DAO policy: the DAO refuses the hub, removal recorded as pending', expectEvent: 'member_removal_failed', expectFailure: 'ERR_PERMISSION_DENIED' });
}
const stale = await view<string[]>(HUB, 'get_stale_voters', { crew_id: CREW });
console.log(`  ..  stale voters now: ${JSON.stringify(stale)}; crew role: ${JSON.stringify(await crewRole(dao))}`);

// 3. mika and juno upgrade the hub's DAO role.
if (!done(e, 'hub_role_propose')) {
  const kind = { ChangePolicyAddOrUpdateRole: { role: { name: 'hub', kind: { Group: [HUB] }, permissions: HUB_PERMISSIONS, vote_policy: {} } } };
  const tx = record('hub_role_propose', await mika.functionCall({ contractId: dao, methodName: 'add_proposal', gas: 100n * TGAS,
    args: { proposal: { description: 'Kumi: let the hub remove the vote of a member who ragequit (remove_member_from_role only)', kind } } }));
  e.config.hub_role_proposal = JSON.parse(Buffer.from((tx.status as { SuccessValue: string }).SuccessValue, 'base64').toString());
  save();
}
const hubRolePid = Number(e.config.hub_role_proposal);
for (const [step, who] of [['hub_role_vote_mika', mika], ['hub_role_vote_juno', juno]] as const) {
  if (done(e, step)) continue;
  const p = await proposal(dao, hubRolePid);
  if (p.status !== 'InProgress') break;
  record(step, await who.functionCall({ contractId: dao, methodName: 'act_proposal', gas: 100n * TGAS, args: { id: hubRolePid, action: 'VoteApprove', proposal: p.kind } }));
}
let hubRole = (await getPolicy(dao)).roles.find(r => r.name === 'hub');
for (let i = 0; i < 10 && !HUB_PERMISSIONS.every(x => hubRole?.permissions.includes(x)); i++) {
  await new Promise(r => setTimeout(r, 1500));
  hubRole = (await getPolicy(dao)).roles.find(r => r.name === 'hub');
}
if (!HUB_PERMISSIONS.every(x => hubRole?.permissions.includes(x))) throw new Error('The hub role was not upgraded');
console.log(`  ok  hub role permissions: ${hubRole!.permissions.join(', ')}`);

// 4. Retry: bo leaves the DAO's crew role.
if (!done(e, 'remove_bo_retry')) {
  record('remove_bo_retry', await root.functionCall({ contractId: HUB, methodName: 'remove_ex_member', gas: 200n * TGAS,
    args: { crew_id: CREW, account_id: boId, ragequit_seq: null } }), { note: 'hub files and approves RemoveMemberFromRole', expectEvent: 'member_removed' });
}
let role = await crewRole(dao);
for (let i = 0; i < 10 && role.includes(boId); i++) { await new Promise(r => setTimeout(r, 1500)); role = await crewRole(dao); }
if (role.includes(boId)) throw new Error('bo is still in the crew role');
const crewNow = await getCrew(HUB, CREW);
console.log(`  ok  crew role: ${JSON.stringify(role)}; hub members: ${JSON.stringify(crewNow!.allowed)}; stale: ${JSON.stringify(await view(HUB, 'get_stale_voters', { crew_id: CREW }))}`);

// 5. bo tries to vote on an open proposal: refused by the DAO.
if (!done(e, 'check_proposal')) {
  const tx = record('check_proposal', await mika.functionCall({ contractId: dao, methodName: 'add_proposal', gas: 100n * TGAS,
    args: { proposal: { description: 'Kumi check: can an ex-member still vote? (to be rejected)', kind: 'Vote' } } }));
  e.config.check_proposal = JSON.parse(Buffer.from((tx.status as { SuccessValue: string }).SuccessValue, 'base64').toString());
  save();
}
const checkPid = Number(e.config.check_proposal);
if (!done(e, 'bo_vote_refused')) {
  // returnError: the refusal is the expected outcome, so take the outcome instead of a thrown error.
  const outcome = await bo.signAndSendTransaction({ receiverId: dao, returnError: true, actions: [transactions.functionCall('act_proposal',
    Buffer.from(JSON.stringify({ id: checkPid, action: 'VoteApprove', proposal: 'Vote' })), 50n * TGAS, 0n)] });
  record('bo_vote_refused', outcome, { note: 'ex-member vote refused by the DAO', expectFailure: 'ERR_PERMISSION_DENIED' });
}
for (const [step, who] of [['check_reject_mika', mika], ['check_reject_juno', juno]] as const) {
  if (done(e, step)) continue;
  const p = await proposal(dao, checkPid);
  if (p.status !== 'InProgress') break;
  record(step, await who.functionCall({ contractId: dao, methodName: 'act_proposal', gas: 50n * TGAS, args: { id: checkPid, action: 'VoteReject', proposal: 'Vote' } }));
}
e.state = { crew_role: role, hub_members: crewNow!.allowed, hub_role_permissions: hubRole!.permissions,
  check_proposal_status: (await proposal(dao, checkPid)).status, stale_voters: await view(HUB, 'get_stale_voters', { crew_id: CREW }),
  hub_code_hash: (await viewAccount(HUB)).code_hash };
save();
console.log(`Done. Root left ${fmt(BigInt((await viewAccount(rootId)).amount))} NEAR. Evidence: ${EVIDENCE}`);
