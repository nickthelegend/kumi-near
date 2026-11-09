// NEP-366 meta transactions. A player's browser key signs a DelegateAction; the Kumi relayer
// wraps it in a transaction and pays the gas, so players never hold NEAR for gas or see a wallet.
import { Buffer } from 'buffer';
import { KeyPair, PublicKey } from '@near-js/crypto';
import { actionCreators, buildDelegateAction, encodeSignedDelegate, signDelegateAction, SCHEMA, type SignedDelegate } from '@near-js/transactions';
import { deserialize } from 'borsh';
import { latestBlock, TESTNET_RPC, viewAccessKey } from './chain.js';

export const TGAS = 10n ** 12n;

export type CallSpec = { methodName: string; args: Record<string, unknown>; gas?: bigint; deposit?: bigint };

/** Signs a delegate action for `receiverId` with the player's key. Returns base64 borsh. */
export async function signDelegate(opts: { senderId: string; keyPair: KeyPair; receiverId: string; calls: CallSpec[]; rpc?: string; ttlBlocks?: number }): Promise<string> {
  const rpc = opts.rpc ?? TESTNET_RPC;
  const publicKey = opts.keyPair.getPublicKey();
  const [key, block] = await Promise.all([viewAccessKey(opts.senderId, publicKey.toString(), rpc), latestBlock(rpc)]);
  const actions = opts.calls.map(c => actionCreators.functionCall(c.methodName, Buffer.from(JSON.stringify(c.args)), c.gas ?? 100n * TGAS, c.deposit ?? 0n));
  const delegateAction = buildDelegateAction({
    senderId: opts.senderId, receiverId: opts.receiverId, actions,
    nonce: BigInt(key.nonce) + 1n, maxBlockHeight: BigInt(block.height + (opts.ttlBlocks ?? 120)), publicKey,
  });
  // NEP-366: ed25519 over sha256(NEP-461 prefix || borsh(DelegateAction)).
  const { signedDelegateAction } = await signDelegateAction({ delegateAction, signer: {
    sign: async (message: Uint8Array) => opts.keyPair.sign(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", message as Uint8Array<ArrayBuffer>))).signature,
  } });
  return Buffer.from(encodeSignedDelegate(signedDelegateAction)).toString('base64');
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
