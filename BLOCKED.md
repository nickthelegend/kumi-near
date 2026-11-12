# Blocked, setup-required and open items

## Needs a credential only Nick can provide

| Variable | What it unlocks | State without it |
| --- | --- | --- |
| `NEAR_MAINNET_ACCOUNT` (funded) | Live NEAR Intents 1Click swaps on mainnet: real-asset trades, deposits from any chain, ragequit to any chain. | Every trade card and the ragequit sheet show a real mainnet `dry: true` quote and "Setup required: NEAR_MAINNET_ACCOUNT". Testnet trades fill against the labelled test pools. |
| `ONECLICK_JWT` | Confidential (private-mode) 1Click quotes. The API answers "User authentication is required for confidential intent quotes" without it. | The SDK throws "Setup required: ONECLICK_JWT" for `confidentiality: basic`. Private crews are off. |
| `RESEND_API_KEY` | Real email delivery of sign-in codes. | The sign-in sheet says "Email delivery: Setup required: RESEND_API_KEY" and shows the code (testnet preview). |
| Testnet NEAR | Each new crew's Sputnik DAO needs about 5.5 NEAR of code storage, paid by the relayer on testnet. | A second crew needs a separate funding allocation and is outside the R3 budget. It was not created. |

## Decisions for Nick

- **Lock the hub.** `hub.kumi-77b50457fb.testnet` still has the deployer's full-access key, so its code can be upgraded. Deleting that key makes the vault rules final, and it can't be undone. It hasn't been done.

## Engineering still open

| Item | State |
| --- | --- |
| Second-device sign-in | Not built. The key stays in one browser, and the server refuses a second key for the same email with a clear message. |
| Mainnet marks | Testnet marks are pool spot prices read on-chain. Pyth ended NEAR support; mainnet needs the Rhea oracle or a signed price relayer. |
| Ragequitter keeps a DAO vote | **Fixed Nov 10** (see README, "Nov 10 fix"). A full ragequit removes the member from the DAO role in the same transaction; a failed removal is logged and listed by `get_stale_voters`, and anyone can retry with `remove_ex_member`. Trades are recounted against current shareholders. Bo's leftover vote on testnet was removed. Not covered: Sputnik tallies non-trade proposals (captain, policy) over the role, which includes invited members who have not deposited. |
| New members after creation | **Fixed Nov 12.** `/invite account.testnet` files both the Sputnik role proposal and bound hub admission gate. Both require a strict majority of current shareholders. A fresh relayer sub-account was admitted by the existing members and chipped in 0.01 NEAR through the browser. Evidence: `deployments/r3-2026-11-12.json`. |
| More than one crew on the season board | The board ranks every crew on the hub. Only one crew exists on testnet (see Testnet NEAR above). |

## Judging R3 full browser run

**BLOCKED by the 0.3 NEAR total cap.** The hub upgrade, storage funding and partial browser run used 0.2837164023632934 NEAR across 12 verified transactions. The next vote reserves 0.02145 NEAR for gas, exceeding the remaining 0.0162835976367066 NEAR. The guard refused it before broadcasting. The full-flow portion has used 0.0597846771588378 NEAR against its separate 0.1 NEAR cap; it has not passed end to end.

Sign-in, follow, invitation and minimal chip-in passed on testnet. Voted execution, captain execution, full ragequit and follower exit were not reached in R3. The fresh account `qamwdiemgn.kumi-77b50457fb.testnet` remains a shareholder and follower. Trade #9 / DAO proposal #18 is filed and unvoted. Its browser key is retained in the repo's gitignored credentials by the harness; no keys were deleted. Completing or cleaning up this position needs a separate gas allocation. See `deployments/r3-2026-11-12.json`, `FLOW-QA.md` and `TESTING.md` for exact hashes, state and commands. The offline room and credential-free checks pass.
