import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

// Keep the documented read-only preview usable without a funded relayer. Browser reads
// stay same-origin even when the public RPC omits CORS headers or rate-limits a burst.
export function testnetReadProxy(serverUrl: string): Plugin {
  const allowed = new Set(['query', 'block', 'status', 'EXPERIMENTAL_tx_status', 'tx']);
  const cache = new Map<string, { at: number; value: unknown }>();
  const inflight = new Map<string, Promise<unknown>>();
  async function upstream(body: string): Promise<unknown> {
    let failure = 'NEAR testnet RPC is unavailable. Try again shortly.';
    for (const url of ['https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org']) {
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(12000) });
        if (!r.ok) { failure = `NEAR testnet RPC returned HTTP ${r.status}. Try again shortly.`; continue; }
        return await r.json();
      } catch { /* try the next public testnet provider */ }
    }
    throw new Error(failure);
  }
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Content-Type', 'application/json');
    try {
      if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Use POST for RPC reads' })); return; }
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64000) throw new Error('RPC request is too large');
        chunks.push(Buffer.from(chunk));
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!allowed.has(data.method)) { res.statusCode = 403; res.end(JSON.stringify({ error: 'This preview proxy only allows testnet reads' })); return; }
      const key = JSON.stringify([data.method, data.params]);
      const cacheable = data.method === 'block' || data.method === 'query' && !String(data.params?.request_type ?? '').startsWith('view_access_key');
      let value: unknown;
      const hit = cache.get(key);
      if (cacheable && hit && Date.now() - hit.at < 6000) value = hit.value;
      else {
        let pending = cacheable ? inflight.get(key) : undefined;
        if (!pending) {
          pending = upstream(JSON.stringify(data));
          if (cacheable) { inflight.set(key, pending); void pending.finally(() => inflight.delete(key)).catch(() => {}); }
        }
        value = await pending;
        if (cacheable && !(value as { error?: unknown }).error) {
          if (cache.size >= 2000) cache.clear();
          cache.set(key, { at: Date.now(), value });
        }
      }
      res.end(JSON.stringify({ ...(value as object), id: data.id }));
    } catch (e) {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: 'kumi', error: { message: e instanceof Error ? e.message : 'The testnet read failed' } }));
    }
  }
  return {
    name: 'kumi-testnet-read-proxy',
    configureServer(server) { install(server.middlewares); },
    configurePreviewServer(server) { install(server.middlewares); },
  };
  function install(middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => unknown }) {
    middlewares.use('/api/rpc', (req, res) => { void handle(req, res); });
    middlewares.use('/api/availability', (_req, res) => {
      void (async () => {
        let config: unknown = null;
        try {
          const response = await fetch(`${serverUrl}/api/config`, { signal: AbortSignal.timeout(1500) });
          if (response.ok) config = await response.json();
        } catch { /* A stopped backend is a supported read-only mode. */ }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ online: config !== null, config }));
      })();
    });
  }
}
