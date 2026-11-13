// One crew action from a Kumi QA account, sent through the running Kumi server exactly as the web and phone apps
// send them: a signed chat line over the WebSocket, or a NEP-366 delegate relayed by /api/relay (the relayer pays gas).
// Node's built-in WebSocket client. Keys are read from the gitignored .near-credentials/run-players.json by handle and are never printed.
//   pnpm tsx scripts/crew-act.ts say mika "/buy SOL 10%"
//   pnpm tsx scripts/crew-act.ts file-invite mika ren.kumi-77b50457fb.testnet
//   pnpm tsx scripts/crew-act.ts file-trade mika
//   pnpm tsx scripts/crew-act.ts vote juno            (approves the newest card with an open proposal)
//   pnpm tsx scripts/crew-act.ts state
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { KeyPair, getCrew, getProposal, shareholderTally, signChat, signDelegate, setDefaultRpc, TGAS } from '@kumi/sdk';
import { ROOT } from './e2e-support.js';

const SERVER = process.env.KUMI_SERVER_URL ?? 'http://127.0.0.1:5411';
const CREW = Number(process.env.KUMI_CREW ?? 0);
setDefaultRpc(`${SERVER}/api/rpc`);
type Player = { accountId: string; handle: string; key: string };
const creds = join(ROOT, '.near-credentials');
const players = Object.values(JSON.parse(readFileSync(join(creds, 'run-players.json'), 'utf8'))) as Player[];
// The QA member left in the crew by the R3 browser run (its key was saved by that harness).
for (const f of readdirSync(creds).filter(n => /^qa[a-z0-9]+-e2e\.json$/.test(n))) players.push(JSON.parse(readFileSync(join(creds, f), 'utf8')) as Player);
const who = (h: string) => { const p = players.find(x => x.handle === h); if (!p) throw new Error(`No QA key for ${h}`); return { ...p, kp: KeyPair.fromString(p.key as `ed25519:${string}`) }; };
type Msg = { id: string; account: string; kind: string; text: string; trade?: { proposalId?: number; quote?: any; tradeId?: number }; invite?: { accountId: string; roleProposalId?: number; proposalId?: number } };

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${SERVER}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json() as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
async function relay(p: ReturnType<typeof who>, receiverId: string, methodName: string, args: Record<string, unknown>, messageId: string, label: string) {
  const gas = (methodName === 'act_proposal' ? 190n : 100n) * TGAS;
  const delegate = await signDelegate({ senderId: p.accountId, keyPair: p.kp, receiverId, calls: [{ methodName, args, gas, deposit: 0n }] });
  const r = await api<{ hash: string; failure: string | null; value: string | null; events: { event: string }[] }>('/api/relay', { delegate, crewId: CREW, messageId, label });
  console.log(`${label}: ${r.hash}${r.failure ? ` FAILED ${r.failure.slice(0, 160)}` : ''} ${r.events.map(e => e.event).join(',')}`);
  if (r.failure && !r.events.some(e => e.event === 'trade_failed')) process.exitCode = 1;
  return r;
}
const messages = () => api<Msg[]>(`/api/messages?crew=${CREW}`);

const [cmd, handle, ...rest] = process.argv.slice(2);
if (cmd === 'say') {
  const p = who(handle!); const text = rest.join(' '); const ts = Date.now();
  const sig = await signChat(p.kp, CREW, p.accountId, ts, text);
  const ws = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/ws?crew=${CREW}`);
  await new Promise<void>((ok, fail) => {
    ws.onopen = () => ws.send(JSON.stringify({ type: 'say', account: p.accountId, ts, text, sig, publicKey: p.kp.getPublicKey().toString() }));
    ws.onmessage = ev => { const m = JSON.parse(String(ev.data)); if (m.type === 'error') fail(new Error(m.error)); if ((m.type === 'message') && m.message.account === p.accountId && m.message.kind !== 'text') { ws.close(); ok(); } if (m.type === 'message' && m.message.kind === 'text' && !/^\/(buy|sell|invite)/.test(text)) { ws.close(); ok(); } };
    setTimeout(() => { ws.close(); ok(); }, 25000);
  });
  console.log(`${handle} said: ${text}`);
} else if (cmd === 'file-invite') {
  const p = who(handle!); const target = rest[0]!;
  const crew = (await getCrew(await hub(), CREW))!;
  const card = [...await messages()].reverse().find(m => m.kind === 'invite' && m.invite?.accountId === target && m.account === p.accountId);
  if (!card) throw new Error('No invite card from that member for that account; send /invite first');
  let roleId = card.invite!.roleProposalId;
  if (roleId === undefined) {
    const r = await relay(p, crew.dao, 'add_proposal', { proposal: { description: `Kumi invite role: ${target}`, kind: { AddMemberToRole: { member_id: target, role: 'crew' } } } }, card.id, 'invitation role filed');
    roleId = Number(r.value);
  }
  await relay(p, await hub(), 'propose_invite', { crew_id: CREW, account_id: target, role_proposal_id: roleId }, card.id, 'invitation gate filed');
} else if (cmd === 'file-trade') {
  const p = who(handle!);
  const card = [...await messages()].reverse().find(m => m.kind === 'trade' && m.account === p.accountId && m.trade?.proposalId === undefined && m.trade?.quote);
  if (!card) throw new Error('No unfiled trade card from that member');
  const q = card.trade!.quote;
  await relay(p, await hub(), 'propose_trade', { crew_id: CREW, side: q.side, asset: q.asset, bps: q.bps, quote_in: q.amount_in, quote_out: q.pool.amount_out, quote_hash: q.hash }, card.id, `proposed by ${p.handle}`);
} else if (cmd === 'vote') {
  const p = who(handle!);
  const crew = (await getCrew(await hub(), CREW))!;
  for (const card of [...await messages()].reverse()) {
    const ids = [card.trade?.proposalId, card.invite?.roleProposalId, card.invite?.proposalId].filter((x): x is number => typeof x === 'number');
    const open = [];
    for (const id of ids) { const pr = await getProposal(crew.dao, id); if (pr.status === 'InProgress' && !pr.votes?.[p.accountId]) open.push(pr); }
    if (!open.length) continue;
    for (const pr of open) await relay(p, crew.dao, 'act_proposal', { id: pr.id, action: 'VoteApprove', proposal: pr.kind }, card.id, `yes · ${p.handle}`);
    break;
  }
} else if (cmd === 'state') {
  const crew = (await getCrew(await hub(), CREW))!;
  console.log('holders', crew.members.filter(([, n]) => BigInt(n) > 0n).map(([a]) => a.split('.')[0]).join(', '), '| allowed', crew.allowed.map(a => a.split('.')[0]).join(', '));
  for (const m of (await messages()).slice(-6)) {
    const id = m.trade?.proposalId ?? m.invite?.proposalId;
    const t = id !== undefined ? shareholderTally(await getProposal(crew.dao, id), crew) : null;
    console.log(m.kind, m.account.split('.')[0], m.text.slice(0, 40), t ? `${t.approve}/${t.needed} of ${t.members}` : '');
  }
} else {
  console.log('usage: crew-act.ts say|file-invite|file-trade|vote <handle> … | state');
}
async function hub() { return (await api<{ hub: string }>('/api/config')).hub; }
