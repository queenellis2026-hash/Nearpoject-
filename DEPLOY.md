# Paid in Full — deployment record

## Current status (Nov 9, 2026)

The **v3 deployment** (`paid-in-full-v3.testnet`, below) is the current
contract: it has the cap fail-fast at approval and cancel from Created,
proven live with two distinct accounts plus stranger denials. The v2
deployment (`paid-in-full-v2.testnet`) is now **history** — kept below,
not deleted. The v1 deployment (`paid-in-full.testnet`) is the **pre-fix**
contract — kept here as history.

## v3 deployment — cap fail-fast + cancel from Created (Nov 9, 2026 ~00:30 CST)

The v3 contract went to a FRESH account (same reason as v2): the v2
storage holds v2 invoices, so the new Wasm was not deployed over it.
`paid-in-full-v2.testnet` stays as the v2 record.

- **Contract account (fresh):** `paid-in-full-v3.testnet`
- **Deploy transaction:** `8e3kfhWMRHqijsMDMb2BgS8n5tkvmi1gNXJci2XyPKMx` — https://testnet.nearblocks.io/txns/8e3kfhWMRHqijsMDMb2BgS8n5tkvmi1gNXJci2XyPKMx
- **Code hash:** `Fopmv4Gpcark4EDU9ir9yWApFwbJSDVD9VMT2nycPpjD`
- **Wasm:** `contract/build/paid-in-full.wasm`, 541,663 bytes, sha256 `dc025a554f3640ac0c755aa4283de26dec48952e19896fe80efdd63fa3268c8c` — rebuilt from `contract/src/contract.ts` immediately before deploy (`npm run build` reproduced the same sha256 and size), and the deployed code read back over RPC is byte-identical (541,663 bytes, same sha256).
- **Account funding:** fresh top-level account created via the testnet faucet with `near create-account paid-in-full-v3.testnet --useFaucet --networkId testnet` (near-cli 4.0.13, installed globally first — it was missing from this VM again). Faucet account-creation tx `6HsQGpUQ3kB8RH7yKp7p1GKq6TzepLWEZVE65THkmqE4`; account funded with exactly 10 NEAR. A subaccount cannot hold the 541 KB contract (needs ~5.3 NEAR storage headroom), same as v2.
- **Deploy note:** `near deploy paid-in-full-v3.testnet build/paid-in-full.wasm --initFunction init --initArgs '{}' --networkId testnet`. No "already has a contract" prompt on a fresh account.
- **Explorer:** https://explorer.testnet.near.org/accounts/paid-in-full-v3.testnet

### Contract changes in v3 (vs v2)

- `client_approve` now asserts `approved_sum_yocto >= invoice amount` and
  panics with the clear error `approved sum must be at least the invoice
  amount`. A too-low cap fails fast at approval and — because a NEAR panic
  rolls the call back — records nothing, so the client retries with a
  correct cap. A below-amount cap can no longer exist on-chain, so the
  v2-style "approve low, then funding rejected" cap proof is replaced by
  the fail-fast rejection itself (see proof step 12). The
  `approve_and_fund` cap assert stays in the code as defense-in-depth.
- `cancel` is now explicitly allowed from `Created` (unfunded — no
  transfer is attempted, no funds move) as well as `Funded` (refund in
  full). Client-only, as before.

### On-chain proof (live contract, fresh account)

Full escrow loop with the gate, two distinct accounts (client ≠
contractor), plus access-control denials with a third (stranger) account.
Client `paid-in-full-v3.testnet`, contractor `crew.paid-in-full-v3.testnet`
(3 NEAR subaccount, create tx `4BusUNtWQ9BaULintom3ZtuQP2JSttdpyweegzvAVceH`),
stranger `stranger.paid-in-full-v3.testnet` (1 NEAR subaccount, create tx
`3UTcpVHHmZi8TRrXJRUwkCjtBjQrmswqM9AdR9FhDnKU`).
Script: `scripts/onchain-proof-v3.sh` (raw output:
`scripts/onchain-proof-v3.log`). Every step below was verified with an
independent RPC read (`near view get_invoice` / `invoice_ids`) after the
call, and the negative transactions were cross-checked against the
NearBlocks indexer (each shows `ok: false` there). Note: near-cli prints
no transaction hash for a rejected call, so the negative tx hashes below
come from the indexer listing for the account, ordered by block height —
they match the script's call order exactly.

