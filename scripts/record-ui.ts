// Copies the transactions made by clicking through the web app (linked to chat cards and system
// messages on the server) into the evidence file, each re-checked on-chain first.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { txStatus, txFailure, txUrl } from '@kumi/sdk';
import { loadEvidence, ROOT, saveEvidence } from './lib.js';

const e = loadEvidence();
const chat = JSON.parse(readFileSync(resolve(ROOT, 'data/chat-0.json'), 'utf8')) as { kind: string; text: string; account: string; txs: { label: string; hash: string; account: string }[] }[];
const players = JSON.parse(readFileSync(resolve(ROOT, 'data/players.json'), 'utf8')) as Record<string, { accountId: string; createdTx: string }>;
const known = new Set(e.transactions.map(t => t.hash + t.step));
const add = async (step: string, hash: string, sender: string, note: string) => {
  if (e.transactions.some(t => t.hash === hash && t.step.startsWith('ui_')) || known.has(hash + step)) return;
  if (e.transactions.some(t => t.hash === hash)) return; // already recorded by the scripted run
  const tx = await txStatus(hash, sender);
  const f = txFailure(tx);
  e.transactions.push({ step, hash, signer: tx.transaction.signer_id, receiver: tx.transaction.receiver_id, explorer: txUrl(hash), note: f ? `${note}; a receipt failed: ${f.slice(0, 160)}` : note });
  console.log(`  ok  ${step.padEnd(34)} ${hash}`);
};
for (const p of Object.values(players)) await add(`ui_signup_${p.accountId.split('.')[0]}`, p.createdTx, e.accounts.root, 'email sign-up in the web app');
let i = 0;
for (const m of chat) for (const t of m.txs) {
  const sender = t.account === e.accounts.hub ? e.accounts.hub : e.accounts.root;
  await add(`ui_${++i}_${t.label.replace('👍', 'vote').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`.slice(0, 40), t.hash, sender, `web app: ${m.kind === 'trade' ? m.text + ' · ' : ''}${t.label} by ${t.account}`);
}
saveEvidence(e);
