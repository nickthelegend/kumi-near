// Tops up a crew's Sputnik DAO so it can store new proposals (Sputnik charges proposal storage to the DAO account).
// Sends from the relayer (the repo's testnet funder) and records the tx in the phone-session evidence file.
//   KUMI_EVIDENCE=deployments/phone-2026-11-13.json pnpm tsx scripts/fund-dao.ts 0.2
import { getCrew, viewAccount } from '@kumi/sdk';
import { account, credPath, fmt, loadEvidence, near, readCreds, record } from './lib.js';

if (process.env.KUMI_RELAYER_ACCOUNT === undefined) process.loadEnvFile('.env');
const rootId = process.env.KUMI_RELAYER_ACCOUNT!;
const hub = process.env.KUMI_HUB!;
const crew = (await getCrew(hub, Number(process.env.KUMI_CREW ?? 0)))!;
const amount = near(Number(process.argv[2] ?? '0.2'));
const e = loadEvidence();
e.accounts.dao = crew.dao; e.accounts.relayer = rootId; e.accounts.hub = hub;
record(e, `fund_dao_storage_${Date.now()}`, await account(readCreds(credPath(rootId))).sendMoney(crew.dao, amount), `relayer -> ${crew.dao} (${fmt(amount)} NEAR) for proposal storage`);
console.log(`${crew.dao}: ${fmt(BigInt((await viewAccount(crew.dao)).amount))} NEAR`);