1. `invoice_ids` on the fresh account → `[]` (clean storage, no v2 invoices)
2. `create_invoice` inv-3001, "Bathroom remodel — final invoice", client `paid-in-full-v3.testnet`, contractor `crew.paid-in-full-v3.testnet`, amount 10^22 yocto (0.01 NEAR) → tx `HqDzfZ7HHuUJpSXEwfhuj1xJL1BHTfg21e6TnV36gaBc`; `get_invoice` → `Created`, `approved: false`, `approvedSumYocto: '0'`
3. **Negative:** `approve_and_fund` without `client_approve` → rejected, tx `3cNNNuvwZVwRULxm5WekyaXjAaRycmz9VLDEHkApGm1q` ("invoice must be approved by the client before funding (call client_approve first)"); `get_invoice` → still `Created`, `approved: false`
4. **Negative:** `client_approve` by the stranger → rejected, tx `9ihzpn7RSN4SwustsGK3CQF2cuuS5bceT8SzZ1gYH7rv` ("only the recorded client can approve this invoice")
5. `client_approve` inv-3001 with `approved_sum_yocto` 10^22 (0.01 NEAR cap) → tx `9d6YnD5XRD2kPxn7Ye1wm9eBCcPcob3NegiDndU6dNVw`; `get_invoice` → `approved: true`, `approvedSumYocto: '10000000000000000000000'`
6. **Negative:** `approve_and_fund` by the stranger → rejected, tx `5zs27htp4tbHV3iKc3pYSut6Jdt6kMAy5GCoAkxww7Zx` ("only the recorded client can fund this invoice")
7. **Negative:** `approve_and_fund` by the client with 0.02 NEAR (wrong amount) → rejected, tx `GxrAo8iMcmC9ETszMxygVhsFmMMH9HrApUxJPM37EohC` ("attached deposit must equal the invoice amount exactly")
8. `approve_and_fund` with exactly 0.01 NEAR → tx `A9AoJ3r4R8Mti8jCt5NemmEnHcp5LFnnmhshxmMLJKUd`; `get_invoice` → `Funded`
9. **Negative:** `release` by the stranger → rejected, tx `CYtiQgqdSSSz9nKV6CAkjkLpXHuwyEZLoUf7LmFzX2o` ("only the client who funded this invoice can release it")
10. **Negative:** funding twice → rejected, tx `Ejkgx2kV4hszSnyETMut2YSkmqw2bun9fsD11RZUaPav` ("cannot fund an invoice in status Funded")
11. `release` (as the client) → tx `AK6xur6aWs72WEZfg4diCUMZqCHEU7rYnHbGosADVxGa`; `get_invoice` → `Released`; contractor balance read back as 3.01 NEAR (3 + the 0.01 release) — the funds moved
12. **Negative:** releasing twice → rejected, tx `4nEkZ9eVJbEaMPRbRF8GCnU1fqxmk1cbn5TsAbeL8ovc` ("cannot release an invoice in status Released")
13. **Negative:** cancel after release → rejected, tx `3ceDsBa8Hvj5whZjXWrUqGw8KiY2XwfZ4f5X4JJH5yHo` ("cannot cancel an invoice in status Released")
14. **NEW — low-cap approve fails fast:** `create_invoice` inv-3002, amount 1.24×10^22 yocto (0.0124 NEAR) → tx `96o27xYfF3DHL9XBuuMm9M2hF5gaor7MnwLM2xcJ1R2u`; `client_approve` with a 10^22 (0.01 NEAR) cap → **rejected**, tx `AxSH6GY1VJ3sw8wRoaoea3da7Lba1snoBNLeTSJRy4dm`, with the clear error "approved sum must be at least the invoice amount"; `get_invoice` read back → still `Created`, `approved: false`, `approvedSumYocto: '0'` (state unchanged — the panic rolled the call back). Retry `client_approve` with the correct 0.0124 cap → tx `B6rXSFsuwooxbNBmXPDQ8JsKKWCe97qtLWzf2S8UKSmq`; `get_invoice` → `approved: true`, `approvedSumYocto: '12400000000000000000000'`; then `approve_and_fund` with exactly 0.0124 NEAR → tx `6qDiNq7S5diUMh7erdoQVSB3YUXAHeBzsTo8UPhTJix`; `get_invoice` → `Funded`. This is the v3 cap proof: a below-amount cap can no longer be recorded at all.
15. **NEW — cancel from Created:** `create_invoice` inv-3003 (0.01 NEAR) → tx `8Fr4uxLf8bJyvMmT3xNpR8tBvurwYHqbYCDbc8Gx7Ebk`; balances read before cancel: client 5.9565126583457766 NEAR, contractor 3.01 NEAR. **Negative:** `cancel` by the stranger → rejected, tx `Emuz6xzKSwQU8DmRb2mDfH4KB36KNXJ4c3eofPqJJJTJ` ("only the client who funded this invoice can cancel it"). `cancel` as the client from `Created` → tx `qacUfRwnrisTfyndAuabqHV3nzihaxrkMRrYHPRfPqA`; `get_invoice` → `Cancelled`, `approved: false`, `approvedSumYocto: '0'`; balances read after: client 5.9554750193566306 NEAR (down only by gas), contractor 3.01 NEAR unchanged — no funds moved.
16. `invoice_ids` → `['inv-3001', 'inv-3002', 'inv-3003']` (fresh account only)

Final RPC re-read (independent of the script log, after the proof finished):
`inv-3001` → `Released`, approved, cap 10^22; `inv-3002` → `Funded`,
approved, cap 1.24×10^22; `inv-3003` → `Cancelled`, unapproved, cap 0;
`invoice_ids` → `['inv-3001', 'inv-3002', 'inv-3003']`; balances —
client 5.9554750193566306, contractor 3.01, stranger 0.9960392346097146
(stranger down only by gas on its rejected calls).

- [x] Rebuilt Wasm hash matches the deployed code hash (rebuild → sha256 `dc025a554f…` → live RPC code view: 541,663 bytes, same sha256; code hash `Fopmv4Gpcark4EDU9ir9yWApFwbJSDVD9VMT2nycPpjD`)
- [x] On-chain loop re-run with two distinct accounts (client ≠ contractor)
- [x] Denials exercised on-chain (10): non-client approve / fund / release / cancel rejected; funding without a recorded approval rejected; funding with the wrong amount rejected; double-fund, double-release, cancel-after-release rejected; low-cap approve rejected with the clear error
- [x] Cap proof (v3 form): a cap below the invoice amount fails fast at `client_approve` and records nothing; retry with a correct cap succeeds and funds exactly
- [x] Cancel from Created proven: status `Cancelled`, no funds moved (balances verified before/after)
- [x] Sandbox test (`contract/tests-sandbox/run.mjs`) — 20/20 passed on the Hetzner server (contract worker's run, per the build brief)
- [x] README, payload draft, app pointers, and this file updated to the v3 account, transaction, and code hash

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

## v2 redeploy — approval-gate fix (Nov 8, 2026 ~22:12 CST) — HISTORY, superseded by v3 above

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
