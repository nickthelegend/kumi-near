#!/usr/bin/env bash
# From a fresh clone: install, build the contracts, run every test suite, build the web app.
# Needs network access (public NEAR testnet RPC, 1Click) and no credentials.
set -euo pipefail
cd "$(dirname "$0")/.."
pnpm install --frozen-lockfile
pnpm build:contracts
node scripts/fetch-sputnik.mjs
cargo test --workspace -- --test-threads=1
pnpm -r test
pnpm --filter @kumi/web build
