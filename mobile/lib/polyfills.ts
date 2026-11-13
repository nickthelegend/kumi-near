/**
 * Globals Hermes lacks, installed before the NEAR libraries load.
 * - crypto.getRandomValues: ed25519 key generation draws from it (expo-crypto's native CSPRNG).
 * - crypto.subtle.digest('SHA-256'): NEP-366 delegate and chat signatures hash with it (pure-JS @noble/hashes).
 * - TextEncoder/TextDecoder and Buffer: borsh and base64 helpers.
 */
import 'fast-text-encoding';
import * as ExpoCrypto from 'expo-crypto';
import { Buffer } from 'buffer';
import { sha256 } from '@noble/hashes/sha256';

const g = globalThis as any;
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== 'function') {
  g.crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => ExpoCrypto.getRandomValues(array as any) as T;
}
if (!g.crypto.subtle) g.crypto.subtle = {};
if (typeof g.crypto.subtle.digest !== 'function') {
  g.crypto.subtle.digest = async (algo: string | { name: string }, data: ArrayBuffer | ArrayBufferView) => {
    const name = typeof algo === 'string' ? algo : algo.name;
    if (name.toUpperCase().replace('-', '') !== 'SHA256') throw new Error(`digest ${name} is not available on this phone`);
    const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const out = sha256(bytes);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  };
}
if (typeof g.Buffer === 'undefined') g.Buffer = Buffer;
// The SDK bounds every RPC call with AbortSignal.timeout(), which Hermes does not ship.
if (typeof g.AbortSignal !== 'undefined' && typeof g.AbortSignal.timeout !== 'function') {
  g.AbortSignal.timeout = (ms: number) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal; };
}

export {};
