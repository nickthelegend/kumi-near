# Blocked, setup-required and open items

## Needs a credential only Nick can provide

| Variable | What it unlocks | State without it |
| --- | --- | --- |
| `NEAR_MAINNET_ACCOUNT` (funded) | Live NEAR Intents 1Click swaps on mainnet: real-asset trades, deposits from any chain, ragequit to any chain. | Every trade card and the ragequit sheet show a real mainnet `dry: true` quote and "Setup required: NEAR_MAINNET_ACCOUNT". Testnet trades fill against the labelled test pools. |
| `ONECLICK_JWT` | Confidential (private-mode) 1Click quotes. The API answers "User authentication is required for confidential intent quotes" without it. | The SDK throws "Setup required: ONECLICK_JWT" for `confidentiality: basic`. Private crews are off. |
| `RESEND_API_KEY` | Real email delivery of sign-in codes. | The sign-in sheet says "Email delivery: Setup required: RESEND_API_KEY" and shows the code (testnet preview). |
| Testnet NEAR | Each new crew's Sputnik DAO needs about 5.5 NEAR of code storage, paid by the relayer on testnet. | The relayer had ~4 NEAR left after the run. A second crew needs a top-up; the testnet account helper rate-limits to about one account an hour. |

## Decisions for Nick

- **Lock the hub.** `hub.kumi-77b50457fb.testnet` still has the deployer's full-access key, so its code can be upgraded. Deleting that key makes the vault rules final, and it can't be undone. It hasn't been done.

## Engineering still open

| Item | State |
| --- | --- |
| Second-device sign-in | Not built. The key stays in one browser, and the server refuses a second key for the same email with a clear message. |
| Mainnet marks | Testnet marks are pool spot prices read on-chain. Pyth ended NEAR support; mainnet needs the Rhea oracle or a signed price relayer. |
| New members after creation | The hub's `add_member` is DAO-only, and the DAO also needs an `AddMemberToRole` proposal. There is no chat `/invite` command yet. |
| More than one crew on the season board | The board ranks every crew on the hub. Only one crew exists on testnet (see Testnet NEAR above). |
