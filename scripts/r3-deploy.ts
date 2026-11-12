// Upgrade the existing hub only. Credentials are loaded by file path, never logged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { getCrew, listCrews, viewAccessKeys, viewAccount } from '@kumi/sdk';
import { account, credPath, readCreds } from './lib.js';
import { Budget, ONE, TGAS } from './r3-evidence.js';
import { ROOT } from './e2e-support.js';
import evidence from '../deployments/testnet-2026-11-09.json' with { type: 'json' };
const { root, hub } = evidence.accounts;
const budget = new Budget(`deployments/r3-${new Date().toISOString().slice(0, 10)}.json`);
const rootAccount = account(readCreds(credPath(root))), hubAccount = account(readCreds(credPath(hub)));
const before = await getCrew(hub, 0); assert(before); assert.equal((await listCrews(hub)).length, 1);
const keys = await viewAccessKeys(hub); assert(keys.keys.some(k => k.access_key.permission === 'FullAccess'), 'Do not alter the hub key');
const wasm = readFileSync(`${ROOT}/target/near/kumi_contract/kumi_contract.wasm`);
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n = BigInt('0x' + createHash('sha256').update(wasm).digest('hex')), hash = '';
while (n) { hash = alphabet[Number(n % 58n)] + hash; n /= 58n; }
const old = await viewAccount(hub);
budget.evidence.before = { code_hash: old.code_hash, storage_usage: old.storage_usage, crew_count: 1 };
budget.evidence.new_code_hash = hash; budget.save();
if (old.code_hash !== hash) {
  // Preserve the treasury's native holdings while funding added code and receipt storage.
  const available = BigInt(old.amount) - BigInt(old.storage_usage) * 10n ** 19n;
  const treasury = BigInt(before.near) + BigInt(before.vault_near);
  const oldCodeBytes = (await import('@kumi/sdk')).query<{ code_base64: string }>({ request_type: 'view_code', account_id: hub });
  const growth = BigInt(Math.max(0, wasm.length - Buffer.from((await oldCodeBytes).code_base64, 'base64').length)) * 10n ** 19n;
  const topUp = growth + (treasury > available ? treasury - available : 0n) + 3n * ONE / 100n;
  budget.evidence.storage_topup_yocto = topUp.toString(); budget.save();
  await budget.write('hub_storage_buffer', root, 30n * TGAS, topUp, () => rootAccount.sendMoney(hub, topUp) as never);
  await budget.write('deploy_invitation_gate', hub, 50n * TGAS, 0n, () => hubAccount.deployContract(wasm) as never);
}
assert.equal((await viewAccount(hub)).code_hash, hash);
assert.deepEqual(await getCrew(hub, 0), before, 'Upgrade must preserve crew state');
const permissions = (list: typeof keys) => list.keys.map(k => ({ public_key: k.public_key, permission: k.access_key.permission })).sort((a, b) => a.public_key.localeCompare(b.public_key));
assert.deepEqual(permissions(await viewAccessKeys(hub)), permissions(keys), 'Upgrade must preserve all keys');
assert.equal((await listCrews(hub)).length, 1);
budget.evidence.deployed = true; budget.save();
console.log('PASS: existing hub upgraded; crew state and full-access key preserved');
