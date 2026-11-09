// The full Kumi lifecycle on NEAR testnet, through the same code paths the app uses:
// 3 email sign-ups (relayer-created accounts) -> crew + Sputnik DAO -> joins by meta transaction ->
// /buy in signed chat -> DAO vote executes (x2) -> a follower mirrors a trade -> captain voted in,
// captain trade with the function-call key -> a ragequit -> P&L recomputed from receipts.
// Idempotent: finished steps are skipped. Keys stay in .near-credentials/.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KeyPair } from 'near-api-js';
import {
  computePnl, getAssets, getCrew, getMarks, getProposal, getReceipts, getTrade, listCrews, signChat, signDelegate, TGAS as SDK_TGAS, txUrl,
  type Crew,
} from '@kumi/sdk';
import { createApp } from '../packages/server/src/app.js';
import { Relayer } from '../packages/server/src/relayer.js';
import { Store, type ChatMessage } from '../packages/server/src/store.js';
import { account, credPath, done, fmt, loadEvidence, near, record, ROOT, saveEvidence, TGAS } from './lib.js';

const rootId = process.env.KUMI_RELAYER_ACCOUNT!;
const HUB = process.env.KUMI_HUB!;
if (!rootId || !HUB) throw new Error('Setup required: KUMI_RELAYER_ACCOUNT and KUMI_HUB (run deploy:testnet first)');
const e = loadEvidence();
const relayer = new Relayer({ accountId: rootId, hub: HUB, credentialsFile: credPath(rootId) });
const store = new Store(resolve(ROOT, 'data'));
const app = createApp({ hub: HUB, relayer, store, giftYocto: near(0.2) });
const rootAcc = account(JSON.parse(readFileSync(credPath(rootId), 'utf8')));

type P = { email: string; handle: string; accountId?: string; key: string };
const statePath = resolve(ROOT, '.near-credentials/run-players.json');
const players: Record<string, P> = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
const save = () => writeFileSync(statePath, JSON.stringify(players), { mode: 0o600 });
const kp = (p: P) => KeyPair.fromString(p.key as `ed25519:${string}`);
const call = async (route: string, body: Record<string, unknown>) => app.routes[route](body, new URL('http://x/'));

/** Email sign-in exactly as the web does it: start, then verify the code with a fresh browser key. */
async function signUp(tag: string, email: string, handle: string): Promise<P> {
  if (players[tag]?.accountId) return players[tag];
  players[tag] = players[tag] ?? { email, handle, key: KeyPair.fromRandom('ed25519').toString() };
  save();
  const start = await call('POST /api/auth/start', { email }) as { previewCode?: string; delivery: string };
  if (!start.previewCode) throw new Error('Email delivery is configured; this script reads the testnet preview code, so unset RESEND_API_KEY');
  const r = await call('POST /api/auth/verify', { email, code: start.previewCode, handle, publicKey: kp(players[tag]).getPublicKey().toString() }) as { accountId: string; createdTx?: string };
  players[tag].accountId = r.accountId;
  save();
  if (r.createdTx) e.transactions.push({ step: `signup_${tag}`, hash: r.createdTx, signer: rootId, receiver: r.accountId, explorer: txUrl(r.createdTx), note: `email sign-up (${start.delivery}); relayer created the account` });
  saveEvidence(e);
  console.log(`  ok  signup_${tag.padEnd(23)} ${r.accountId}`);
  return players[tag];
}

/** A NEP-366 meta transaction: the player signs, the relayer submits and pays gas. */
async function meta(step: string, p: P, receiverId: string, methodName: string, args: Record<string, unknown>, deposit = 0n, link?: { crewId: number; messageId: string; label: string }) {
  if (done(e, step)) return null;
  const delegate = await signDelegate({ senderId: p.accountId!, keyPair: kp(p), receiverId, calls: [{ methodName, args, deposit, gas: 280n * SDK_TGAS }] });
  const r = await call('POST /api/relay', { delegate, ...(link ?? {}) }) as Awaited<ReturnType<Relayer['relay']>>;
  e.transactions.push({ step, hash: r.hash, signer: rootId, receiver: p.accountId!, explorer: txUrl(r.hash), note: `meta tx by ${p.accountId}: ${receiverId}.${methodName}${r.failure ? ' FAILED ' + r.failure : ''}` });
  saveEvidence(e);
  if (r.failure) throw new Error(`${step} failed: ${r.failure} (${r.hash})`);
  console.log(`  ok  ${step.padEnd(30)} ${r.hash}`);
  return r;
}

