// Live public services, no stand-ins: NEAR testnet RPC and mainnet 1Click (dry quotes only).
import { describe, expect, it } from 'vitest';
import { dryQuote, getTokens, intentsAssetFor, query, SPUTNIK_TESTNET_FACTORY, view } from '../src/index.js';

describe('live NEAR testnet and 1Click', () => {
  it('finds the Sputnik v2 factory with its default DAO code', async () => {
    const account = await query<{ code_hash: string }>({ request_type: 'view_account', account_id: SPUTNIK_TESTNET_FACTORY });
    expect(account.code_hash).not.toBe('11111111111111111111111111111111');
    const version = await view<number[]>(SPUTNIK_TESTNET_FACTORY, 'get_default_version');
    expect(version[0]).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('maps SOL and BTC to their native-chain 1Click assets', async () => {
    expect(await intentsAssetFor('SOL')).toBe('nep141:sol.omft.near');
    expect(await intentsAssetFor('BTC')).toBe('nep141:btc.omft.near');
    expect((await getTokens()).length).toBeGreaterThan(50);
  }, 30_000);

  it('gets a real dry quote for 1 NEAR into SOL and refuses a confidential quote without a JWT', async () => {
    const q = await dryQuote({ originAsset: 'nep141:wrap.near', destinationAsset: 'nep141:sol.omft.near', amount: (10n ** 24n).toString() });
    expect(BigInt(q.quote.amountOut)).toBeGreaterThan(0n);
    expect(q.dry).toBe(true);
    await expect(dryQuote({ originAsset: 'nep141:wrap.near', destinationAsset: 'nep141:sol.omft.near', amount: '1', confidentiality: 'basic' }))
      .rejects.toThrow('Setup required: ONECLICK_JWT');
  }, 30_000);
});
