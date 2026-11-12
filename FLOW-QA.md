# Kumi full-flow QA — 2026-11-11

Completed report. PASS means observed working, FIXED means a reproduced defect was corrected and rechecked, and BLOCKED names an existing capability or setup limit.

Production builds were served on checked free ports 5516 and 5518; the relayer used 5517. Chrome ran headless with `channel: 'chrome'`, inside the required `withChromeLock`, at 1440×900 and 375×900. Shared Chrome contention caused waits. No other job's browser was killed.

The approved fonts, colours, spacing, layout structure and art are unchanged. A narrow overflow fix allows the signed-in handle to shrink and truncate within the existing header. Other source changes address behavior, validation, factual copy and empty/error states. No mainnet transaction, push or `.loom/` edit was performed. Credentials were loaded only by file path and never printed.

## Ordered flow and results

Screenshots were captured locally during QA and are not committed.

A fresh judge can browse and follow. Trading requires an invited crew member. The application has no UI for inviting a new member; the QA invitation used the repository's existing DAO/account helpers, not a simulated chain response.

| Ordered step | Status | Evidence / limitation | Screenshots |
| --- | --- | --- | --- |
| 1. Landing `/`: understand pooling, votes, exits and testnet scope | **FIXED** | Explainer now states that exits wait for an in-flight swap. Live totals, crew and recorded transaction links render. | `after-landing-1440.png` / `after-landing-375.png` |
| 2. Browse `/app`: crew, recent calls, receipt strip, player card | **FIXED** | Live crew loads; empty hub and failed detail reads have explicit states rather than permanent skeletons. | `after-lobby-1440.png` / `after-lobby-375.png` |
| 3. Open `/crew/0`: treasury, return, trades, DAO and follower vault | **PASS** | On-chain P&L verifies. Executed trades and account/receipt links are present. | `after-crew-1440.png` / `after-crew-375.png` |
| 4. Sign in with email: code, wrong code, account receipt | **FIXED** | Same-browser sign-out retains the account key; sign-in reuses it and preserves the stored handle. Wrong-code recovery and success checked. The focused recheck accepts hyphens, rejects invalid handle characters, and produces no invalid-pattern console error at either width. | `after-signin-success-1440.png` / `after-signin-success-375.png` |
| 5. Continue from sign-in to crew chat | **FIXED** | Go to the crew chat now navigates to `/room`. Fresh accounts see the guest state. | `after-full-exit-guest-1440.png` / `after-full-exit-guest-375.png` |
| 6. Meteor Wallet connect / closed / blocked popup | **BLOCKED** | Kumi has no wallet connector. Its approved flow is email + a browser key + NEP-366. There is no MyNearWallet link. Adding Meteor would change the established onboarding; no wallet UI was added. | `after-signin-email-1440.png` / `after-signin-email-375.png` |
| 7. Fresh guest follows with 0.01 testnet NEAR | **FIXED** | Deposit succeeds, receipt appears and the vault position updates. Deposits below the contract minimum are rejected before signing. | `after-follow-position-1440.png` / `after-follow-position-375.png` |
| 8. Follower exits its exact vault share | **FIXED** | Tokens are registered before exit. Fresh-account exit succeeds; position disappears and receipt appears. The first reproduction exposed claimable token payouts, which were recovered. | `after-unfollow-success-1440.png` / `after-unfollow-success-375.png` |
| 9. Member chips in through the fund pane | **FIXED** | Real 0.01 NEAR deposit succeeds. Invalid/below-minimum amounts show actionable validation. | `after-join-success-1440.png` / `after-join-success-375.png` |
| 10. Build a sell in the lobby and send a signed chat command | **PASS** | Builder options hand the command to chat; `/sell SOL 5%` produces the pool and mainnet dry quote card. | `after-trade-quote-1440.png` / `after-trade-quote-375.png` |
| 11. File trade, first vote, strict-majority vote, executed receipt | **PASS** | Mika and Juno approve the same proposal; trade executes. Buttons transition with the proposal state. | `after-trade-executed-1440.png` / `after-trade-executed-375.png` |
| 12. Captain key trade and receipt | **PASS** | Juno’s existing function-call key executes `/captain sell SOL 5%` within the recorded limits. Key is read by file path; never printed. | `after-captain-executed-1440.png` / `after-captain-executed-375.png` |
| 13. Ragequit: exact in-kind preview and mainnet dry-quote tab | **PASS** | Both payout tabs and destination controls work. Live mainnet payout remains explicitly setup-required. | `after-ragequit-chain-1440.png` / `after-ragequit-chain-375.png` |
| 14. Full ragequit of the temporary QA member | **PASS** | Temporary member was admitted through the DAO using repository signing helpers, joined with 0.01 NEAR, then exited in full through the UI. Receipt appears and the account becomes a guest. Final reconciliation confirms removal from both the hub member list and DAO voting role, with no stale voters or unclaimed QA tokens. | `after-full-exit-receipt-1440.png` / `after-full-exit-receipt-375.png` |
| 15. Position after full exit | **PASS** | Fund no longer offers a member position; chat is guest-only again. | `after-full-exit-position-1440.png` / `after-full-exit-position-375.png` |
| 16. Phone Crews / Chat / Fund tabs | **PASS** | Each tab opens its corresponding pane and functional controls at 375px. Desktop panes checked at 1440px. | `after-room-chat-1440.png` / `after-room-fund-375.png` |
| 17. Season `/leaderboard` and crew link | **PASS** | Receipt-derived crew score, return and drawdown render. Failed reads show an error and stop loading indicators at both widths. | `after-leaderboard-1440.png` / `after-leaderboard-375.png` |
| 18. Legacy `/app?crew=0` and missing `/crew/99999` | **PASS** | Legacy route opens chat. Missing crew shows an explicit error. Unknown paths use the existing landing fallback. | `after-legacy-1440.png` / `after-legacy-375.png` |
| 19. Empty hub / failed RPC / failed crew detail / failed DAO votes | **FIXED** | Controlled browser fault injection, separate from live evidence. Errors are visible and false None open is removed. Landing/season loading indicators stop after errors at both widths; all controlled failure states have zero horizontal overflow. | `after-detail-error-lobby-1440.png` / `after-detail-error-lobby-375.png` |
| 20. Backend-free README preview and offline sign-in | **FIXED** | Backend-free browsing passes at both widths without console/network failures. The read proxy rejects broadcasts with HTTP 403. Offline sign-in shows the `pnpm run server` instruction. | `after-backend-free-1440.png` / `after-backend-free-375.png` |
| 21. Second device and cancellation | **PASS** | A different browser key is explicitly refused. Clicking the scrim cancels sign-in. Second-device linking is documented as not built. | `after-second-device-1440.png` / `after-second-device-375.png` |
| 22. Recorded Nov 9 evidence verifier | **FIXED** | Initial primary-provider lookups hit HTTP 408 or hung. The verifier now uses the public testnet archive for recorded receipts. All 46 receipts, 3 deployed code hashes, live DAO policy and receipt-derived P&L pass. SDK timeout/fallback regression passes. | See verifier log below. |