async function say(p: P, crewId: number, text: string): Promise<ChatMessage | undefined> {
  const ts = Date.now();
  const sig = await signChat(kp(p), crewId, p.accountId!, ts, text);
  await app.handleSay({ crewId, account: p.accountId, ts, text, sig, publicKey: kp(p).getPublicKey().toString() });
  return store.messages(crewId).filter(m => m.kind === 'trade' && m.account === p.accountId).at(-1);
}

async function votedTrade(tag: string, proposer: P, voters: P[], crewId: number, dao: string, text: string) {
  let card = store.messages(crewId).find(m => m.kind === 'trade' && m.text === text && m.account === proposer.accountId);
  if (!done(e, `${tag}_propose`)) {
    card = await say(proposer, crewId, text);
    if (!card?.trade?.quote) throw new Error(`No quote for ${text}: ${card?.trade?.error}`);
    const q = card.trade.quote;
    await meta(`${tag}_propose`, proposer, HUB, 'propose_trade', { crew_id: crewId, side: q.side, asset: q.asset, bps: q.bps,
      quote_in: q.amount_in, quote_out: q.pool.amount_out, quote_hash: q.hash }, 0n, { crewId, messageId: card.id, label: `proposed by ${proposer.handle}` });
    card = store.messages(crewId).find(m => m.id === card!.id);
  }
  const pid = card!.trade!.proposalId!;
  const proposalKind = (await getProposal(dao, pid)).kind;
  for (const v of voters) {
    await meta(`${tag}_vote_${v.handle}`, v, dao, 'act_proposal', { id: pid, action: 'VoteApprove', proposal: proposalKind }, 0n, { crewId, messageId: card!.id, label: `👍 ${v.handle}` });
  }
  const t = await getTrade(HUB, crewId, card!.trade!.tradeId!);
  if (t?.status !== 'executed') throw new Error(`${tag}: trade is ${t?.status}`);
  return t;
}

console.log(`Relayer ${rootId}: ${fmt(await relayer.balance())} NEAR`);
const mika = await signUp('p1', 'mika@crew.kumi.test', 'mika');
const bo = await signUp('p2', 'bo@crew.kumi.test', 'bo');
const juno = await signUp('p3', 'juno@crew.kumi.test', 'juno');

// The crew and its Sputnik DAO, created through sputnikv2.testnet by the hub. Kumi pays the DAO's
// code storage on testnet so players never need 5.5 NEAR.
let crews = await listCrews(HUB);
let crew: Crew | undefined = crews.find(c => c.name === 'Night Owls');
if (!crew) {
  const slug = `owls-${Date.now().toString(36).slice(-4)}`;
  record(e, 'create_crew', await rootAcc.functionCall({ contractId: HUB, methodName: 'create_crew', gas: 300n * TGAS, attachedDeposit: BigInt(e.config.dao_deposit as string),
    args: { name: 'Night Owls', slug, members: [mika.accountId, bo.accountId, juno.accountId], fee_bps: 2000 } }), 'factory create + policy check');
  for (let i = 0; i < 15 && !crew; i++) {
    await new Promise(r => setTimeout(r, 2000)); // views read at 'final'; give the callbacks time to finalize
    crew = (await listCrews(HUB)).find(c => c.name === 'Night Owls');
  }
  if (!crew) throw new Error('Crew was not registered (DAO creation failed; deposit refunded)');
}
const crewId = crew.id;
e.accounts.dao = crew.dao;
saveEvidence(e);

await meta('join_mika', mika, HUB, 'join', { crew_id: crewId }, near(0.15));
await meta('join_bo', bo, HUB, 'join', { crew_id: crewId }, near(0.12));
await meta('join_juno', juno, HUB, 'join', { crew_id: crewId }, near(0.1));

// Vote 1: buy SOL with 30% of the treasury.
await votedTrade('vote1', mika, [mika, bo], crewId, crew.dao, '/buy SOL 30%');

// A follower deposits; the next trade is mirrored in the same swap.
const fan = await signUp('f1', 'rin@fans.kumi.test', 'rin');
await meta('follow_rin', fan, HUB, 'follow', { crew_id: crewId }, near(0.1));
const t2 = await votedTrade('vote2', bo, [bo, juno], crewId, crew.dao, '/buy SOL 20%');
if (BigInt(t2.vault_in) === 0n || BigInt(t2.vault_out) === 0n) throw new Error('Follower vault was not mirrored');

