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
- `demo/paid-in-full-demo.mp4` is v5 (226.8 s, 1920x1080): the live wallet section is filmed (near-cli on camera, inv-3007 Released), the Intents segment was re-rendered ("near-intense" fixed — re-transcribed with faster-whisper, "intents" in base + small), and the end card shows the repo URL on one line. Section 5 re-filmed against the v3 contract. v4 preserved as `demo/paid-in-full-demo-v4.mp4`.
- Narration pronunciation is now verified by ear (faster-whisper transcription of the final mix): cold open clean ("Paid", no "Tayden full"), "NEAR" clean throughout, "Intents" clean in the re-rendered segment. "drain rerout" at ~19–27 s is a Whisper-base transcription artifact (small hears "reroute") — not a TTS defect.

## Tests
- Sandbox contract test (`contract/tests-sandbox/run.mjs`): **20/20 passed on the Hetzner server** (contract worker's run).
- Unit tests (`npm test`): **20/20 passed** — 19 in `tests/clerk-and-ledger.test.js` plus 1 server-level test (`tests/server-approve-correct-reapprove.test.js`, approve → correct → re-approve over HTTP).
- Wallet call builders (`app/public/wallet.js`): **11/11 passed** (worker's suite, re-run independently); the Node on-chain proof drove the same call shapes (inv-3004 Released, inv-3005 cancel-from-Created, inv-3006 low-cap reject).

## Fix round after the v3 re-reviews (Nov 9, 2026 — Grok-task, ChatGPT-task, Rowan)

Three independent re-reviews of the v3 package. Two of their headlines were
disproven on verification and were NOT "fixed": (1) the "F1 seam inverted /
pre-approval correct 400s + funds wrong amount" claim — `voidApproval` is
already a no-op for unapproved Created escrows, and the live flow was run
(correct $12,400→$12,000 pre-approval → 200, fund moves exactly the
corrected $12,000); (2) the "DEPLOY.md proof hashes don't resolve" claim —
all 20 v3 proof hashes in DEPLOY.md (deploy tx + 19 proof-step txs) were
re-checked against the NearBlocks v3 API and all resolve (HTTP 200). What
was fixed is only what was verified:

- **F6 — correct/change-order after funding or release half-mutated the
  clerk (the one real app bug).** `clerk.correctInvoiceTotal` and
  `clerk.approveChangeOrder` now reject unless the invoice is in a
  correctable state (`correctInvoiceTotal` allows `quoted` + `approved`
  unfunded and rejects `paid`; `approveChangeOrder` allows only `quoted`),
  and `/api/correct` + `/api/change-order` check the escrow status and void
  the ledger approval BEFORE mutating the clerk, with snapshot-restore
  rollback on any throw — mirroring `/api/approve`. A refused request now
  mutates nothing anywhere. Verified live: correct after fund → 400 with
  invoice + escrow byte-identical to before, and release still works
  afterward (escrow Released, $12,000 moved); change-order after release →
  400, invoice unchanged. Note: the clerk cannot see funding (status stays
  `approved` after funding), so the funded lock lives in the route's
  escrow-status check — the approved-but-unfunded correction path the
  demo and the F1 test require is preserved.
- **F7 — payload payout placeholder filled.** `submission/payload-draft.md`
  now carries the settled payout: the team's existing mainnet implicit
  account `335da30a9441d8b689e62fef1d01383b24a980dabcef726898536e23d1f1204d`
  (Chris was released from creating an account). The `idea` text is still
  exactly 1,500 characters.
- **F9 — narration states line (docs-only).** `demo/demo-script.md` now
  reads "approved, then funded, then paid" — the states are sequential,
  not simultaneous. The shipped v5 audio says "approved, funded, and
  paid"; the audio is approved as-is and was NOT re-recorded.
- **F10 — wallet builder suite shipped.** `tests/wallet-builders.test.js`
  is now in the repo and the package (17 tests — the cited 11/11 suite was
  never committed). Wallet success labels in `app/public/wallet.js` now
  use the read-back on-chain amount, not the Amount field value; if the
  live read-back fails, no amount is claimed.
- **Docs:** the "mirrors the contract's states and rules 1:1" claim is
  corrected (README + desk section 4): the sim re-uses the invoice id on
  correction while on-chain a correction needs a new id. README
  What-is-real table gains the §6 live-write wallet row and the "no
  signing, no writes" claim is scoped to section 5; the demo script's
  section-5 storyboard and shot-6 caption now name the v3 invoices
  (inv-3001 Released, inv-3002 Funded, inv-3003 Cancelled). The canonical
  corrected amount is **$12,000** throughout (the approved v5 audio: "the
  invoice is corrected to the agreed $12,000"). Intents rate re-verified
  live: 1 NEAR → 3.625144 USDT, Nov 8, 2026. DEPLOY.md's "ten denial
  checks" was counted from the list (steps 3, 4, 6, 7, 9, 10, 12, 13, 14,
  15) and is correct as written. The proof log
  `scripts/onchain-proof-v3.log` is now committed to the repo (it was in
  the review package but not in the repo).
- **Contract comment (no code change).** `contract/src/contract.ts`
  Known Limitation 1 now states plainly that account-format validation
  does not prove an account exists on-chain. The Wasm was rebuilt twice
  from the edited source and is byte-identical to the deployed Wasm
  (541,663 B, sha256
  `dc025a554f3640ac0c755aa4283de26dec48952e19896fe80efdd63fa3268c8c`).
  A clean-copy rebuild (fresh `npm install`, no `node_modules`) also
  reproduces it byte-identically. No redeploy.
- **Deliberately NOT fixed:** F8 — the `cancel` assert message ("only the
  client who funded this invoice") is wrong for a Created invoice, but
  the string is in the contract; changing it changes the Wasm hash and
  breaks the byte-verified deployment. It stays as a known cosmetic nit.
  No video change of any kind (v5 approved as-is); no new `/api/cancel`
  route; no contract change; no redeploy.
- **Rebuild:** `contract/package.json` + `contract/package-lock.json` are
  now in the review package so a rebuilder has the manifest; `npm
  install` in `contract/` restores the toolchain (qjsc, wasi-sdk,
  quickjs, binaryen) via postinstall, and `npm run build` reproduces
  the deployed Wasm byte-identically.

## Tests (after the fix round)
- Sandbox contract test (`contract/tests-sandbox/run.mjs`): **20/20** —
  carried from the v3 record (no contract code changed in this round;
  the Wasm is byte-identical to the deployed one).
- Unit + server tests (`npm test`): **45/45 passed, 0 fail** — 19 in
  `tests/clerk-and-ledger.test.js`, 1 server-level F1 test
  (`tests/server-approve-correct-reapprove.test.js`, approve → correct →
  re-approve over HTTP), 8 in the new
  `tests/server-correct-change-order-atomicity.test.js` (correct and
  change-order on paid and funded invoices → 400 with state unchanged;
  correct/change-order before approval → 200 and the corrected amount
  funds), 17 in the new `tests/wallet-builders.test.js`.
- Live-flow re-run over HTTP (coordinator, scratch server): create
  $12,400 vs $12,000 approved → correct to $12,000 pre-approval → 200 →
  approve → fund moves exactly $12,000; correct after fund → 400 with
  invoice + escrow byte-identical and release still working; change-order
  after release → 400 with invoice unchanged.
