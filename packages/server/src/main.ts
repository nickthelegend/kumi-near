// Starts the Kumi server. Configuration comes from the repo's gitignored .env (names in .env.example).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { Relayer } from './relayer.js';
import { Store } from './store.js';

const root = resolve(import.meta.dirname, '../../..');
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const need = (name: string) => {
  const v = process.env[name];
  if (!v) { console.error(`Setup required: ${name} (see .env.example)`); process.exit(2); }
  return v;
};
const hub = need('KUMI_HUB');
const relayerId = need('KUMI_RELAYER_ACCOUNT');
const relayer = new Relayer({ accountId: relayerId, hub, rpc: process.env.NEAR_RPC_URL, readRpc: process.env.KUMI_READ_RPC_URL || undefined,
  credentialsFile: resolve(root, process.env.KUMI_RELAYER_CREDENTIALS ?? `.near-credentials/${relayerId}.json`) });
const gift = BigInt(Math.round(Number(process.env.KUMI_GIFT_NEAR ?? '0.2') * 1000)) * 10n ** 21n;
// Reads (the app's RPC proxy, crew and quote reads) may use a separate provider from the relayer's sends, so a
// burst of phone and browser polling cannot rate-limit the relayer's transactions on the same public endpoint.
const { server } = createApp({ hub, relayer, store: new Store(resolve(root, 'data')), rpc: process.env.KUMI_READ_RPC_URL || process.env.NEAR_RPC_URL, giftYocto: gift,
  resendKey: process.env.RESEND_API_KEY || undefined, emailFrom: process.env.KUMI_EMAIL_FROM || undefined,
  mainnetAccount: process.env.NEAR_MAINNET_ACCOUNT || undefined, oneclickJwt: process.env.ONECLICK_JWT || undefined });
const port = Number(process.env.KUMI_SERVER_PORT ?? 15196);
server.listen(port, '127.0.0.1', () => console.log(`Kumi server on http://127.0.0.1:${port} (hub ${hub}, relayer ${relayerId})`));
