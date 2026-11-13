# NEAR HACKATHON submission worksheet

Draft for Nick to review and enter in the [official form](https://nearhackathon.com/#apply). Field names and constraints checked against [HACKATHON.md](https://nearhackathon.com/HACKATHON.md). Deadline: 2026-11-14 23:59 UTC. This worksheet does not submit an application.

| Field | Draft value / requirement |
| --- | --- |
| projectName | Kumi (4 characters; allowed: 2-80). |
| leadName | TBD Nick (2-80 characters). |
| email | TBD Nick (valid email; max 160 characters; max 2 submissions per email). |
| size | TBD Nick: one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+`. |
| tracks | Proposed, best first: `social` - friends pool money and vote through a crew's Sputnik DAO.<br>`defi` - pooled treasury, mirrored follower vault and contract-enforced trading; fills are testnet pools, with Intents dry quotes only. |
| nearAddress | TBD Nick: NEAR MAINNET payout account (2-64 characters, lowercase NEAR account format). Do not use a testnet demo account. |
| projectUrl | TBD: public GitHub repo URL after push (http(s), max 300 characters). |
| demoUrl | TBD: public X post URL (http(s), max 300 characters). |
| idea | Friends plan trades in group chats, but pooling money leaves one person holding the funds and tracking everyone's share. Kumi turns a crew chat into a shared treasury: members pitch trades, vote through their own Sputnik DAO, and exit with their share. A captain can trade within contract limits using a NEAR function-call key. A follower vault mirrors crew trades, and returns are recomputed from on-chain receipts. NEAR sub-accounts and NEP-366 meta transactions let the relayer pay gas for browser-signed actions. The prototype is deployed on NEAR testnet with labelled tSOL/tBTC pools. NEAR Intents 1Click provides mainnet dry quotes only; live mainnet swaps and private trading are not enabled. |
| consent | Nick ticks after reading: "I agree that the organizers may use these details to review our submission and contact us about this hackathon." |

Idea character count: **699** (text only; allowed: 20-2000).

Before submitting, Nick fills the remaining fields and replaces the README's other-projects placeholder with the actual independent project names required by Q-015. The repo must be public with LICENSE. The local-only demo needs a video attached to the X post (Q-012). Re-read the live rules before submission. If using the API, generate `requestId` once at submission time and reuse it on retries; it is transport metadata, not a human form field. Keep the eventual personal-data payload out of git.

## Risks and disclosures

The phone app (`mobile/`) is a NEAR port of the Avalanche edition's Expo app: its screens, components and art are reused, and its chain layer is new NEAR code (on-device NEAR key, NEP-366 delegates, Sputnik votes). Q-002/Q-015: Kumi also has an [Avalanche edition](https://kumi-avax-web.vercel.app), built on Nov 12, 2026. This NEAR submission claims only the NEAR-specific code built in the hackathon window.

## X post draft

The human posts this (209 characters; limit 280):

```text
pooling money with friends shouldn't mean handing one person the keys. kumi puts trade votes in a Sputnik DAO, with exits and on-chain receipts. built at NEAR HACKATHON on testnet. @NEARProtocol #NEARHackathon
```

attach: kumi-near-film-share.mp4 (2:30, 720p, 6.3 MB: the Kumi iOS app on the iOS Simulator, recorded live on NEAR testnet; opens on a crew vote passing and the trade executing from the phone).
