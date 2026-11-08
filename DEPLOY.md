# Paid in Full — deployment record

## Current status (Nov 8, 2026)

The **v2 deployment** (`paid-in-full-v2.testnet`, below) is the current
contract: it has the on-chain approval gate and the approved-sum cap, proven
live with two distinct accounts plus stranger denials, and the sandbox test
actually ran and passed on the Hetzner server. The v1 deployment
(`paid-in-full.testnet`) is the **pre-fix** contract — kept here as history.

## v1 deployment — paid-in-full.testnet

- **Network:** NEAR testnet
- **Contract account:** `paid-in-full.testnet`
- **Deployed:** Nov 8, 2026, by Ellis (near-cli 4.0.13, prebuilt Wasm)
- **Deploy transaction:** `FFLd5A7dud5FmghMLCAfZuBvFZwPrQyPrbrg88ShgyXf` — https://testnet.nearblocks.io/txns/FFLd5A7dud5FmghMLCAfZuBvFZwPrQyPrbrg88ShgyXf
- **Code hash:** `5CzGbR7KbWsjqarxYaSKHBSgTwz4rZxNDP9KHBpz6ayC`
- **Wasm:** `contract/build/paid-in-full.wasm`, 539,586 bytes. Rebuilding from `contract/src/contract.ts` reproduces the deployed code byte-for-byte (verified Nov 8, 2026 — Rowan's review).
- **Methods:** `init`, `create_invoice`, `approve_and_fund`, `release`, `cancel`, `get_invoice`, `invoice_ids`
- **On-chain loop run:** create → fund (0.01 NEAR, exact deposit) → release, on invoice `inv-0001`.
- **Live verification (Nov 8, 2026, testnet RPC views):**
  - `invoice_ids` → `["inv-0001"]`
  - `get_invoice("inv-0001")` → `{ job: "Bathroom remodel", contractor: "paid-in-full.testnet", client: "paid-in-full.testnet", amountYocto: "10000000000000000000000", status: "Released" }`
- **Scope note:** the v1 loop ran with one account as client, contractor, and deployer. Access-control denials (a different account attempting to fund or release) were not exercised on-chain in v1 — only the happy path is proven on-chain.

## v2 redeploy — approval-gate fix (Nov 8, 2026 ~22:12 CST)

The approval-gate fix deployed to a FRESH account (Rowan's review item 2):
the v1 storage on `paid-in-full.testnet` holds pre-fix invoices without the
`client` / `approved_sum` fields, so the fixed contract went to a new
account instead of being redeployed over it. The Wasm is the same build as
the earlier `paid-in-full.testnet` redeploy (same sha256, same code hash) —
only the account and its storage are fresh.

- **Contract account (fresh):** `paid-in-full-v2.testnet`
- **Deploy transaction:** `CLzB1jES9NcS43DMPd9TYTrQfi8T55DeXosfg3nKYCoH` — https://testnet.nearblocks.io/txns/CLzB1jES9NcS43DMPd9TYTrQfi8T55DeXosfg3nKYCoH
- **Code hash:** `9iHW5xy1jvLKEowgy1tA1jU4zvtofpYgoY9W4oVKM6G8` (identical to the `paid-in-full.testnet` redeploy — same Wasm)
- **Wasm:** `contract/build/paid-in-full.wasm`, 541,471 bytes, sha256 `8170f78436d7a239b066e216154d028b74df92b14b06fbeec9d394adbe5b60e1`
- **Account funding:** fresh top-level account created via the testnet faucet (10 NEAR). A subaccount `v2.paid-in-full.testnet` (3 NEAR, funded from `paid-in-full.testnet`) was created first but could NOT hold the 541 KB contract — deploying it needs ~5.3 NEAR of storage headroom, and the account only had 3 NEAR. That subaccount now serves as the contractor in the proof below.
- **Deploy note:** `near deploy paid-in-full-v2.testnet build/paid-in-full.wasm --initFunction init --initArgs '{}' --networkId testnet`. No "already has a contract" prompt on a fresh account (that prompt only appears on redeploy). `near-cli` 4.0.13 had to be reinstalled globally first — it was missing from this VM.
- **Explorer:** https://explorer.testnet.near.org/accounts/paid-in-full-v2.testnet

### On-chain proof (live contract, fresh account, 0.01 testnet NEAR)

Full escrow loop with the gate, two distinct accounts (client ≠
contractor), plus access-control denials with a third (stranger) account.
Client `paid-in-full-v2.testnet`, contractor `v2.paid-in-full.testnet`,
stranger `stranger.paid-in-full-v2.testnet` (1 NEAR, subaccount of the
contract account, create tx `HSvriMNMFkuRZcC3nCFzi4BiKx4ogeYCoy64PtEnZLgo`).
Script: `scripts/onchain-proof-v2.sh`.

1. `invoice_ids` on the fresh account → `[]` (clean storage, no v1 invoices)
2. `create_invoice` inv-2001, "Bathroom remodel — final invoice", client `paid-in-full-v2.testnet`, contractor `v2.paid-in-full.testnet`, amount 10^22 yocto (0.01 NEAR) → tx `Dnkouy7HBAAAo9RJfxpn1RNBPgPX8sa21C9XW5rvrE9c`; `get_invoice` → `Created`, `approved: false`, `approvedSumYocto: '0'`
3. **Negative:** `approve_and_fund` without `client_approve` → rejected (stays `Created`, `approved: false`)
4. **Negative:** `client_approve` by the stranger → rejected
5. `client_approve` inv-2001 with `approved_sum_yocto` 10^22 (0.01 NEAR cap) → tx `kze5XJyYbzeYfhbuZ8qBCsSVwvcUr84jA7jiZ2jSUuR`; `get_invoice` → `approved: true`, `approvedSumYocto: '10000000000000000000000'`
6. **Negative:** `approve_and_fund` by the stranger → rejected
7. **Negative:** `approve_and_fund` by the client with 0.02 NEAR (wrong amount) → rejected (exact deposit)
8. `approve_and_fund` with exactly 0.01 NEAR → tx `DGLfZDxPq6dooS5szQ64amKqSXgryiEqtCgU3cVQZZcf`; `get_invoice` → `Funded`
9. **Negative:** `release` by the stranger → rejected
10. **Negative:** funding twice → rejected
11. `release` (as the client) → tx `HJ26KsA2XtMtzAYaDBF9QMSDi15MmvQD7QDiGGBTJQD5`; `get_invoice` → `Released` (funds to the contractor `v2.paid-in-full.testnet`)
12. **Negative:** releasing twice → rejected
13. **Cap proof:** `create_invoice` inv-2003, amount 1.24×10^22 yocto (0.0124 NEAR) → tx `A9328WDuXkzKUesVAZxpkRR8mJTXr4pLcBDR9YjRfisi`; `client_approve` with a 10^22 cap → tx `DnRhw2xHJqVghwYouDZZuvU2EQ1TJUZdTqe8UjUMqW62`; `approve_and_fund` with 0.0124 NEAR attached → **rejected** ("invoice amount exceeds the approved sum"); `get_invoice` → still `Created`, `approved: true`, `approvedSumYocto: '10000000000000000000000'` (inv-2002 is the same cap case, created earlier in the same run)
14. `invoice_ids` → `['inv-2001', 'inv-2002', 'inv-2003']` (fresh account only)

- [x] Rebuilt Wasm hash matches the deployed code hash (rebuild → hash → live code view: Wasm sha256 `8170f784…`, code hash `9iHW5xy1…` on both the `paid-in-full.testnet` redeploy and this fresh account)
- [x] On-chain loop re-run with two distinct accounts (client ≠ contractor)
- [x] Denials exercised on-chain: non-client approve / fund / release rejected; funding without a recorded approval rejected; funding over the approved sum rejected
- [x] Sandbox test (`contract/tests-sandbox/run.mjs`) actually executed, including double-fund, cancel-after-release, and release-after-cancel — **ran on the Hetzner server (Nov 8, 2026): ALL SANDBOX CONTRACT TESTS PASSED, exit 0.** It cannot run on the VM (fd limit 4096, needs 65535); Hetzner's hard limit is 524288. Note: the test needed a one-line fix for near-workspaces v4 (`crew.balance()` instead of the v3 `crew.account.getAccountBalance()`). Node 24.22.1 was installed on Hetzner from the official tarball for this run.
- [x] README, payload draft, and this file updated to the v2 account, transaction, and code hash

### The earlier `paid-in-full.testnet` redeploy (same Wasm, superseded)

The fixed contract was first redeployed to the v1 account `paid-in-full.testnet` (tx `ARxLv79uEFPGUM7bkfi2ks62PYD54UK8RuqcVhKuZeY8`, code hash `9iHW5xy1jvLKEowgy1tA1jU4zvtofpYgoY9W4oVKM6G8`) and the loop + cap were proven there (inv-1001 create `CzZnq3e3…` → approve `6ii3RmCC…` → fund `GF6n1jAT…` → release `QHLney3X…`; cap proof inv-1002 create `6PqPGWSQ…` → approve `FiTCafPR…` → fund rejected). That deploy is superseded by the fresh-account deploy above (Rowan item 2) — the old account's storage still holds the pre-fix `inv-0001`, so the fresh account is the deployment of record.

## The v1 deployment below is the **pre-fix** contract
