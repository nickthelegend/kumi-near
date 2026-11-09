# Testing record

Last full run: 2026-11-09, on this machine. **23 tests passed, 0 failed, 0 skipped**, plus the web build, a headless Chrome check of every route, and the testnet evidence check.

| Suite | Command | Count | What it checks |
| --- | --- | ---: | --- |
| Contract sandbox | `node scripts/fetch-sputnik.mjs && cargo test --workspace -- --test-threads=1` | 7 passed | A real nearcore sandbox running the **exact Sputnik factory and DAO v3.31 bytes from `sputnikv2.testnet`** (hash-checked). The tests are listed below. |
| Contract unit | same command | 3 passed | 256-bit `mul_div`; pool-ratio valuation; the constant-product pool keeps k and charges its fee. |
| SDK | `pnpm --filter @kumi/sdk test` | 10 passed | Pure: the `/buy` and `/sell` parser, pool math against the contract formula, exact ragequit preview, chat signature verify and tamper reject, and P&L only from receipts (marks, return, drawdown, the verified flag, flagging unexplained state, season ranking). Live: the Sputnik factory on testnet RPC, SOL and BTC mapped to their native 1Click assets, a real 1Click dry quote, and a refused confidential quote without a JWT. |
| Relayer | `pnpm --filter @kumi/server test` | 2 passed | Real NEP-366 encodings checked against the live hub's DAOs and pools. Join and vote are relayed. Outsider senders, foreign contracts, deposits over the cap, `add_asset`, `RemoveProposal`, Transfer proposals and garbage bytes are refused. |
| MCP | `pnpm --filter @kumi/mcp test` | 1 passed | A real MCP client over stdio: lists the 5 tools, reads crews from testnet and gets a P&L verified from receipts; a bad command returns `isError`. |
| Web build | `pnpm --filter @kumi/web build` | passed | `tsc -b` and the Vite production bundle. |
| Browser | headless Chrome (playwright-core, `channel: 'chrome'`) on `vite preview` | 6 routes × 3 widths | `/`, `/app`, `/chat/0`, `/crew/0`, `/leaderboard` and `/you` at 1440×900, 390×844 and 375×812, signed out and signed in: the root renders, there are no page errors, and `scrollWidth − innerWidth = 0` on every route. |
| Web flows | headless Chrome driving the UI as test players | 6 flows | Email sign-in (preview code) creates an account. `/buy BTC 10%` in chat, then **File to the crew DAO**, then two 👍, then executed. A stale-quote vote passes and the pool refuses (shown as "not filled"). Follow from the public page (fee crystallized). Join from the fund pane. Ragequit sheet, including the "to any chain" 1Click dry quote. All of these transactions are in the evidence file as `ui_*`. |
| Testnet evidence | `pnpm verify:testnet` | 46 transactions + 3 code hashes + P&L | Re-queries every recorded hash at finality, checks that the hub and both pools run the locally built Wasm, and recomputes the crew's P&L from receipts (verified). |

Sandbox tests (each assertion is a real transaction or view on the sandbox chain):

1. `crew_dao_is_created_by_factory_with_member_policy`: the factory creates the DAO with the hub's policy (3-member role, bond 0). An uninvited join is rejected. A bad slug and a short deposit are rejected. A taken slug fails in the factory, the deposit comes back, and no crew is added.
2. `share_math_join_at_nav_and_exact_ragequit`: proportional shares. A later join is minted at exactly `amount × supply / NAV`, using the pool marks read on-chain. Ragequit pays exact pro-rata NEAR and SOL. The last exits leave zero dust, and a double exit fails.
3. `proposal_vote_execute_and_vote_replay_rejected`: the DAO FunctionCall proposal is filed. A direct `execute_trade` is rejected (`ERR_DAO_ONLY`) and an outsider can't vote. 1 of 3 approvals leaves it voting; 2 of 3 executes 20% of NEAR. **Vote replay**: a second DAO proposal for the same trade is approved but ends `Failed`, and state is unchanged. A second voted trade (a sell) executes, and the receipts are in order.
4. `captain_key_limits_are_enforced_and_it_cannot_withdraw`: the vote installs a function-call key limited to `captain_trade`. **Over the size limit, a wrong asset and the daily limit are each rejected.** The key can't call `ragequit`, `add_asset` or `claim_token`, or transfer NEAR. Another signer is `ERR_NOT_CAPTAIN`. Revoking the captain by vote deletes the key.
5. `ragequit_during_pending_trade_is_exact_and_trade_uses_what_is_left`: a member leaves mid-vote with exactly 1/3. The trade then executes on 50% of the 6 NEAR left, not the 9 NEAR before the exit.
6. `follower_mirrors_pro_rata_and_pays_fee_above_high_water_mark`: crew and vault fill in one swap at the same price. The fee is exactly 20% of the gain above the HWM, paid in kind to the crew, and the HWM moves. A repeat crystallize pays nothing. The follower exits with the exact vault slice.
7. `front_running_the_crew_is_bounded_by_the_attached_quote`: a follower buys ahead of an open vote and moves the price. The crew's fill would be worse than the quote minus 3%, so the pool refuses, holdings are restored exactly, and the hub isn't left busy.

Nothing here replaces a chain or external service with a simulated response. Live tests retry twice because the public testnet RPC rate-limits bursts (HTTP 429) from this machine. The sandbox binary is nearcore 2.14.0-rc.4: set `NEAR_SANDBOX_BIN_PATH` to reuse a local one, or let near-workspaces download it.
