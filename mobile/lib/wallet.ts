import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';
import { ed25519 } from '@noble/curves/ed25519';
import { baseEncode } from '@near-js/utils';
import { KeyPair } from '@kumi/sdk';

/**
 * The on-device NEAR key: one ed25519 key made on this phone and kept in the OS keystore (expo-secure-store, this
 * device only, after first unlock). The relayer creates `<name>.<relayer>.testnet` with this key's public half as a
 * full-access key; the phone signs NEP-366 delegates and chat messages with it and the relayer pays the gas.
 * The secret leaves this module only through revealSecret(), which only the backup screen calls. Nothing logs it.
 * In the web preview (screenshots only) there is no keystore: the key sits in that browser's localStorage.
 */
/** QA only: EXPO_PUBLIC_KUMI_SLOT=<name> keeps a separate key and app state, so a first run can be shown. Unset in builds. */
export const SLOT = process.env.EXPO_PUBLIC_KUMI_SLOT ? `.${process.env.EXPO_PUBLIC_KUMI_SLOT.replace(/[^a-z0-9]/gi, '')}` : '';
const KEY = `kumi.near.key.v1${SLOT}`;
const ACCOUNT = `kumi.near.account.v1${SLOT}`;
const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
export const IS_WEB = Platform.OS === 'web';
let cached: KeyPair | null = null;

async function get(k: string): Promise<string | null> {
  if (IS_WEB) { try { return globalThis.localStorage?.getItem(k) ?? null; } catch { return null; } }
  return SecureStore.getItemAsync(k, OPTS);
}
async function set(k: string, v: string) {
  if (IS_WEB) { globalThis.localStorage?.setItem(k, v); return; }
  await SecureStore.setItemAsync(k, v, OPTS);
}

export type Account = { accountId: string; handle: string };

/** The key's public half (always available once a key exists) and the account it was registered to, if any. */
export async function loadWallet(): Promise<{ publicKey: string | null; account: Account | null }> {
  const s = await get(KEY);
  if (!s) return { publicKey: null, account: null };
  cached = KeyPair.fromString(s as `ed25519:${string}`);
  const a = await get(ACCOUNT);
  return { publicKey: cached.getPublicKey().toString(), account: a ? JSON.parse(a) : null };
}

/** Makes a fresh ed25519 key on this phone (or keeps the one already here). Returns its public key. */
export async function createKey(): Promise<string> {
  if (!cached) {
    const s = await get(KEY);
    cached = s ? KeyPair.fromString(s as `ed25519:${string}`) : freshKey();
    if (!s) await set(KEY, cached.toString());
  }
  return cached.getPublicKey().toString();
}

/** 32 bytes from the OS CSPRNG (expo-crypto), expanded to NEAR's ed25519 secret format (seed || public key). */
function freshKey(): KeyPair {
  const seed = ExpoCrypto.getRandomBytes(32);
  const pub = ed25519.getPublicKey(seed);
  const sk = new Uint8Array(64);
  sk.set(seed); sk.set(pub, 32);
  return KeyPair.fromString(`ed25519:${baseEncode(sk)}` as `ed25519:${string}`);
}

export async function saveAccount(a: Account) { await set(ACCOUNT, JSON.stringify(a)); }

export function keyPair(): KeyPair {
  if (!cached) throw Error('No key on this phone yet.');
  return cached;
}

/** Only for the backup screen, after the owner taps "Reveal". */
export async function revealSecret(): Promise<string> {
  const s = await get(KEY);
  if (!s) throw Error('No key on this phone');
  return s;
}
