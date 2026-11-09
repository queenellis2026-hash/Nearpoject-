# What changed since the v1 review package (Nov 8, 2026)

## The fix (contract)
- `contract/src/contract.ts` now records the client at `create_invoice` and
  adds `client_approve`: only the recorded client can approve, and approval
  sets an `approved_sum_yocto` cap. `approve_and_fund` requires a prior
  approval, the caller to be the recorded client, and a deposit exactly
  equal to the invoice amount and at or under the cap. Approval clears on
  correction / change-order. `release` / `cancel` remain client-only.
- The compiled Wasm is now 541,471 bytes (was 539,586), exporting 8
  methods (was 7 — `client_approve` added).

## The deployment (fresh account)
- The fixed contract is deployed to a FRESH account,
  `paid-in-full-v2.testnet` (deploy tx
  `CLzB1jES9NcS43DMPd9TYTrQfi8T55DeXosfg3nKYCoH`, code hash
  `9iHW5xy1jvLKEowgy1tA1jU4zvtofpYgoY9W4oVKM6G8`). The v1 account's storage
  holds pre-fix invoices without the new fields, so it was not reused.
- Full escrow loop proven on-chain with two distinct accounts plus stranger
  denials; cap proven (a 0.0124 NEAR invoice approved with a 0.01 NEAR cap
  cannot be funded). Proof script: `scripts/onchain-proof-v2.sh`.
  Full record: `DEPLOY.md`.

## The demo app
- `POST /api/contract-sum` is gone. There is deliberately no endpoint that
  sets a global approved sum; the sum is per-invoice at creation, raisable
  only through a signed change order on that invoice — and only before
  approval (once approved the cap is frozen on-chain; see CHANGES-v3.md).
- `app/onchain.js` (new) reads live invoice state from the deployed contract
  over testnet RPC — read-only, no keys. The UI (section 5) shows the live
  on-chain invoices alongside the local simulation, labeled as live.

## The video
- `demo/paid-in-full-demo.mp4` is v4 (104.1 s, 1920x1080): beat 6 now has a
  live on-chain tail, the closing narration was re-recorded, and the outro
  points at the fresh v2 account.
- Open item: the narration pronunciation fixes were applied by rewording
  and respelling but were NOT verified by ear (no speech-to-text available
  where the video was produced). Please listen for mispronunciations.

## Tests
- Sandbox contract test (`contract/tests-sandbox/run.mjs`) needed a
  one-line fix for near-workspaces v4 (`crew.balance()`); it ran and passed
  on the build server. Unit tests (`tests/clerk-and-ledger.test.js`) unchanged.
