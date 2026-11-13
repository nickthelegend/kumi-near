// NEP-366 meta transactions. A player's browser key signs a DelegateAction; the Kumi relayer
// wraps it in a transaction and pays the gas, so players never hold NEAR for gas or see a wallet.
import { Buffer } from 'buffer';
import { KeyPair, PublicKey } from '@near-js/crypto';
import { type Action, actionCreators, buildDelegateAction, createTransaction, encodeSignedDelegate, encodeTransaction, signDelegateAction, Signature, SignedTransaction, SCHEMA, type SignedDelegate } from '@near-js/transactions';
import { deserialize } from 'borsh';
import { latestBlock, rpc, rpcUrl, viewAccessKey, type TxStatus } from './chain.js';

export const TGAS = 10n ** 12n;

// Two delegates signed in quick succession must not reuse a nonce even if a read lags.
const lastNonce = new Map<string, bigint>();
function nextNonce(pk: string, onChain: bigint): bigint {
  const n = onChain + 1n > (lastNonce.get(pk) ?? 0n) ? onChain + 1n : lastNonce.get(pk)! + 1n;
  lastNonce.set(pk, n);
  return n;
}

export type CallSpec = { methodName: string; args: Record<string, unknown>; gas?: bigint; deposit?: bigint };

/** Signs a delegate action for `receiverId` with the player's key. Returns base64 borsh. */
export async function signDelegate(opts: { senderId: string; keyPair: KeyPair; receiverId: string; calls: CallSpec[]; rpc?: string; ttlBlocks?: number }): Promise<string> {
  const rpc = opts.rpc ?? rpcUrl();
  const publicKey = opts.keyPair.getPublicKey();
  const [key, block] = await Promise.all([viewAccessKey(opts.senderId, publicKey.toString(), rpc), latestBlock(rpc)]);
  const actions = opts.calls.map(c => actionCreators.functionCall(c.methodName, Buffer.from(JSON.stringify(c.args)), c.gas ?? 100n * TGAS, c.deposit ?? 0n));
  const delegateAction = buildDelegateAction({
    senderId: opts.senderId, receiverId: opts.receiverId, actions,
    nonce: nextNonce(publicKey.toString(), BigInt(key.nonce)), maxBlockHeight: BigInt(block.height + (opts.ttlBlocks ?? 120)), publicKey,
  });
  // NEP-366: ed25519 over sha256(NEP-461 prefix || borsh(DelegateAction)).
  const { signedDelegateAction } = await signDelegateAction({ delegateAction, signer: {
    sign: async (message: Uint8Array) => opts.keyPair.sign(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", message as Uint8Array<ArrayBuffer>))).signature,
  } });
  return Buffer.from(encodeSignedDelegate(signedDelegateAction)).toString('base64');
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes: Uint8Array): string {
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let out = ''; while (n > 0n) { out = B58[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b) break; out = '1' + out; }
  return out;
}
function unb58(text: string): Uint8Array {
  let n = 0n; for (const c of text) { const i = B58.indexOf(c); if (i < 0) throw new Error('bad base58'); n = n * 58n + BigInt(i); }
  const out: number[] = []; while (n > 0n) { out.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of text) { if (c !== '1') break; out.unshift(0); }
  return new Uint8Array(out);
}

/**
 * A transaction the player signs and pays for directly (attached NEAR comes from the player's own account; NEP-366
 * would make the relayer pay attached deposits). Sent with send_tx (wait_until INCLUDED, so an invalid transaction fails loudly), then polled to FINAL. Returns the final status.
 */
export async function sendDirect(opts: { senderId: string; keyPair: KeyPair; receiverId: string; calls: CallSpec[]; rpc?: string }): Promise<TxStatus> {
  const actions = opts.calls.map(c => actionCreators.functionCall(c.methodName, Buffer.from(JSON.stringify(c.args)), c.gas ?? 100n * TGAS, c.deposit ?? 0n));
  return sendActions({ ...opts, actions });
}

/** Signs any actions from `senderId` with `keyPair`, sends with send_tx (INCLUDED) and polls to FINAL. */
export async function sendActions(opts: { senderId: string; keyPair: KeyPair; receiverId: string; actions: Action[]; rpc?: string }): Promise<TxStatus> {
  const url = opts.rpc ?? rpcUrl();
  const publicKey = opts.keyPair.getPublicKey();
  const [key, block] = await Promise.all([viewAccessKey(opts.senderId, publicKey.toString(), url), latestBlock(url)]);
  const actions = opts.actions;
  const tx = createTransaction(opts.senderId, publicKey, opts.receiverId, nextNonce(publicKey.toString(), BigInt(key.nonce)), actions, unb58(block.hash));
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', encodeTransaction(tx) as Uint8Array<ArrayBuffer>));
  const signed = new SignedTransaction({ transaction: tx, signature: new Signature({ keyType: publicKey.keyType, data: opts.keyPair.sign(digest).signature }) });
  const hash = b58(digest);
  try { await rpc('send_tx', { signed_tx_base64: Buffer.from(encodeTransaction(signed)).toString('base64'), wait_until: 'INCLUDED' }, url); }
  catch (e) { if (!/timeout|TIMEOUT/i.test(String(e))) throw e; /* accepted, still waiting: poll below */ }
  for (let i = 0; i < 80; i++) {
    await new Promise(r => setTimeout(r, i ? 1200 : 1500));
    try {
      const st = await rpc<TxStatus & { final_execution_status?: string }>('EXPERIMENTAL_tx_status', { tx_hash: hash, sender_account_id: opts.senderId, wait_until: 'NONE' }, url);
      if (st.final_execution_status === 'FINAL' && st.receipts_outcome?.length) return st;
    } catch { /* not seen yet */ }
  }
  throw new Error(`Transaction ${hash} was sent but not final after 100 s; check it on NearBlocks`);
}

export function decodeDelegate(b64: string): SignedDelegate {
  return deserialize(SCHEMA.SignedDelegate, Buffer.from(b64, 'base64')) as unknown as SignedDelegate;
}

/** A plain description of what a signed delegate will do, for the relayer's allow-list check. */
export function describeDelegate(sd: SignedDelegate): { senderId: string; receiverId: string; publicKey: string; maxBlockHeight: bigint; calls: { methodName: string; args: unknown; deposit: bigint; gas: bigint }[]; other: number } {
  const da = sd.delegateAction;
  const calls: { methodName: string; args: unknown; deposit: bigint; gas: bigint }[] = [];
  let other = 0;
  for (const a of da.actions) {
    const fc = (a as { functionCall?: { methodName: string; args: Uint8Array; gas: bigint; deposit: bigint } }).functionCall;
    if (!fc) { other++; continue; }
    let args: unknown = null;
    try { args = JSON.parse(Buffer.from(fc.args).toString('utf8')); } catch { args = null; }
    calls.push({ methodName: fc.methodName, args, deposit: BigInt(fc.deposit), gas: BigInt(fc.gas) });
  }
  const raw = da.publicKey as unknown as { ed25519Key?: { data: Uint8Array } };
  if (!(raw instanceof PublicKey) && !raw.ed25519Key) throw new Error('Only ed25519 player keys are relayed');
  const pk = raw instanceof PublicKey ? raw : new PublicKey({ keyType: 0, data: new Uint8Array(raw.ed25519Key!.data) });
  return { senderId: da.senderId, receiverId: da.receiverId, publicKey: pk.toString(), maxBlockHeight: BigInt(da.maxBlockHeight), calls, other };
}

/** Chat messages are signed with the same key: ed25519 over sha256 of this canonical string. */
export function chatPayload(crewId: number, accountId: string, ts: number, text: string): string {
  return `kumi-chat:v1\n${crewId}\n${accountId}\n${ts}\n${text}`;
}

export async function signChat(keyPair: KeyPair, crewId: number, accountId: string, ts: number, text: string): Promise<string> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(chatPayload(crewId, accountId, ts, text))));
  return Buffer.from(keyPair.sign(digest).signature).toString('base64');
}

export async function verifyChat(publicKey: string, crewId: number, accountId: string, ts: number, text: string, signatureB64: string): Promise<boolean> {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(chatPayload(crewId, accountId, ts, text))));
  return PublicKey.fromString(publicKey).verify(digest, Buffer.from(signatureB64, 'base64'));
}

export { KeyPair };
