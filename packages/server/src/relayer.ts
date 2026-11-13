// The Kumi relayer. It creates players' accounts (sub-accounts of the relayer account, keyed to a
// key generated in the player's browser) and submits their NEP-366 signed delegates, paying gas.
// It only relays calls on an allow-list: the hub, the crews' DAOs, and the listed test pools.
import { readFileSync } from 'node:fs';
import { Account, Connection, InMemorySigner, KeyPair, keyStores, transactions } from 'near-api-js';
import { decodeDelegate, describeDelegate, kumiEvents, listCrews, getAssets, sendActions, txFailure, TESTNET_RPC, accountExists, viewAccessKey, type TxStatus } from '@kumi/sdk';
import { PublicKey } from '@near-js/crypto';

export const ONE_NEAR = 10n ** 24n;
const DAO_DEPOSIT_CAP = 6n * ONE_NEAR;

export type RelayerConfig = { accountId: string; credentialsFile: string; hub: string; rpc?: string; networkId?: string; readRpc?: string };

export class Relayer {
  readonly accountId: string;
  readonly hub: string;
  readonly rpc: string;
  /** Where the relayer polls for finality (defaults to `rpc`); every public fallback is tried too. */
  readonly readRpc: string;
  private account: Account;
  private key: KeyPair;

  constructor(cfg: RelayerConfig) {
    this.accountId = cfg.accountId;
    this.hub = cfg.hub;
    this.rpc = cfg.rpc ?? TESTNET_RPC;
    this.readRpc = cfg.readRpc ?? this.rpc;
    const creds = JSON.parse(readFileSync(cfg.credentialsFile, 'utf8')) as { account_id?: string; private_key?: string };
    if (creds.account_id !== cfg.accountId || !creds.private_key) throw new Error(`Relayer credentials in ${cfg.credentialsFile} do not belong to ${cfg.accountId}`);
    const keyStore = new keyStores.InMemoryKeyStore();
    this.key = KeyPair.fromString(creds.private_key as `ed25519:${string}`);
    keyStore.setKey(cfg.networkId ?? 'testnet', cfg.accountId, this.key);
    const connection = Connection.fromConfig({ networkId: cfg.networkId ?? 'testnet', provider: { type: 'JsonRpcProvider', args: { url: this.rpc } },
      signer: new InMemorySigner(keyStore), jsvmAccountId: `jsvm.${cfg.networkId ?? 'testnet'}` });
    this.account = new Account(connection, cfg.accountId);
  }

  /** Players are `<handle>.<relayer>`; the handle is lowercase letters, digits and dashes. */
  playerAccountId(handle: string): string {
    const h = handle.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').slice(0, 20);
    if (h.length < 2) throw new Error('Pick a name with at least 2 letters or digits');
    return `${h}.${this.accountId}`;
  }

  async createPlayer(accountId: string, publicKey: string, gift: bigint): Promise<string> {
    if (!accountId.endsWith(`.${this.accountId}`)) throw new Error('Players are sub-accounts of the relayer');
    if (await accountExists(accountId, this.rpc)) throw new Error(`${accountId} already exists`);
    const outcome = await this.send(accountId, [transactions.createAccount(), transactions.transfer(gift), transactions.addKey(PublicKey.fromString(publicKey), transactions.fullAccessKey())]);
    const failure = txFailure(outcome);
    if (failure) throw new Error(`Account creation failed: ${failure}`);
    // Wait until the key is readable at 'final', so the player can sign right away.
    for (let i = 0; i < 20; i++) {
      try { await viewAccessKey(accountId, publicKey, this.rpc); break; } catch { await new Promise(r => setTimeout(r, 1500)); }
    }
    return outcome.transaction.hash;
  }

  /** Checks a signed delegate against the allow-list. Returns a reason when it is refused. */
  check(b64: string) { return checkDelegate(b64, { relayerId: this.accountId, hub: this.hub, rpc: this.rpc }); }

  /** Wraps the signed delegate in a transaction from the relayer and waits for finality. */
  async relay(b64: string): Promise<{ hash: string; sender: string; receiver: string; methods: string[]; failure: string | null; events: ReturnType<typeof kumiEvents>; value: string | null }> {
    const checked = await this.check(b64);
    if (!checked.ok) throw new RelayRefused(checked.reason);
    const signed = decodeDelegate(b64);
    const action = transactions.Action ? new transactions.Action({ signedDelegate: signed } as never) : null;
    if (!action) throw new Error('near-api-js has no SignedDelegate action');
    // Wait for every receipt (cross-contract callbacks included) at FINAL.
    const tx = await this.send(checked.summary.senderId, [action]);
    const hash = tx.transaction.hash;
    const failure = txFailure(tx);
    const last = [...tx.receipts_outcome].reverse().find(r => r.outcome.status.SuccessValue && r.outcome.executor_id === checked.summary.receiverId);
    const value = last?.outcome.status.SuccessValue ? Buffer.from(last.outcome.status.SuccessValue, 'base64').toString('utf8') : null;
    return { hash, sender: checked.summary.senderId, receiver: checked.summary.receiverId, methods: checked.summary.calls.map(c => c.methodName), failure, events: kumiEvents(tx), value };
  }