23. **FIXED — signed-in phone header:** the retained handle caused 18px horizontal overflow on the landing page. The handle can now shrink and truncate; the existing spacing and styling remain. `before-signed-header-1440.png` / `before-signed-header-375.png`; `after-signed-header-1440.png` / `after-signed-header-375.png`. Rechecked with zero overflow.

## Before and after functional changes

Screenshots were captured locally during QA and are not committed.

These are the original screenshots and the corresponding rechecks. Error-state screenshots use explicitly injected failures; live action screenshots use real testnet state.

| Change | Before | After |
| --- | --- | --- |
| Sign-out key loss | `before-signin-lost-key-1440.png` / `before-signin-lost-key-375.png` | `after-signin-success-1440.png` / `after-signin-success-375.png` |
| Follower token payout failure | `before-unfollow-failed-1440.png` / `before-unfollow-failed-375.png` | `after-unfollow-success-1440.png` / `after-unfollow-success-375.png` |
| Sign-in destination | `before-signin-success-1440.png` / `before-signin-success-375.png` | `after-full-exit-guest-1440.png` / `after-full-exit-guest-375.png` |
| Lobby empty state | `before-empty-lobby-1440.png` / `before-empty-lobby-375.png` | `after-empty-lobby-1440.png` / `after-empty-lobby-375.png` |
| Crew-detail read failure | `before-detail-error-lobby-1440.png` / `before-detail-error-lobby-375.png` | `after-detail-error-lobby-1440.png` / `after-detail-error-lobby-375.png` |
| Landing read failure | `before-detail-error-landing-1440.png` / `before-detail-error-landing-375.png` | `after-detail-error-landing-1440.png` / `after-detail-error-landing-375.png` |
| Fund precision / DAO state | `before-legacy-1440.png` / `before-room-375.png` | `after-room-fund-375.png` |
| Handle validation | `before-signin-pattern-1440.png` / `before-signin-pattern-375.png` | `after-signin-pattern-1440.png` / `after-signin-pattern-375.png` |
| Below-minimum deposits | `before-follow-invalid-1440.png` / `before-follow-invalid-375.png` | `after-follow-minimum-1440.png` / `after-follow-minimum-375.png` |
| Backend-free preview | `before-backend-free-1440.png` / `before-backend-free-375.png` | `after-backend-free-1440.png` / `after-backend-free-375.png` |
| Offline setup instruction | `before-backend-off-signin-1440.png` / `before-backend-off-signin-375.png` | `after-backend-off-signin-1440.png` / `after-backend-off-signin-375.png` |
| Season failed read | `before-rpc-error-leaderboard-1440.png` / `before-rpc-error-leaderboard-375.png` | `after-rpc-error-leaderboard-1440.png` / `after-rpc-error-leaderboard-375.png` |
| Signed-in phone header | `before-signed-header-1440.png` / `before-signed-header-375.png` | `after-signed-header-1440.png` / `after-signed-header-375.png` |

