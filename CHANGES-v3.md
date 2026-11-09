# What changed since the v2 review package (Nov 9, 2026)

## The fix (contract)
- `contract/src/contract.ts` — `client_approve` now asserts the approved
  sum is at least the invoice amount and panics with the clear error
  `approved sum must be at least the invoice amount`. A too-low cap fails
  fast at approval and records nothing (the NEAR panic rolls the call
  back), so the client retries with a correct cap. A below-amount cap can
  no longer exist on-chain. The `approve_and_fund` cap assert stays as
  defense-in-depth. There is NO on-chain change order that raises the cap
  after approval; the remedy for a wrong invoice amount is a corrected
  invoice (a new invoice id), exactly as the desk app's workflow does.
- `cancel` is now explicitly allowed from `Created` (unfunded — no
  transfer is attempted, no funds move) as well as `Funded` (refund in
  full). Client-only, as before.
- The compiled Wasm is now 541,663 bytes (was 541,471), sha256
  `dc025a554f3640ac0c755aa4283de26dec48952e19896fe80efdd63fa3268c8c`,
  still exporting 8 methods.

## The deployment (fresh account)
- The v3 contract is deployed to a FRESH account,
  `paid-in-full-v3.testnet` (deploy tx
  `8e3kfhWMRHqijsMDMb2BgS8n5tkvmi1gNXJci2XyPKMx`, code hash
  `Fopmv4Gpcark4EDU9ir9yWApFwbJSDVD9VMT2nycPpjD`). The v2 account's
  storage holds v2 invoices, so it was not reused; it stays as the v2
  record. The deployed code read back over RPC is byte-identical to the
  local Wasm (541,663 bytes, same sha256).
- Full escrow loop proven on-chain with two distinct accounts plus stranger
  denials (10 denial checks); low-cap approve proven to fail fast with
  state unchanged, retry with a correct cap proven to succeed and fund;
  cancel from Created proven with balances verified before/after (no funds
  moved). Proof script: `scripts/onchain-proof-v3.sh` (raw output:
  `scripts/onchain-proof-v3.log`). Full record: `DEPLOY.md`.

## The demo app
- App pointers only: `app/server.js` default `CONTRACT_ACCOUNT` is now
  `paid-in-full-v3.testnet`; `app/onchain.js` header names the v3 account;
  the desk UI (section 4 explorer block, section 5 paragraph) names the
  v3 account, deploy transaction, code hash, and the v3 invoices
  (inv-3001 released, inv-3002 funded, inv-3003 cancelled).
- The app honesty fixes (clerk.js, ledger.js, tests, demo-script.md,
  Intents) are a separate worker's lane and are NOT part of this change.

## The video
- No new video cut in this pass. The v4 video still points at the v2
  account; a v5 cut pointing at v3 is open work, not done here.
- Open item carried from v2: the narration pronunciation fixes were
  applied by rewording and respelling but were NOT verified by ear (no
  speech-to-text available where the video was produced). Please listen
  for mispronunciations.

## Tests
- Sandbox contract test (`contract/tests-sandbox/run.mjs`): **20/20
  passed on the Hetzner server** (contract worker's run, per the build
  brief for this pass).
- Unit tests (`tests/clerk-and-ledger.test.js`): count is the app
  worker's number — that worker owns the tests and was still editing them
  during this run. (`tests/clerk-and-ledger.test.js` showed 19 `test(`
  blocks when read mid-run; do not take that as the final count — confirm
  with the app worker's report.)
