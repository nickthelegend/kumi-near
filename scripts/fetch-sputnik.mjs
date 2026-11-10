// Fetches the live Sputnik DAO v2 factory code and its default DAO code from NEAR testnet,
// checks both against on-chain SHA-256 code hashes, and writes them for the sandbox test.
// Also fetches the Nov 9 Kumi hub code from an archival node for the upgrade test.
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const RPC = process.env.NEAR_RPC_URL ?? 'https://test.rpc.fastnear.com';
const FACTORY = process.env.KUMI_DAO_FACTORY ?? 'sputnikv2.testnet';
const OUT = 'target/sputnik';
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58(bytes) {
  let n = BigInt('0x' + Buffer.from(bytes).toString('hex'));
  let out = '';
  while (n > 0n) { out = ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; out = '1' + out; }
  return out;
}
const sha = bytes => base58(createHash('sha256').update(bytes).digest());
async function rpc(params) {
  const response = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'sputnik', method: 'query', params: { finality: 'final', ...params } }) });
  if (!response.ok) throw new Error(`NEAR RPC HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || body.result?.error) throw new Error(`NEAR RPC: ${JSON.stringify(body.error ?? body.result.error).slice(0, 300)}`);
  return body.result;
}
const view = async (method, args = {}) => Buffer.from((await rpc({ request_type: 'call_function', account_id: FACTORY,
  method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') })).result);

await mkdir(OUT, { recursive: true });

// The hub exactly as deployed on testnet on Nov 9 (before ragequit removed DAO votes), read from an
// archival node at a fixed block and hash-checked. The upgrade test deploys it, makes a member
// ragequit under the old code, upgrades to the new code and removes that member's vote.
const LEGACY_HUB = { account: 'hub.kumi-77b50457fb.testnet', block: 277045304, hash: 'EB2tb1Ttn8FWYsbt8yApk8z5cnpjdHDrMz1z9y2i9kpB' };
const legacyPath = `${OUT}/kumi-hub-2026-11-09.wasm`;
let legacyOk = false;
try { legacyOk = sha(await readFile(legacyPath)) === LEGACY_HUB.hash; } catch { /* fetch below */ }
if (!legacyOk) {
  const ARCHIVAL = process.env.NEAR_ARCHIVAL_RPC_URL ?? 'https://archival-rpc.testnet.fastnear.com';
  const r = await fetch(ARCHIVAL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'hub',
    method: 'query', params: { request_type: 'view_code', account_id: LEGACY_HUB.account, block_id: LEGACY_HUB.block } }) });
  if (!r.ok) throw new Error(`Archival RPC HTTP ${r.status}`);
  const body = await r.json();
  if (body.error || !body.result?.code_base64) throw new Error(`Archival RPC: ${JSON.stringify(body.error ?? body.result).slice(0, 300)}`);
  const code = Buffer.from(body.result.code_base64, 'base64');
  if (sha(code) !== LEGACY_HUB.hash) throw new Error('Nov 9 hub code does not match its recorded code hash');
  await writeFile(legacyPath, code);
  console.log(`Fetched the Nov 9 testnet hub (${code.length} bytes, ${LEGACY_HUB.hash}) at block ${LEGACY_HUB.block}.`);
}
const manifestPath = `${OUT}/manifest.json`;
try {
  const cached = JSON.parse(await readFile(manifestPath, 'utf8'));
  const factory = await readFile(`${OUT}/factory.wasm`); const dao = await readFile(`${OUT}/dao.wasm`);
  if (sha(factory) === cached.factory_code_hash && sha(dao) === cached.dao_code_hash) {
    console.log(`Sputnik code cached: factory ${cached.factory_code_hash}, DAO v${cached.dao_version.join('.')} ${cached.dao_code_hash}`);
    process.exit(0);
  }
} catch { /* fetch below */ }
const account = await rpc({ request_type: 'view_account', account_id: FACTORY });
const code = await rpc({ request_type: 'view_code', account_id: FACTORY });
const factory = Buffer.from(code.code_base64, 'base64');
if (sha(factory) !== account.code_hash) throw new Error('Factory code does not match its on-chain code hash');
const daoHash = JSON.parse((await view('get_default_code_hash')).toString());
const daoVersion = JSON.parse((await view('get_default_version')).toString());
const dao = await view('get_code', { code_hash: daoHash });
if (sha(dao) !== daoHash) throw new Error('DAO code does not match the factory default code hash');
await writeFile(`${OUT}/factory.wasm`, factory);
await writeFile(`${OUT}/dao.wasm`, dao);
await writeFile(manifestPath, JSON.stringify({ rpc: RPC, factory: FACTORY, factory_code_hash: account.code_hash,
  dao_code_hash: daoHash, dao_version: daoVersion, fetched_at: new Date().toISOString() }, null, 2) + '\n');
console.log(`Fetched ${FACTORY} (${factory.length} bytes) and default DAO v${daoVersion.join('.')} (${dao.length} bytes); hashes verified.`);