## Final verification and spend

Screenshots were captured locally during QA and are not committed.

- Web production build and server typecheck pass. Build emits an existing browser `util` externalization warning; the tested trading and captain paths executed successfully.
- SDK: 11 tests pass, including a new HTTP 408 fallback regression. Server: 3 pass, including returning-user identity; MCP: 1 passes. Contract code was not changed.
- Main recheck: 56 state checks; full exit: 10; final focused recheck: 48. The completed passes have zero horizontal page overflow, no broken loaded images, and no `undefined`, `NaN` or raw transaction errors in the inspected text. Console review found a handle pattern invalid under Chrome's `v` regex mode; fixed and verified in the focused rerun. Expected negative tests produced HTTP 400 (wrong code) and 409 (second device). The final focused pass has zero unexpected console/network/page errors. With the backend deliberately absent, sign-in and chat-history requests return HTTP 500; the UI gives the correct setup command. Those dependency errors are recorded separately in `focused.json`.
- Final reconciled spend: **0.1173362357592225 testnet NEAR** (0.0323362357592225 fees + 0.085 gross deposits), across 25 transactions. This includes account gifts, registration, recovery, temporary-member admission and full exit. It is below the 0.3 NEAR cap. No further spending is planned.
- The full-exit harness re-signs the same UI call through the repo SDK with bounded gas (90 Tgas join, 155 Tgas ragequit), checks receiver/method/deposit, and checks the remaining budget against the current gas price before relaying. Application defaults remain unchanged.

Evidence directory: `kumi`.

- `final.json`
- `exit.json`
- [Public testnet QA evidence](deployments/testnet-2026-11-11-flow-qa.json) — 25 transaction hashes, outcomes, spending and final role/claim state.
- `focused.json`
- `reconciliation.json`
- `verify-testnet.log`

## Setup and capability limits

