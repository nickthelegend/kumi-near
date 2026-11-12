import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { kumiEvents, rpc, txFailure, txStatus, txUrl, viewAccount, type TxStatus } from '@kumi/sdk';
import { ROOT } from './e2e-support.js';

export const ONE = 10n ** 24n;
export const TGAS = 10n ** 12n;
const TOTAL_CAP = 3n * ONE / 10n;
type Row = { step: string; hash: string; signer: string; explorer: string; gas_yocto: string; deposits_yocto: string; cumulative_yocto: string; events: string[]; failure: string | null };
type Evidence = { network: 'testnet'; status: 'running' | 'complete'; started_at: string; total_cap_yocto: string; transactions: Row[]; [key: string]: unknown };
export class Budget {
  readonly file: string;
  readonly evidence: Evidence;
  private scopeStart: bigint | null = null;
  constructor(file: string) {
    this.file = resolve(ROOT, file);
    this.evidence = existsSync(this.file) ? JSON.parse(readFileSync(this.file, 'utf8')) : {
      network: 'testnet', status: 'running', started_at: new Date().toISOString(), total_cap_yocto: TOTAL_CAP.toString(), transactions: [],
    };
    if (this.evidence.network !== 'testnet' || this.evidence.status !== 'running') throw new Error('Evidence is sealed; choose a new KUMI_E2E_EVIDENCE file');
    this.save();
  }
  get spent() { return this.evidence.transactions.reduce((sum, r) => sum + BigInt(r.gas_yocto) + BigInt(r.deposits_yocto), 0n); }
  beginFullRun() { this.scopeStart = BigInt(String(this.evidence.full_run_baseline_yocto ?? this.spent)); this.evidence.full_run_baseline_yocto = this.scopeStart.toString(); this.evidence.full_run_started_at = new Date().toISOString(); this.save(); }
  get fullSpent() { return this.scopeStart === null ? 0n : this.spent - this.scopeStart; }
  async guard(step: string, signer: string, gas: bigint, deposit = 0n, depositor = signer) {
    if (!signer.endsWith('.testnet') || !depositor.endsWith('.testnet')) throw new Error('Testnet accounts only');
    const price = BigInt((await rpc<{ gas_price: string }>('gas_price', [null])).gas_price);
    const reserve = gas * price * 11n / 10n + deposit;
    if (this.spent + reserve > TOTAL_CAP) throw new Error(`BLOCKED: budget guard refused ${step}; ${TOTAL_CAP - this.spent} yoctoNEAR remains, ${reserve} is reserved for gas and deposit`);
    if (this.scopeStart !== null && this.fullSpent + reserve > ONE / 10n) throw new Error(`BLOCKED: full-run budget refused ${step}; ${ONE / 10n - this.fullSpent} yoctoNEAR remains, ${reserve} is reserved`);
    const account = await viewAccount(signer);
    const free = BigInt(account.amount) - BigInt(account.storage_usage) * 10n ** 19n;
    if (free < gas * price * 11n / 10n + (depositor === signer ? deposit : 0n)) throw new Error(`BLOCKED: ${signer} balance too low for ${step}`);
    if (depositor !== signer && deposit > 0n) {
      const sender = await viewAccount(depositor);
      if (BigInt(sender.amount) - BigInt(sender.storage_usage) * 10n ** 19n < deposit) throw new Error(`BLOCKED: ${depositor} deposit balance too low`);
    }
  }
  async record(step: string, hash: string, signer: string, deposit = 0n) {
    if (this.evidence.transactions.some(r => r.hash === hash)) return;
    const tx = await txStatus(hash, signer);
    const accounting = tx as unknown as { transaction_outcome: { outcome: { tokens_burnt: string } }; receipts_outcome: { outcome: { tokens_burnt: string } }[] };
    const fee = BigInt(accounting.transaction_outcome.outcome.tokens_burnt) + accounting.receipts_outcome.reduce((sum, r) => sum + BigInt(r.outcome.tokens_burnt), 0n);
    const row: Row = { step, hash, signer, explorer: txUrl(hash), gas_yocto: fee.toString(), deposits_yocto: deposit.toString(), cumulative_yocto: (this.spent + fee + deposit).toString(), events: kumiEvents(tx).map(e => e.event), failure: txFailure(tx) };
    this.evidence.transactions.push(row); this.save();
    console.log(`${step}: ${hash}; cumulative ${Number(this.spent) / 1e24} NEAR`);
    if (this.spent > TOTAL_CAP || this.scopeStart !== null && this.fullSpent > ONE / 10n) throw new Error('Testnet budget exceeded');
    if (row.failure) throw new Error(`${step} failed; inspect the recorded receipt ${hash}`);
  }
  async write<T>(step: string, signer: string, gas: bigint, deposit: bigint, send: () => Promise<T & { transaction: { hash: string } }>, depositor = signer) {
    await this.guard(step, signer, gas, deposit, depositor);
    const result = await send(); await this.record(step, result.transaction.hash, signer, deposit); return result;
  }
  save() { writeFileSync(this.file, JSON.stringify(this.evidence, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n'); }
}
