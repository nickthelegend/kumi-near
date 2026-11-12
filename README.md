# Kumi: pool money with friends and vote on trades from a group chat.

Friends discuss trades in chat, but pooling money leaves one person holding the funds and tracking everyone's share. The group needs shared trade decisions, a record everyone can check, and a way for each member to leave with their share.

## Try it

The demo runs locally. Use Node 22+ and pnpm 10 (the repo pins pnpm 10.29.2). The read-only path needs public NEAR testnet RPC access, with no wallet or relayer setup. Vite preview includes a read-only testnet RPC proxy.

1. From the repo root, run `pnpm install --frozen-lockfile` - see the workspace dependencies install.
2. Run `pnpm --filter @kumi/web build`, then `pnpm --filter @kumi/web preview` - see the local preview URL, `http://127.0.0.1:5196`. Leave that terminal running.
3. Open `http://127.0.0.1:5196/` - see hub totals and recorded transactions linked to NearBlocks.
4. Open `http://127.0.0.1:5196/crew/0` - see the Night Owls treasury, trades and return recomputed from on-chain receipts.
5. Open `http://127.0.0.1:5196/room` - see members, holdings, NAV, recent/open proposals, votes, captain limits and each member’s exit amount, even without the server.
6. Open `http://127.0.0.1:5196/leaderboard` - see the crew ranked by return minus half its maximum drawdown.

The lobby at `/app` and fund pane at `/room` also read chain state. Chat history, sign-in and transactions need `pnpm run server` in a second terminal, configured with a funded testnet relayer as described in `.env.example`. Without that setup, the room still shows the fund from chain; chat and actions need the server. To join Night Owls, sign in, copy your testnet account, and ask an existing shareholder to post `/invite <your-account.testnet>` in chat. They click **Put invitation to a vote**. A strict majority of current shareholders must click **Vote yes** on both proposal stages. Once the card says **Admitted**, open the Fund pane and **Chip in** at least 0.01 testnet NEAR - see your shares and voting position. Invite approval needs the existing members; new sign-ups can follow immediately. See [BLOCKED.md](BLOCKED.md) for setup limits. Public RPC may rate-limit; the web app retries reads.

## Live on NEAR testnet

