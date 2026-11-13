// Sends testnet NEAR from the relayer (the repo's testnet funder) to an account, recorded in the phone-session evidence.
//   KUMI_EVIDENCE=deployments/phone-2026-11-13.json pnpm tsx scripts/send-near.ts <account> <near> "<why>"
import { account, credPath, fmt, loadEvidence, near, readCreds, record } from './lib.js';

if (process.env.KUMI_RELAYER_ACCOUNT === undefined) process.loadEnvFile('.env');
const [to, amount, why] = process.argv.slice(2);
if (!to || !amount) throw new Error('usage: send-near.ts <account> <near> "<why>"');
const rootId = process.env.KUMI_RELAYER_ACCOUNT!;
const e = loadEvidence();
record(e, `send_${to.split('.')[0]}_${Date.now()}`, await account(readCreds(credPath(rootId))).sendMoney(to, near(Number(amount))), `relayer -> ${to} (${fmt(near(Number(amount)))} NEAR)${why ? `: ${why}` : ''}`);
