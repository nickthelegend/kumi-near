import { afterEach, expect, it, vi } from 'vitest';
import { rpc, TESTNET_RPC } from '../src/chain.js';

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
  expect(fetch.mock.calls.some(([url]) => String(url) === 'https://rpc.testnet.near.org')).toBe(true);
});
