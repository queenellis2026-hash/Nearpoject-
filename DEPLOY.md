# Paid in Full — testnet deploy record

Deployed: **Sunday, November 8, 2026** (America/Chicago), by Ellis (agent) under Chris Babcock's direction.
Network: **NEAR testnet only. No mainnet account, deploy, or transaction exists or was attempted.**

## Deployed contract

- **Contract account:** `paid-in-full.testnet`
- **Deploy transaction:** `FFLd5A7dud5FmghMLCAfZuBvFZwPrQyPrbrg88ShgyXf` (status: FINAL)
- **Explorer:** https://testnet.nearblocks.io/txns/FFLd5A7dud5FmghMLCAfZuBvFZwPrQyPrbrg88ShgyXf
- **Account explorer:** https://testnet.nearblocks.io/address/paid-in-full.testnet
- **Code hash on chain:** `5CzGbR7KbWsjqarxYaSKHBSgTwz4rZxNDP9KHBpz6ayC`
- **Wasm deployed:** `contract/build/paid-in-full.wasm`, 539,586 bytes, sha256 `3e80e40508943276f666821090b4cfd86559aacdb347995ca87faa0caa747297`
- **Init:** `init()` called with `{}` at deploy time.
- **Account funding:** fresh team testnet account created via the testnet faucet (10 NEAR). Balance after deploy + smoke test: ~9.98 NEAR.

## How it was deployed (deviation noted)

The repo's `contract/scripts/deploy-testnet.sh` is written for `near-cli-rs`
(`near contract deploy ... sign-with-keychain network-config testnet`), which
needs cargo. This VM has no cargo, so the deploy used the npm CLI instead
(`near-cli` 4.0.13, installed globally with `npm install -g near-cli`):

```
near create-account paid-in-full.testnet --useFaucet --networkId testnet
near deploy paid-in-full.testnet contract/build/paid-in-full.wasm \
  --initFunction init --initArgs '{}' --networkId testnet
```

The script's guard is preserved in substance: the account is a `.testnet`
account, the deploy ran with `--networkId testnet`, and the prebuilt Wasm was
deployed as-is (no rebuild — the artifact is Rowan's verified build output;
rebuilding needs the near-sdk-js toolchain). The local sandbox test node was
not run (VM file-descriptor limit 4096, sandbox needs 65535); a live testnet
deploy does not need it.

## On-chain smoke test (live contract, 0.01 testnet NEAR)

Full escrow loop, all state transitions verified by view calls:

1. `create_invoice` inv-0001, "Bathroom remodel", contractor
   `paid-in-full.testnet`, amount 10^22 yocto (0.01 NEAR)
   → tx `GgaAiXRqacEsv9vt1SxkzPw2GyGZG6JANqwVqWm8hQ4K`; `get_invoice` → `Created`
2. `approve_and_fund` with exactly 0.01 NEAR attached
   → tx `7AuEP9YxZ4aavJKwoziYp6tmyot7ssEgMA9BaE9poqGf`; `get_invoice` → `Funded`, client `paid-in-full.testnet`
3. `release`
   → tx `CD8Nq6H1UuNCdK9NSJ3mF5XiE7qyLAsBVQsy2nLfm85o`; `get_invoice` → `Released`
4. `invoice_ids` → `['inv-0001']`

The deployed contract enforces the exact-deposit rule and the client-only
release exactly as the local simulation does. The demo's escrow movement is
no longer simulation-only — the contract is live on testnet.

## Credentials

The testnet account's keypair is stored at
`~/.near-credentials/testnet/paid-in-full.testnet.json` (0600) on the build VM
only. It is **not** in this repository and must never be committed. The
mainnet NEAR credentials were not touched.
