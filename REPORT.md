# Kumi build report (Nov 9 2026)

## What was built
- **Hub contract** (`packages/contract`, Rust, near-sdk 5.30.0-rc.1). It has:
  - per-crew Sputnik DAOs, created through `sputnikv2.testnet` with a policy the hub writes and then verifies;
  - NEP-245 crew and vault shares at NAV;
  - DAO-only, once-only trade execution;
  - a captain function-call key with on-chain limits;
  - exact in-kind ragequit;
  - a follower vault mirrored in the same swap, with a fee above the high-water mark;
  - on-chain receipts.
- **Test pool** (`packages/testpool`): a testnet-only NEP-141 token with a NEAR constant-product pool, seeded at Coinbase spot ratios.
- **Server** (`packages/server`):
  - email sign-in that creates player sub-accounts;
  - a NEP-366 relayer with an allow-list;
  - a signed WebSocket crew chat whose `/buy` and `/sell` commands become quoted trade cards;
  - a cached read-only RPC proxy.
- **SDK** (`packages/sdk`):
  - typed reads;
  - trade quotes (on-chain pool view plus a mainnet 1Click dry quote);
  - delegate signing;
  - P&L and seasons from receipts.
- **Web** (`packages/web`): the landing page, the crews home (phone: balance header, crew card carousel, receipt day strip, floating tab bar; desktop: sidebar and 2-column card grid with Join and Follow), the crew chat (trade cards with vote bars, fund and crew panes, captain and DAO votes), the public crew page with Follow, the season board, the You page, and the join, follow and ragequit sheets.
- **MCP** (`packages/mcp`): read-only tools for agents.

## Evidence
- Testnet lifecycle: 3 email players, 2 voted trades, a follower mirror, the captain voted in and trading with the key, and a ragequit.
- More actions clicked through the web app:
  - a third voted trade;
  - a stale-quote refusal;
  - a new sign-up and follow, which crystallized a real HWM fee;
  - a re-join and a ragequit.
- 46 hashes are in `deployments/testnet-2026-11-09.json`. `pnpm verify:testnet` re-checks them all, compares the deployed code hashes with the local build, and confirms the P&L recomputed from receipts equals live state.

## What changed from the stopped Codex run
- Kept: the monorepo scaffold, the toolchain pins, the SDK's 1Click and RPC helpers (reworked), and the MCP package shape.
- Replaced: the single-crew contract. It had no DAO creation, recorded "authorization" without trading, and had no follower vault, fee or receipts.

## Honest limits
See README "Trust boundary and gaps" and BLOCKED.md. The main ones:
- mainnet swaps are quote-only (`NEAR_MAINNET_ACCOUNT`);
- private mode needs `ONECLICK_JWT`;
- email delivery needs `RESEND_API_KEY`;
- the hub still has its deploy key.
