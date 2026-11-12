// Public receipt verification only. This command never loads credentials or writes to testnet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCrew, getInvites, listCrews, txFailure, txStatus, view, viewAccessKeys, viewAccount } from '@kumi/sdk';
import deployment from '../deployments/testnet-2026-11-09.json' with { type: 'json' };
const file = resolve(import.meta.dirname, '..', process.argv[2] ?? 'deployments/r3-2026-11-12.json');
const evidence = JSON.parse(readFileSync(file, 'utf8')) as { network: string; new_code_hash: string; transactions: { step: string; hash: string; signer: string; gas_yocto: string; deposits_yocto: string; cumulative_yocto: string }[] };
assert.equal(evidence.network, 'testnet'); let spent = 0n;
for (const row of evidence.transactions) {
  const tx = await txStatus(row.hash, row.signer, process.env.NEAR_ARCHIVAL_RPC_URL);
  assert.equal(txFailure(tx), null, `Failed receipt: ${row.hash}`); assert.equal(tx.transaction.hash, row.hash);
  const accounting = tx as unknown as { transaction_outcome: { outcome: { tokens_burnt: string } }; receipts_outcome: { outcome: { tokens_burnt: string } }[] };
  const fee = BigInt(accounting.transaction_outcome.outcome.tokens_burnt) + accounting.receipts_outcome.reduce((n, r) => n + BigInt(r.outcome.tokens_burnt), 0n);
  assert.equal(fee.toString(), row.gas_yocto, `Fee mismatch: ${row.hash}`);
  spent += fee + BigInt(row.deposits_yocto); assert.equal(spent.toString(), row.cumulative_yocto); console.log(`PASS ${row.step}: ${row.hash}`);
}
assert(spent <= 3n * 10n ** 23n, 'R3 spend exceeds 0.3 NEAR');
const hub = deployment.accounts.hub, account = await viewAccount(hub), keys = await viewAccessKeys(hub);
assert.equal(account.code_hash, evidence.new_code_hash); assert(keys.keys.some(k => k.access_key.permission === 'FullAccess'));
assert.equal((await listCrews(hub)).length, 1);
const crew = await getCrew(hub, 0); assert(crew);
const invitations = await getInvites(hub, 0);
for (const invite of invitations.filter(i => i.status === 'admitted')) {
  for (const id of [invite.role_proposal_id, invite.dao_proposal_id]) {
    const proposal: { status: string } = await view<{ status: string }>(crew.dao, 'get_proposal', { id }); assert.equal(proposal.status, 'Approved');
  }
}
console.log(`PASS: ${evidence.transactions.length} receipts, exact recorded fees, one crew, deployed code and full-access key; ${Number(spent) / 1e24} NEAR gross allocation and gas`);
console.log(`Current native free balance ${Number(BigInt(account.amount) - BigInt(account.storage_usage) * 10n ** 19n) / 1e24}; crew + vault native books ${Number(BigInt(crew.near) + BigInt(crew.vault_near)) / 1e24}`);