- Meteor popup checks are blocked: there is no wallet connector in this email/browser-key product. No retired MyNearWallet URL exists in the web/SDK source. No replacement onboarding was added.
- New accounts can follow. Joining the trading crew requires an invitation. There is no UI `/invite` action; the temporary QA member was admitted with real DAO proposals through the repo's account helpers and removed automatically by its full ragequit. The original two members and captain remain.
- A second browser cannot recover an existing account key. It gets the documented linking-not-built message. Clearing browser storage also removes locally retained account credentials.
- Email delivery without Resend uses an explicit testnet preview code. Live mainnet swaps and private trading remain setup-required; the tested cross-chain tab is dry-quote only.
- Public RPC outages remain an external dependency. [NEAR's provider list](https://docs.near.org/api/rpc/providers) identifies the public archival testnet endpoint now used for historical receipts. Current browser reads use the same-origin preview proxy with bounded provider waits.

All QA processes started here are shut down at completion. No push, force operation, mainnet transaction or `.loom/` edit was performed. The production build, 15 JS/SDK/server/MCP tests, server typecheck, browser checks and historical testnet verifier passed. Rust contract source was unchanged and its earlier sandbox suite was not rerun.


## Judging R3 — offline room (Nov 12)

Screenshots were captured locally during QA and are not committed.

- FIXED: the server-free room shows the live crew fund using the existing components. Chat and actions have one setup sentence. No websocket or chat-history request is made while the backend is absent.
- PASS: `pnpm test:e2e --read-only` executed 14 browser states at 1440 and 375: landing, lobby, room, member list, proposal list, crew detail and season. Zero writes, credentials, browser console errors or horizontal overflow.
- Before: `before-offline-1440.png`, `before-offline-375.png`. After: `r3-read-only-room-1440.png`, `r3-read-only-room-375.png`; member/proposal detail: `r3-read-only-room-members-1440.png`, `r3-read-only-room-members-375.png`, `r3-read-only-room-proposals-1440.png`, `r3-read-only-room-proposals-375.png`.
- Every displayed fund number comes from these view calls: hub `list_crews` / `get_crew` (allowed accounts, shares, supply, holdings, vault, captain limits and daily usage); `get_assets` (token decimals); pool `get_reserves` (NAV marks); hub `get_receipts` (verified return and drawdown); DAO `get_last_proposal_id`, `get_proposals`, `get_policy` (recent/open proposals, statuses, votes and native thresholds); hub `get_trades` (recent trade cards). Per-member ragequit amounts use floor(holding × member shares / total shares), exactly as the contract does, with the final holder receiving remaining dust.
- PASS: 16 Rust tests, including sandbox invitation admission, non-member rejection and current-shareholder recount. SDK: 13 tests. Compact hub artifact: 432626 bytes. Existing crew state layout is unchanged.
- PENDING: testnet invitation UI proof and full browser run. No R3 testnet writes have been made at this checkpoint. Historical Nov 11 limits above describe that earlier run.


## Judging R3 — invitations (Nov 12)

Screenshots were captured locally during QA and are not committed.

- FIXED: `/invite account.testnet` creates a card using the existing trade-card components and styles. Only a current shareholder can file it. Both the native `AddMemberToRole` and bound hub `add_member` proposal must pass the hub's current-shareholder recount.
- PASS: fresh account `qamwdiemgn.kumi-77b50457fb.testnet` was created through browser email sign-in, followed, then was invited by Mika and approved by Mika and Juno. Sputnik proposals #16 and #17 both reached Approved; hub invitation #0 reached admitted.
- PASS: the fresh member chipped in the minimum 0.01 testnet NEAR and received `8294737022888653143370` shares. `get_crew` confirms the new position. Hub `get_invites` and DAO `get_proposal` supply the invitation status and vote counts.
- Role filing: `9aqGLHmx2DQVj4Ufo8uSPfx4fpKeZKGU48QVLiMfLiwG`; hub gate filing: `97fx6A24dBy7yjG2SHtBBfR8VgyaaDSvSTTqccjsCjwq`; final admission: `8jqdM6oNeJhKuL2kbffUB11vsdqnFGwuHpzdhzywX4jc`; chip-in: `BznsdFreDnzMBiv4pE9pu6hA53QMWxThyvc1b2P2GEoU`. All hashes, both members' intermediate votes and cumulative costs are in `deployments/r3-2026-11-12.json`.
- Before: `before-offline-1440.png`, `before-offline-375.png`. After: `r3-invite-draft-1440.png`, `r3-invite-draft-375.png`, `r3-invite-admitted-1440.png`, `r3-invite-admitted-375.png`, `r3-chip-in-receipt-1440.png`, `r3-chip-in-receipt-375.png`, `r3-member-board-1440.png`, `r3-member-board-375.png`.
- PASS: three new sandbox tests cover complete admission and join, outsider/unfunded invite rejection, and native DAO approvals that fail the current-shareholder recount. All 16 Rust tests pass. SDK: 13; server: 4, including relayer restrictions on invitation roles and outsiders. Production web and server typechecks pass.
- Historical Nov 11 statements about a missing invite command are superseded by this R3 result. No second crew or account-key deletion was performed.
