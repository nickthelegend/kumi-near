import { afterEach, expect, it, vi } from 'vitest';
import { rpc, TESTNET_RPC, TESTNET_RPC_FALLBACKS } from '../src/chain.js';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('uses the backup testnet provider when the primary times out with HTTP 408', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn(async (url: string | URL | Request) => String(url) === TESTNET_RPC
    ? new Response('Request Timeout', { status: 408 })
    : Response.json({ jsonrpc: '2.0', id: 'kumi', result: { healthy: true } }));
  vi.stubGlobal('fetch', fetch);
  const result = rpc('status', [], TESTNET_RPC);
  await vi.runAllTimersAsync();
  await expect(result).resolves.toEqual({ healthy: true });
  expect(fetch.mock.calls.some(([url]) => TESTNET_RPC_FALLBACKS.includes(String(url)))).toBe(true);
});

it('skips a provider that reports a rate limit inside a 200 body', async () => {
  const fetch = vi.fn(async (url: string | URL | Request) => String(url) === TESTNET_RPC
    ? Response.json({ jsonrpc: '2.0', id: 'kumi', error: { code: -429, message: 'Rate limits exceeded' } })
    : Response.json({ jsonrpc: '2.0', id: 'kumi', result: { healthy: true } }));
  vi.stubGlobal('fetch', fetch);
  await expect(rpc('status', [], TESTNET_RPC)).resolves.toEqual({ healthy: true });
});
