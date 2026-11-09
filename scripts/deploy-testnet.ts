// Deploys Kumi on NEAR testnet: the hub, a test SOL pool seeded at a public spot ratio, and the hub's
// storage registration. Idempotent: finished steps are read back from the evidence file.
//   KUMI_RELAYER_ACCOUNT=<root>.testnet pnpm deploy:testnet
// Optional: KUMI_WITH_BTC=1 adds a test BTC pool (needs ~2.2 NEAR more).
import { readFileSync } from 'node:fs';
import { KeyPair } from 'near-api-js';
import { accountExists, viewAccount, view, SPUTNIK_TESTNET_FACTORY } from '@kumi/sdk';
import { account, credPath, done, fmt, loadEvidence, near, readCreds, record, saveCreds, saveEvidence, ROOT, TGAS, type Creds } from './lib.js';

const rootId = process.env.KUMI_RELAYER_ACCOUNT;
if (!rootId) throw new Error('Setup required: KUMI_RELAYER_ACCOUNT (a funded testnet account with its key in .near-credentials/<id>.json)');
const root = readCreds(credPath(rootId));
const rootAcc = account(root);
const e = loadEvidence();
e.accounts.root = rootId;
const HUB = `hub.${rootId}`;
const DAO_DEPOSIT = near(5.5);
const assetsWanted = [{ symbol: 'SOL', sub: 'tsol', decimals: 9, intents: 'nep141:sol.omft.near', coinbase: 'SOL-USD' },
  ...(process.env.KUMI_WITH_BTC === '1' ? [{ symbol: 'BTC', sub: 'tbtc', decimals: 8, intents: 'nep141:btc.omft.near', coinbase: 'BTC-USD' }] : [])];

async function sub(name: string, balance: bigint): Promise<Creds> {
  const id = `${name}.${rootId}`;
  let creds: Creds;
  try { creds = readCreds(credPath(id)); } catch {
    creds = { account_id: id, private_key: KeyPair.fromRandom('ed25519').toString() };
    saveCreds(creds);
  }
  if (!await accountExists(id)) {
    const pk = KeyPair.fromString(creds.private_key as `ed25519:${string}`).getPublicKey().toString();
    record(e, `create_${name}`, await rootAcc.createAccount(id, pk, balance));
  }
  return creds;
}

async function spot(pair: string): Promise<{ usd: number; url: string; at: string }> {
  const url = `https://api.coinbase.com/v2/prices/${pair}/spot`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Coinbase spot ${pair}: HTTP ${r.status}`);
  const usd = Number(((await r.json()) as { data: { amount: string } }).data.amount);
  if (!(usd > 0)) throw new Error(`Coinbase spot ${pair}: no price`);
  return { usd, url, at: new Date().toISOString() };
}

console.log(`Root ${rootId}: ${fmt(BigInt((await viewAccount(rootId)).amount))} NEAR`);
const hubCreds = await sub('hub', near(4.3));
const hub = account(hubCreds);
const wasm = (p: string) => new Uint8Array(readFileSync(`${ROOT}/target/near/${p}`));
if (!done(e, 'deploy_hub')) record(e, 'deploy_hub', await hub.deployContract(wasm('kumi_contract/kumi_contract.wasm')));

const near_usd = await spot('NEAR-USD');
const assets: { symbol: string; token: string; decimals: number; intents_asset: string }[] = [];
for (const a of assetsWanted) {
  const creds = await sub(a.sub, near(1.9));
  const token = account(creds);
  if (!done(e, `deploy_${a.sub}`)) record(e, `deploy_${a.sub}`, await token.deployContract(wasm('kumi_testpool/kumi_testpool.wasm')));
  if (!done(e, `init_${a.sub}`)) {
    record(e, `init_${a.sub}`, await token.functionCall({ contractId: creds.account_id, methodName: 'new', gas: 30n * TGAS,
      args: { owner: rootId, name: `Kumi test ${a.symbol}`, symbol: a.symbol, decimals: a.decimals, total_supply: (1_000_000n * 10n ** BigInt(a.decimals)).toString() } }));
  }
  if (!done(e, `liquidity_${a.sub}`)) {
    // Seed at the public spot ratio so test prices track the real asset at deploy time.
    const px = await spot(a.coinbase);
    const nearIn = near(Number(process.env.KUMI_POOL_NEAR ?? '0.5'));
    const tokenAmount = BigInt(Math.round(Number(nearIn) / 1e24 * near_usd.usd / px.usd * 10 ** a.decimals));
    e.config[`${a.sub}_seed`] = { near_usd: near_usd.usd, asset_usd: px.usd, source: [near_usd.url, px.url], at: px.at, near_in: nearIn.toString(), token_in: tokenAmount.toString() };
    record(e, `liquidity_${a.sub}`, await rootAcc.functionCall({ contractId: creds.account_id, methodName: 'add_liquidity', gas: 30n * TGAS,
      args: { token_amount: tokenAmount.toString() }, attachedDeposit: nearIn }), `${a.symbol} seeded at Coinbase spot ${px.usd} USD vs NEAR ${near_usd.usd} USD`);
  }
  assets.push({ symbol: a.symbol, token: creds.account_id, decimals: a.decimals, intents_asset: a.intents });
}

if (!done(e, 'init_hub')) {
  record(e, 'init_hub', await hub.functionCall({ contractId: HUB, methodName: 'new', gas: 30n * TGAS,
    args: { owner: rootId, factory: SPUTNIK_TESTNET_FACTORY, dao_deposit: DAO_DEPOSIT.toString(), assets } }));
} else {
  const listed = await view<{ symbol: string }[]>(HUB, 'get_assets');
  for (const a of assets) if (!listed.some(l => l.symbol === a.symbol) && !done(e, `add_asset_${a.symbol}`)) {
    record(e, `add_asset_${a.symbol}`, await rootAcc.functionCall({ contractId: HUB, methodName: 'add_asset', gas: 30n * TGAS, args: { asset: a } }));
  }
}
for (const a of assets) {
  const step = `hub_storage_${a.symbol}`;
  if (!done(e, step)) record(e, step, await hub.functionCall({ contractId: a.token, methodName: 'storage_deposit', gas: 30n * TGAS, args: {}, attachedDeposit: near(0.00125) }));
}
e.accounts.hub = HUB;
for (const a of assets) e.accounts[a.symbol.toLowerCase()] = a.token;
e.config.factory = SPUTNIK_TESTNET_FACTORY;
e.config.dao_deposit = DAO_DEPOSIT.toString();
saveEvidence(e);
console.log(`Hub ${HUB} ready with ${assets.map(a => a.symbol).join(', ')}. Root left: ${fmt(BigInt((await viewAccount(rootId)).amount))} NEAR`);
