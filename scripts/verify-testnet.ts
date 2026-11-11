// Read-only check of the recorded testnet evidence: every transaction hash is re-queried at
// finality, the deployed hub and pool code hashes are compared with the local build, and the crew's
// P&L is recomputed from its receipts. Needs no keys.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { computePnl, getAssets, getMarks, getReceipts, listCrews, rpc, txStatus, txFailure, viewAccount } from '@kumi/sdk';
import { evidenceFile, loadEvidence, ROOT } from './lib.js';

const e = loadEvidence();
// Recorded transactions can outlive the ordinary public node's receipt history.
const archivalRpc = process.env.NEAR_ARCHIVAL_RPC_URL ?? 'https://archival-rpc.testnet.near.org';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const base58 = (bytes: Buffer) => { let n = BigInt('0x' + bytes.toString('hex')); let s = ''; while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; } return s; };
const codeHash = (path: string) => base58(createHash('sha256').update(readFileSync(path)).digest());
let bad = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? '  ok ' : ' FAIL'} ${msg}`); if (!cond) bad++; };

console.log(`Evidence: ${evidenceFile()} (${e.transactions.length} transactions)`);
for (const t of e.transactions) {
  const sender = t.signer;
  const tx = await txStatus(t.hash, sender, archivalRpc);
  const failure = txFailure(tx);
  const expected = /FAILED|slippage|a receipt failed/i.test(t.note ?? '') || t.step.includes('slippage');
  ok(tx.transaction.hash === t.hash && (!failure || expected), `${t.step} ${t.hash}${failure ? ' (expected failed receipt: pool refused the fill)' : ''}`);
  await new Promise(r => setTimeout(r, 1000));
}
const built = { [e.accounts.hub]: `${ROOT}/target/near/kumi_contract/kumi_contract.wasm`, [e.accounts.sol]: `${ROOT}/target/near/kumi_testpool/kumi_testpool.wasm`, [e.accounts.btc]: `${ROOT}/target/near/kumi_testpool/kumi_testpool.wasm` };
for (const [acct, path] of Object.entries(built)) {
  if (!acct || acct === 'undefined') continue;
  try { ok((await viewAccount(acct)).code_hash === codeHash(path), `${acct} runs the locally built ${path.split('/').pop()}`); }
  catch (err) { ok(false, `${acct}: ${String(err)}`); }
}
const crews = await listCrews(e.accounts.hub);
const assets = await getAssets(e.accounts.hub);
for (const c of crews) {
  const pnl = computePnl(await getReceipts(e.accounts.hub, c), c, await getMarks(assets));
  ok(pnl.verified, `crew ${c.id} ${c.name}: ${pnl.verifyNote}; return ${pnl.returnPct.toFixed(2)}%, max drawdown ${pnl.maxDrawdownPct.toFixed(2)}%`);
  const policy = await rpc<{ result: number[] }>('query', { finality: 'final', request_type: 'call_function', account_id: c.dao, method_name: 'get_policy', args_base64: 'e30=' });
  ok(policy.result.length > 0, `crew ${c.id} DAO ${c.dao} answers get_policy (created via sputnikv2.testnet)`);
}
console.log(bad ? `${bad} check(s) failed` : 'All checks passed');
process.exit(bad ? 1 : 0);