// Captain lane: the crew votes Juno captain; the vote installs a function-call key on the hub.
const capPath = resolve(ROOT, `.near-credentials/captain-${crewId}.json`);
if (!existsSync(capPath)) writeFileSync(capPath, JSON.stringify({ account_id: HUB, private_key: KeyPair.fromRandom('ed25519').toString() }), { mode: 0o600, flag: 'wx' });
const capKey = KeyPair.fromString(JSON.parse(readFileSync(capPath, 'utf8')).private_key);
const policy = { account_id: juno.accountId, public_key: capKey.getPublicKey().toString(), max_bps: 1500, max_daily: 3, assets: ['SOL'] };
let capPid = e.config.captain_proposal as number | undefined;
if (capPid === undefined) {
  const r = await meta('captain_propose', mika, crew.dao, 'add_proposal', { proposal: { description: `Kumi: make ${juno.handle} captain (max 15% a trade, 3 a day, SOL only)`,
    kind: { FunctionCall: { receiver_id: HUB, actions: [{ method_name: 'set_captain', args: Buffer.from(JSON.stringify({ crew_id: crewId, captain: policy })).toString('base64'), deposit: '0', gas: '100000000000000' }] } } } });
  capPid = Number(JSON.parse(r!.value ?? 'null'));
  if (!Number.isInteger(capPid)) throw new Error('add_proposal returned no proposal id');
  e.config.captain_proposal = capPid;
  saveEvidence(e);
}
const capKind = (await getProposal(crew.dao, capPid)).kind;
await meta('captain_vote_mika', mika, crew.dao, 'act_proposal', { id: capPid, action: 'VoteApprove', proposal: capKind });
await meta('captain_vote_bo', bo, crew.dao, 'act_proposal', { id: capPid, action: 'VoteApprove', proposal: capKind });
crew = (await getCrew(HUB, crewId))!;
if (crew.captain?.public_key !== policy.public_key) throw new Error('Captain was not installed');

// Captain trade: signed by the function-call key on the hub, executes at once within limits.
if (!done(e, 'captain_trade')) {
  const card = await say(juno, crewId, '/captain sell SOL 10%');
  if (!card?.trade?.quote) throw new Error(`No captain quote: ${card?.trade?.error}`);
  const q = card.trade.quote;
  const cap = account({ account_id: HUB, private_key: capKey.toString() });
  const out = await cap.functionCall({ contractId: HUB, methodName: 'captain_trade', gas: 100n * TGAS,
    args: { crew_id: crewId, side: q.side, asset: q.asset, bps: q.bps, quote_in: q.amount_in, quote_out: q.pool.amount_out, quote_hash: q.hash } });
  record(e, 'captain_trade', out, 'signed by the captain function-call key on the hub');
  await new Promise(r => setTimeout(r, 4000));
  await call('POST /api/record', { crewId, messageId: card.id, hash: (out as unknown as { transaction: { hash: string } }).transaction.hash });
}

// Ragequit: Bo registers on the SOL token, then leaves with the exact share. No vote.
const sol = (await getAssets(HUB)).find(a => a.symbol === 'SOL')!;
await meta('bo_register_sol', bo, sol.token, 'storage_deposit', {}, near(0.00125));
crew = (await getCrew(HUB, crewId))!;
const boShares = crew.members.find(m => m[0] === bo.accountId)?.[1];
if (boShares) await meta('ragequit_bo', bo, HUB, 'ragequit', { crew_id: crewId, shares: boShares });

// Proof of P&L, recomputed from the receipts.
crew = (await getCrew(HUB, crewId))!;
const assets = await getAssets(HUB);
const pnl = computePnl(await getReceipts(HUB, crew), crew, await getMarks(assets));
e.state = { crew, pnl: { pps: pnl.pps, returnPct: pnl.returnPct, maxDrawdownPct: pnl.maxDrawdownPct, verified: pnl.verified, note: pnl.verifyNote } };
e.accounts.players = [mika, bo, juno].map(p => p.accountId).join(',');
e.accounts.follower = fan.accountId!;
saveEvidence(e);
console.log(`Done. ${e.transactions.length} transactions recorded. P&L verified: ${pnl.verified}. Relayer left: ${fmt(await relayer.balance())} NEAR`);
