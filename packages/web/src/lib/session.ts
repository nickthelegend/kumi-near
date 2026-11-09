// The player's NEAR key lives in this browser (localStorage). It signs chat messages and NEP-366
// delegates; the relayer pays gas. No wallet pop-ups.
import { KeyPair, signChat, signDelegate, type CallSpec } from '@kumi/sdk';
import { useSyncExternalStore } from 'react';

export type Session = { accountId: string; handle: string; key: string };
const KEY = 'kumi:session:v1';
const CAPTAIN = (crewId: number) => `kumi:captain:v1:${crewId}`;

const listeners = new Set<() => void>();
let cached: Session | null | undefined;

function read(): Session | null {
  if (cached !== undefined) return cached;
  try { cached = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { cached = null; }
  return cached ?? null;
}
export function setSession(s: Session | null) {
  cached = s;
  try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* private mode */ }
  listeners.forEach(l => l());
}
export function useSession(): Session | null {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, read, () => null);
}
export const keyPair = (s: Session) => KeyPair.fromString(s.key as `ed25519:${string}`);
export const newKey = () => KeyPair.fromRandom('ed25519');

export async function signedChat(s: Session, crewId: number, text: string) {
  const ts = Date.now();
  const kp = keyPair(s);
  return { type: 'say', crewId, account: s.accountId, ts, text, sig: await signChat(kp, crewId, s.accountId, ts, text), publicKey: kp.getPublicKey().toString() };
}

export async function delegate(s: Session, receiverId: string, calls: CallSpec[]) {
  return signDelegate({ senderId: s.accountId, keyPair: keyPair(s), receiverId, calls });
}

/** The captain's function-call key for a crew, generated here before the crew votes on it. */
export function captainKey(crewId: number): KeyPair | null {
  try { const k = localStorage.getItem(CAPTAIN(crewId)); return k ? KeyPair.fromString(k as `ed25519:${string}`) : null; } catch { return null; }
}
export function makeCaptainKey(crewId: number): KeyPair {
  const existing = captainKey(crewId);
  if (existing) return existing;
  const k = newKey();
  localStorage.setItem(CAPTAIN(crewId), k.toString());
  return k;
}