| Contract | Account |
| --- | --- |
| Hub | [hub.kumi-77b50457fb.testnet](https://testnet.nearblocks.io/address/hub.kumi-77b50457fb.testnet) |
| Night Owls Sputnik DAO | [owls-mw1n.sputnikv2.testnet](https://testnet.nearblocks.io/address/owls-mw1n.sputnikv2.testnet) |
| Test SOL pool | [tsol.kumi-77b50457fb.testnet](https://testnet.nearblocks.io/address/tsol.kumi-77b50457fb.testnet) |
| Test BTC pool | [tbtc.kumi-77b50457fb.testnet](https://testnet.nearblocks.io/address/tbtc.kumi-77b50457fb.testnet) |

Recorded highlights (exact links from the deployment files):

- [Crew created through the Sputnik factory](https://testnet.nearblocks.io/txns/2SjeG2N36HGTPfvkD4nAdPtwiEf3HUn2jVDrSEzRw7EX).
- [DAO vote executes a SOL trade](https://testnet.nearblocks.io/txns/HMn7NfmLU5rMFCPBsCMU2AZTsPKCGbGQRCoUFvkULXfs).
- [Follower deposits into the mirrored vault](https://testnet.nearblocks.io/txns/ASyquPcwfeVgLqtFgrPTXGubzevgvbiJrscma3J5ce1D).
- [Captain trades with a function-call key](https://testnet.nearblocks.io/txns/5W1dsz5EsxjhmsvG8BPw4rp3vzC8ps9f8eRbqNf5qvmH).
- [Ex-member removed from the DAO after the ragequit fix](https://testnet.nearblocks.io/txns/6SHy8GDRVvhZbU1vjLudCWFoTmQEadYhe12okmMVr2ff).

Testnet trades use Kumi's labelled tSOL/tBTC pools. NEAR Intents 1Click supplies mainnet dry quotes only; live mainnet swaps and private trading are not enabled. The hub still has its deployer's full-access key. Full evidence and limits appear below.

## Product and local interaction guide

Kumi gives each crew a Sputnik DAO. Chat commands become quoted trade proposals. A captain can trade within contract limits using a function-call key. Members can exit with their share when no swap is in flight. Followers can mirror the crew through a vault that charges fees above a high-water mark. Browser keys sign NEP-366 meta transactions; the relayer pays gas.

Proposed tracks: `social` first, then `defi`. The crew uses Sputnik DAO to make shared trading decisions.

| Do | See |
| --- | --- |
| Open `/` | Live hub numbers (crews, NAV, trades, members) and the recorded lifecycle with NearBlocks links. |
| Open `/app` | The lobby: a chat-thread preview, crew NAV and weekly return, player and crew cards, Pitch a trade and Follow or Join actions, receipts, recent calls and a pitch builder. |
| Open `/room` | The **Night Owls** crew room, laid out like a chat app (`/app?crew=N` links redirect here). Left: the crew list (colour-coded avatar, last message, unread count) and a first-run path (sign in, join, chip in, pitch a trade, vote) checked against chain state. Middle: signed messages and colour-coded cards: coral trade proposals with the quote and a butter Sputnik vote band, butter joins, mint follows, pink ragequits, each with its tx link. Right: the fund (NAV, return, chart, stat tiles, your position, holdings, members' shares, captain lane). On a phone these are the Crews / Chat / Fund tabs. "Verified on-chain" means the P&L was recomputed from receipts and matches live state. |
| With a configured relayer, click **Sign in** and verify an email | Without `RESEND_API_KEY` the sheet says "Email delivery: Setup required: RESEND_API_KEY" and shows the code. Verifying creates `<name>.<relayer>.testnet` with a key made in your browser. |
| As a shareholder, type `/invite account.testnet` | A member card files the native Sputnik crew-role proposal and a hub admission gate. Both must pass the hub’s current-shareholder recount before the invitee can chip in. |
| As a member, type `/buy BTC 10%` | A trade card appears with the testnet pool quote and a mainnet 1Click `dry: true` quote. **Put it to a vote** creates a Sputnik proposal. **Vote yes** from a strict majority of current shareholders executes it. New sign-ups are not automatically invited to the recorded crew. |
| Open `/crew/0` | The public crew page: verified return, the trade list and **Follow** (a follower vault deposit). |
| Open `/leaderboard` | This week's season, ranked by return minus half the max drawdown. |
| Fund pane, **Ragequit** | The exact payout preview. "To any chain" shows a real 1Click dry quote and "Setup required: NEAR_MAINNET_ACCOUNT". The testnet exit pays in kind. |

Agent surface (read-only MCP over stdio): `pnpm --filter @kumi/mcp start`. The tools are `list_crews`, `crew_pnl`, `season_leaderboard`, `quote_trade` and `crew_trades`.

Re-check the Nov 9 testnet evidence (no signing keys needed): first run `pnpm build:contracts`, then `pnpm verify:testnet`. The build needs Binaryen (`wasm-opt`), Rust via rustup (pinned to 1.95.0) and `cargo-near` 0.22.0. The verifier re-queries the 46 Nov 9 hashes through the public archival testnet RPC, compares deployed code hashes with the local Wasm build, and recomputes P&L. `NEAR_ARCHIVAL_RPC_URL` can override the receipt provider. It does not check the separate Nov 10 fix file.

## How it works

| Piece | What it does |
| --- | --- |
| `packages/contract` (hub) | Holds every crew's vault. `create_crew` calls the **Sputnik v2 factory** (`sputnikv2.testnet`) with a policy the hub writes: the members form the only voting role, the threshold is a strict majority, the bond is 0 and the period is one day. The hub may *file* trade and invitation-gate proposals, and may file and approve one other kind only: `RemoveMemberFromRole`, for a member who has ragequit. The crew is registered only after the hub reads back the new DAO's policy. Shares are NEP-245 token ids (`crew:<id>`, `vault:<id>`), minted at NAV and non-transferable. |
| Voted trades | `propose_trade` stores the quote (`quote_in`, `quote_out`, sha256 of the full quote JSON) and files a FunctionCall proposal for `execute_trade`. Only the crew's DAO can call `execute_trade`. A trade executes once, so a second proposal for the same trade fails (the vote-replay test). Before any NEAR moves, the hub re-reads the trade's DAO proposal and **recounts it**: only approvals from accounts that hold shares now count, and they must be a strict majority of the shareholders (`ERR_STALE_VOTES` otherwise, and the DAO marks the proposal Failed). |
| Swap | Size is `bps` of what the crew holds *at execution*. Crew and follower vault go in **one combined swap**, split pro rata. `min_out` = the quoted rate × (1 − 3%). If the pool would fill worse, it refuses, and the hub restores holdings and marks the trade failed. |
| Captain lane | A DAO vote calls `set_captain`. The hub adds a **function-call access key on itself** that may call only `captain_trade`, with a 0.5 NEAR gas allowance. The contract checks the signer key, max bps per trade, trades per UTC day and allowed assets. Revoking the captain deletes the key. |
| Ragequit | `ragequit(crew, shares)`: the exact pro-rata NEAR and every token, and the last holder takes the dust. NEAR is paid immediately. A token payout that fails becomes `claim_token`-able. It is refused only while a swap is in flight. **Leaving with all your shares ends your vote:** the hub drops you from the member list, deletes your captain key if you hold it, and files and approves a `RemoveMemberFromRole` proposal in the crew's DAO in the same transaction. If the DAO refuses, the hub logs `member_removal_failed`, keeps you in `get_stale_voters`, and anyone can retry with `remove_ex_member`; your votes never count toward a trade either way. Attach about 150 Tgas or more (the app attaches 155). |
| Follower vault | `follow` / `unfollow`. Before every deposit or exit, the performance fee is crystallized in kind to the crew: `(pps − HWM) × supply × fee`. The HWM then moves to the post-fee price. |
| Receipts | Every state change appends a receipt with the crew's post-state and the marks or fill amounts. The SDK's `computePnl` rebuilds the price-per-share series from receipts only, then compares the latest receipt with live state. |
| `packages/testpool` | **Testnet only.** A NEP-141 token with a built-in NEAR constant-product pool (0.30% fee). NEAR Intents has no testnet, so testnet trades fill here. Pools were seeded at the Coinbase spot ratio at deploy time (source URLs and timestamps are in the evidence file). |
| `packages/server` | Email sign-in (Resend if keyed). The relayer creates player sub-accounts and relays NEP-366 delegates on an allow-list: player senders only, Kumi contracts only, capped deposits and gas, and approve or reject votes only. The crew chat runs over WebSocket. Each message is ed25519-signed by the player's key and checked against the account's on-chain access keys. There is also a cached read-only RPC proxy for the browser. |
| `packages/sdk` | Typed hub reads, the trade quote (pool view plus 1Click dry quote), delegate signing, P&L and seasons. |
| `packages/web` | Landing, crew room (crew list, chat, fund pane), public crew and follow page, season board. |

NEAR features used, and why:
- **Sputnik DAO v2**: one DAO per crew, created through the factory. It is the only authority over trades and captain keys.
- **Function-call access keys**: the captain lane, installed and removed by votes.
- **NEP-366 meta transactions**: players never hold gas or see a wallet.
- **Sub-accounts**: each player is `<name>.<relayer>`, and the hub and pools are sub-accounts too.
- **NEP-245**: crew and vault shares.
- **NEP-141**: the test pool tokens.
- **NEAR Intents (1Click)**: real mainnet `dry: true` quotes on every trade card and ragequit. Live swaps show "Setup required: NEAR_MAINNET_ACCOUNT".

**Private mode (researched):** the 1Click quote API accepts `confidentiality: "basic" | "advanced"`, but it answers "User authentication is required for confidential intent quotes" without a partner JWT. The SDK passes the flag and fails loudly with "Setup required: ONECLICK_JWT". Private crew trading is not enabled.

## Testnet deployment (NEAR testnet, Nov 9 2026)

| Contract / account | Address |
| --- | --- |
| Hub | [hub.kumi-77b50457fb.testnet](https://testnet.nearblocks.io/address/hub.kumi-77b50457fb.testnet) |
| Test SOL pool (NEP-141) | [tsol.kumi-77b50457fb.testnet](https://testnet.nearblocks.io/address/tsol.kumi-77b50457fb.testnet) |
| Test BTC pool (NEP-141) | [tbtc.kumi-77b50457fb.testnet](https://testnet.nearblocks.io/address/tbtc.kumi-77b50457fb.testnet) |
| Night Owls' Sputnik DAO | [owls-mw1n.sputnikv2.testnet](https://testnet.nearblocks.io/address/owls-mw1n.sputnikv2.testnet) |
| Relayer / owner | [kumi-77b50457fb.testnet](https://testnet.nearblocks.io/address/kumi-77b50457fb.testnet) |

The lifecycle (`pnpm run:testnet`, through the same server code the app uses), plus actions clicked in the web app. All 46 hashes are in [deployments/testnet-2026-11-09.json](deployments/testnet-2026-11-09.json).

| Step | Transaction |
| --- | --- |
| 3 email sign-ups (mika, bo, juno), relayer-created accounts | [mika](https://testnet.nearblocks.io/txns/FeD5Q8AeKQe1CbZHWRYapRhA5DGAKpXWc7VgWDFjVKZq), [bo](https://testnet.nearblocks.io/txns/51Ur1FC3bQKcMCHEjpvvFi13YU44Ua2LoMNncnDp6wUM), [juno](https://testnet.nearblocks.io/txns/HUDXLZ7A3Wj9FHhtChmkeWDZNPWV5hDEyNnhgkddytAU) |
| Crew created; DAO made by the factory, policy checked | [2SjeG2N3…](https://testnet.nearblocks.io/txns/2SjeG2N36HGTPfvkD4nAdPtwiEf3HUn2jVDrSEzRw7EX) |
| Joins by meta transaction | [mika](https://testnet.nearblocks.io/txns/5QBNvnjddoRkU2S7r6afoBVdDhTMKRFebg4QS8eQynsQ), [bo](https://testnet.nearblocks.io/txns/EU38TeCJttyhvtZidTjEnZ4KA9irqgEHJqtoW64qYvaL), [juno](https://testnet.nearblocks.io/txns/BRVD2KXvvuLtSLwTEmBJyoJ4ybBMrcM9XniA3RkuAri4) |
| Vote 1: `/buy SOL 30%` proposed, 2 approvals, executed | [propose](https://testnet.nearblocks.io/txns/4dVXyn19AFLvxGTX3SsXceoGjT4zfoSZorfrURwKDJnA), [vote](https://testnet.nearblocks.io/txns/FT6bgvjywKKh8DkodHViYT7crTtbZnoRENcFSszzHM93), [vote + execute](https://testnet.nearblocks.io/txns/HMn7NfmLU5rMFCPBsCMU2AZTsPKCGbGQRCoUFvkULXfs) |
| Follower (rin) deposits into the vault | [follow](https://testnet.nearblocks.io/txns/ASyquPcwfeVgLqtFgrPTXGubzevgvbiJrscma3J5ce1D) |
| Vote 2: `/buy SOL 20%`, follower mirrored in the same swap | [propose](https://testnet.nearblocks.io/txns/65g4GSEUGRVvn2fcbLgzuwWXomdQkoFtYZFTdJsGafpm), [vote](https://testnet.nearblocks.io/txns/FeuGrDosKGhimcqagFBPrgGHHSGv9sEAUhJZaPtsyQJ1), [vote + execute](https://testnet.nearblocks.io/txns/Ebd47jHq2vSWANUEfidAMHq1tb3JNUVdV24sLH3Lcehk) |
| Captain voted in (function-call key installed on the hub) | [proposal](https://testnet.nearblocks.io/txns/BGzcFc4SY39V1A4GJnA6Ai14bhmKLzw2D7BZp9owKx2L), [vote](https://testnet.nearblocks.io/txns/BANK2s6rirMnxixZNpi9HjaTDcDSZdTbS61MrLkG6Bhq), [vote + key added](https://testnet.nearblocks.io/txns/tpTnvD8o4ubESXcXDF2PT5XPxidMowVTW4RwKf3zee3) |
| Captain trade `/captain sell SOL 10%`, signed by the function-call key | [5W1dsz5E…](https://testnet.nearblocks.io/txns/5W1dsz5EsxjhmsvG8BPw4rp3vzC8ps9f8eRbqNf5qvmH) |
| Ragequit (bo), exact share in kind | [register tSOL](https://testnet.nearblocks.io/txns/76L8xNnHw8rgHJ4SBt5S8WvQe1ZZvqWRbmUxWzBqXePf), [ragequit](https://testnet.nearblocks.io/txns/AZaaLvsxdxh48UvVciRPEKySX2ZRy1ACXQ7mcemiQ6do) |
| Web app: `/buy BTC 10%` filed, voted, executed | [file](https://testnet.nearblocks.io/txns/8i23JNw47hbwB7SEKwRLfrsawWhGUjrpCSPRrJwG3ETU), [vote](https://testnet.nearblocks.io/txns/7Xi3CPBAeX2ak41f7pX9ZV3p981RejPDXVrEGCcQ1ReD), [vote + execute](https://testnet.nearblocks.io/txns/2nUcFmVL8QqUx1uvtLrUbswnnFXXq1X8kUexUWVtFxnT) |
| Web app: a stale-quote trade passes the vote, the pool refuses the fill, holdings restored | [vote, pool returns ERR_SLIPPAGE](https://testnet.nearblocks.io/txns/EMtk9pDCbEoDejV6aDWH2tUErV44NyJGtK8EHKpWTR63) |
| Web app: email sign-up (sora), follow with the fee crystallized above the HWM | [sign-up](https://testnet.nearblocks.io/txns/HW4TjUhLVkr3SCsDDCe4oRHjrtLY8Z4udTjBo2Qf8WPG), [follow](https://testnet.nearblocks.io/txns/9gHRFKC1jjffp7znWDpNBBmRkjuzXxrqRTcfaDBpjjYD) |
| Web app: bo re-joins, then ragequits from the sheet | [join](https://testnet.nearblocks.io/txns/57nXJ2xbjoLfykdLcu78fxJZbWz1MfPKsPfkPDuGiTfR), [ragequit](https://testnet.nearblocks.io/txns/GqGRJGRYpJivjgZePFpsyv4PTW5GvcQBi8G15vnjYxkb) |

**Nov 10 fix: a ragequitter kept their DAO vote.** Under the Nov 9 code, bo left with zero shares but stayed in the DAO's `crew` role, so he could still approve trades with mika's and juno's money. The hub was redeployed with the fix (no state migration; the crew reads back unchanged, code hash `EGMA9HvgXMkBuD838EdxPDQMYWDFvRtQUEqLdGab5dYB`), and bo's leftover vote was removed on testnet with `scripts/fix-ragequit-votes.ts`. All 10 hashes are in [deployments/testnet-2026-11-10-ragequit-fix.json](deployments/testnet-2026-11-10-ragequit-fix.json).

| Step | Transaction |
| --- | --- |
| Hub redeployed with the fix | [4YEy8ssd…](https://testnet.nearblocks.io/txns/4YEy8ssd6RQTWzoMzhnwVY3LojspLdMRhgs4CTMMPquA) |
| `remove_ex_member(bo)` with his ragequit receipt: the Nov 9 DAO policy refuses the hub, so it fails loudly (`member_removal_failed`) and is kept as pending | [6orQXErk…](https://testnet.nearblocks.io/txns/6orQXErkJGJwxxLNxZN7nJJnK9KsT8BcLJSNpsYuYhtK) |
| mika and juno vote the hub's DAO role up to `remove_member_from_role` (2 of 3, bo not needed) | [propose](https://testnet.nearblocks.io/txns/3E7NhPjZCex3mDzNCb8VnDQt1c3qdkbZZwJEAMB4BrjQ), [vote](https://testnet.nearblocks.io/txns/8iURg3zNBJkLQgns3zDdfpjPCb8voPnFaZJFHYQiz6PT), [vote + policy updated](https://testnet.nearblocks.io/txns/2ZwuYsqPQJHBrDYr5mvh7QLv9hXx22N5BiiJNBhXXgtz) |
| Retry: the hub files and approves the removal (`member_removed`); the crew role is now mika and juno | [6SHy8GDR…](https://testnet.nearblocks.io/txns/6SHy8GDRVvhZbU1vjLudCWFoTmQEadYhe12okmMVr2ff) |
| bo votes on an open DAO proposal and the DAO refuses him (`ERR_PERMISSION_DENIED`); mika and juno then reject that check proposal | [check proposal](https://testnet.nearblocks.io/txns/GouzDsNG41DyG4fdgpvQwbZuw3dTR9LN9GHGiVHGvgLJ), [bo refused](https://testnet.nearblocks.io/txns/HhYfKU5Ttr1pCrUb6sh5b1mECxL4gin9cpdkBU8uVcpJ), [reject](https://testnet.nearblocks.io/txns/BCXrtubbvW75T19ToHT6t42MA5fJQhV2KJvaKuLh7JzY), [reject](https://testnet.nearblocks.io/txns/J7jprqBcDvkADQPQ1if6foZjjRh6yHjjQTrR6juc87i8) |

The test emails (`*@crew.kumi.test`, `*@fans.kumi.test`) use the reserved `.test` domain. Their codes came from the server's "Setup required: RESEND_API_KEY" preview path.

## Tests

See [TESTING.md](TESTING.md). In short:
- 10 sandbox tests run against the real testnet Sputnik factory and DAO code (one also runs the Nov 9 hub code and upgrades it), plus 3 contract unit tests.
- 10 SDK tests, 2 relayer allow-list tests and 1 MCP stdio test.
- The web build, and a recorded headless Chrome check of four routes at 1440 and 390 (see TESTING.md).
- `pnpm verify:testnet`.

## Trust boundary and gaps

- The hub account still has its deployer's full-access key (`hub.kumi-77b50457fb.testnet`). Until that key is deleted, the deployer could upgrade the code. Deleting it is a one-way step for Nick to decide (see BLOCKED.md).
- Testnet marks are **pool spot prices**, read on-chain at each join, follow and fee, so a large trade right before a join moves the mark. Pyth ended NEAR support. A mainnet build would need the Rhea oracle or a signed price relayer. A join priced while a swap is in flight is refused.
- Players' keys live in browser localStorage. Linking a second device is not built: the server says so if an email signs in from a new browser.
- Mainnet 1Click is quote-only (`dry: true`), and live swaps need `NEAR_MAINNET_ACCOUNT`. NEAR Intents has no testnet.
- Demo scale: a crew has at most 16 members and a hub lists at most 4 assets.
- The vote recount covers trades and both stages of membership invitations. Other DAO proposals (captain, policy) are tallied by Sputnik over the `crew` role, which also holds invited members who have not deposited yet. A member who ragequits leaves that role in the same transaction; if the removal fails, it is listed by `get_stale_voters` until `remove_ex_member` succeeds.

## Hackathon disclosures

- **Event:** Built for NEAR HACKATHON 2026 (Nov 1-14).
- **Prior work before Nov 1, 2026:** No Kumi code is recorded before that date in this repo's non-shallow git history. The first commit is `1de3186d737183ff2f9174f515a954c31f3fed0b`, dated Nov 9, adding the MIT license and gitignore. LICENSE credits Nivesh Gajengi (2026); there is no NOTICE file. The README previously credited Alpha Group Trading on Solana as concept inspiration. This repo does not establish its authorship or any shared code, so it is not claimed as Kumi hackathon work.
- **Built in the window:** The Nov 9 commits add the monorepo, an initial single-crew prototype, then the per-crew Sputnik hub, test pools, SDK, relayer, chat, web app, read-only MCP tools, tests and testnet deployment. Nov 10 adds the ragequit vote-removal fix and its testnet evidence. [REPORT.md](REPORT.md) distinguishes the earlier Nov 9 prototype from the implementation that replaced it. That prototype was also built in the window. Only NEAR work in the window is claimed for judging; external libraries and the earlier Solana concept are dependencies or inspiration. This disclosure uses Nov 1 as the conservative baseline cutoff; the [current official Q-001](https://nearhackathon.com/HACKATHON.md) allows work from the Oct 19 announcement.
- **Other edition (Q-002/Q-015):** Kumi’s Avalanche edition was built on Nov 12, 2026 ([web app](https://kumi-avax-web.vercel.app), [phone app](https://kumi-avax-app.vercel.app)); this NEAR submission claims only the NEAR-specific code built in the hackathon window.
- **AI-assisted code:** Built with AI coding agents (Claude Code, Codex) under human direction; all code reviewed and tested by the team.
- **Other projects by the same team in this hackathon:**

  Lead: <TBD by Nick>

- **License:** MIT. See [LICENSE](LICENSE). Copyright (c) 2026 Nivesh Gajengi.

## Credits

- Token and network logos (NEAR, SOL, BTC, ETH, USDC, ZEC; NEAR, Solana, Bitcoin, Ethereum, Base and Arbitrum networks) come from [`@web3icons/core`](https://github.com/0xa3k5/web3icons) 4.0.58, MIT licensed, bundled into the web build (no hotlinking). The logos remain the trademarks of their projects and are used only to identify the assets.
- Testnet pool tokens (tSOL, tBTC) show the real logo with a "test" badge: they are Kumi's NEP-141 test pools, not the mainnet assets.
- Sputnik DAO and NEAR Intents have no licensed mark in that package, so the app uses neutral line glyphs with the protocol name written next to them.
- Clay mascots and scenes (`packages/web/public/art`) were generated for Kumi.
- The 3D object kit (`packages/web/public/art/3d`, see [docs/ART-3D.md](docs/ART-3D.md)): 3D art generated with ChatGPT.
