// Moves NEAR from extra helper-created accounts (.near-credentials/kumi-*.testnet.json) into the
// relayer root, keeping 0.05 NEAR in each. Keys are read here and never printed.
import { readdirSync } from 'node:fs';
import { viewAccount } from '@kumi/sdk';
import { account, credPath, fmt, loadEvidence, near, readCreds, record } from './lib.js';

const rootId = process.env.KUMI_RELAYER_ACCOUNT!;
const e = loadEvidence();
for (const f of readdirSync(credPath('x').replace(/x\.json$/, ''))) {
  const m = f.match(/^(kumi-[0-9a-f]+\.testnet)\.json$/);
  if (!m || m[1] === rootId) continue;
  const bal = BigInt((await viewAccount(m[1]).catch(() => ({ amount: '0' }))).amount);
  const move = bal - near(0.05);
  if (move <= near(0.5)) continue;
  record(e, `top_up_from_${m[1]}`, await account(readCreds(credPath(m[1]))).sendMoney(rootId, move), `helper-funded account -> relayer (${fmt(move)} NEAR)`);
}
console.log(`Relayer ${rootId}: ${fmt(BigInt((await viewAccount(rootId)).amount))} NEAR`);