  async balance(): Promise<bigint> { return BigInt((await this.account.state()).amount); }

  /**
   * Signs a transaction from the relayer and sends it through the SDK (send_tx INCLUDED, then FINAL), which spreads
   * load over the read provider and the public fallbacks and skips any that are rate-limiting.
   */
  private async send(receiverId: string, actions: unknown[]): Promise<TxStatus> {
    return sendActions({ senderId: this.accountId, keyPair: this.key as never, receiverId, actions: actions as never, rpc: this.readRpc });
  }
}

/** The relayer's allow-list: player senders only, Kumi contracts only, capped deposits and gas. */
export async function checkDelegate(b64: string, ctx: { relayerId: string; hub: string; rpc: string }): Promise<{ ok: true; summary: ReturnType<typeof describeDelegate> } | { ok: false; reason: string }> {
  let summary: ReturnType<typeof describeDelegate>;
  try { summary = describeDelegate(decodeDelegate(b64)); }
  catch (e) { return { ok: false, reason: `Not a NEP-366 signed delegate: ${String(e).slice(0, 120)}` }; }
  if (!summary.senderId.endsWith(`.${ctx.relayerId}`)) return { ok: false, reason: 'Only Kumi player accounts can use the relayer' };
  if (summary.other > 0 || summary.calls.length === 0) return { ok: false, reason: 'Only function calls are relayed' };
  const crews = await listCrews(ctx.hub, ctx.rpc);
  const daos = new Set(crews.map(c => c.dao));
  const tokens = new Set((await getAssets(ctx.hub, ctx.rpc)).map(a => a.token));
  for (const c of summary.calls) {
    if (summary.receiverId === ctx.hub) {
      if (!['join', 'propose_invite', 'propose_trade', 'ragequit', 'follow', 'unfollow', 'claim_token', 'crystallize_fee', 'create_crew'].includes(c.methodName)) return { ok: false, reason: `hub.${c.methodName} is not relayed` };
      // A delegate's attached NEAR is paid by the relayer, so player money (chip in, follow) is never relayed: the
      // player's own account sends it as a normal transaction.
      if (c.methodName !== 'create_crew' && c.deposit > 0n) return { ok: false, reason: 'Attached NEAR is sent by the player directly, not relayed' };
      if (c.deposit > DAO_DEPOSIT_CAP) return { ok: false, reason: 'Deposit above the relayer cap' };
    } else if (daos.has(summary.receiverId)) {
      if (c.methodName === 'act_proposal') {
        const action = (c.args as { action?: string })?.action;
        if (action !== 'VoteApprove' && action !== 'VoteReject') return { ok: false, reason: 'Only approve and reject votes are relayed' };
      } else if (c.methodName === 'add_proposal') {
        const kind = (c.args as { proposal?: { kind?: Record<string, unknown> } })?.proposal?.kind;
        const role = kind?.AddMemberToRole as { member_id?: string; role?: string } | undefined;
        const crew = crews.find(c => c.dao === summary.receiverId)!;
        if (role) {
          if (Object.keys(kind!).length !== 1 || role.role !== 'crew' || !role.member_id || role.member_id.length > 64 || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*(?:\.[a-z0-9]+(?:[-_][a-z0-9]+)*)*\.testnet$/.test(role.member_id) || !crew.members.some(([a, n]) => a === summary.senderId && BigInt(n) > 0n)) return { ok: false, reason: 'Only current shareholders can propose a testnet crew invite' };
        } else {
          const call = kind?.FunctionCall as { receiver_id?: string; actions?: { method_name: string }[] } | undefined;
          if (!call || call.receiver_id !== ctx.hub || !call.actions?.length || !call.actions.every(a => ['set_captain', 'revoke_captain'].includes(a.method_name))) return { ok: false, reason: 'Only captain and crew invite proposals are relayed' };
        }
      } else return { ok: false, reason: `DAO method ${c.methodName} is not relayed` };
      if (c.deposit > 0n) return { ok: false, reason: 'DAO calls carry no deposit' };
    } else if (tokens.has(summary.receiverId)) {
      if (c.methodName !== 'storage_deposit') return { ok: false, reason: 'Only token storage registration is relayed' };
      if (c.deposit > 0n) return { ok: false, reason: 'Attached NEAR is sent by the player directly, not relayed' };
    } else return { ok: false, reason: `Receiver ${summary.receiverId} is not a Kumi contract` };
    if (c.gas > 300n * 10n ** 12n) return { ok: false, reason: 'Gas above 300 Tgas' };
  }
  return { ok: true, summary };
}

export class RelayRefused extends Error {}
