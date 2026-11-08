# BUILDLOG — Paid in Full

Build run: **Sunday, November 8, 2026** (America/Chicago), by Rowan (AI agent) under Chris Babcock's direction.
Environment: Linux VM, Node.js v24.22.1, npm 10.9.4, Python 3 present, **no cargo/rustc** (this decided the contract SDK: near-sdk-js, not Rust).

## What was built

- **Agent clerk** (`app/clerk.js`) — prepares invoices from line items + change orders (integer cents, exact totals), checks the total against the approved contract sum, flags overages, blocks approval of flagged invoices, requires a named human to approve, gates payment on approval.
- **Demo app** (`app/server.js`, `app/public/index.html`) — zero-dependency Node server + single-page desk UI implementing the full moment: quoted → flagged → corrected → human-approved → paid, with the event history printed.
- **Local escrow simulation** (`app/ledger.js`) — mirrors the contract's states/rules 1:1 for wallet-free local runs.
- **NEAR testnet escrow contract** (`contract/src/contract.ts`, near-sdk-js) — `init`, `create_invoice`, `approve_and_fund` (payable, deposit must equal the invoice amount), `release` (client-only), `cancel` (client-only refund), `get_invoice`, `invoice_ids`.
- **NEAR Intents dry-quote client** (`intents/quote.js`) — 1Click API, `dry: true`, no credentials.
- **Tests** — 9 unit tests (`tests/`), 1 sandbox integration test for the compiled Wasm (`contract/tests-sandbox/run.mjs`, see blocker B2).
- **Submission materials** — `demo/demo-script.md`, `submission/x-post-draft.md`, `submission/payload-draft.md`. Nothing submitted; nothing posted.

## What actually ran — commands and outcomes

1. **Unit tests** — `npm test` → **9/9 pass** (flag on $400 overage; flagged approval refused; payment before approval refused; correct → re-check → approve → paid path; change-order path; ledger fund/release/refund; unnamed-human approval refused).
2. **Demo server end-to-end** — `node app/server.js`, then curl through the API:
   - set approved sum $12,000 → OK
   - create invoice → `inv-0001`, total 1,240,000¢, status `quoted`
   - `POST /api/check` → `flagged: true, overageCents: 40000` ("exceeds the approved contract sum by $400.00")
   - `POST /api/approve` while flagged → error, approval refused
   - `POST /api/correct` to $12,000 → re-check `flagged: false`
   - `POST /api/approve` (Chris) → status `approved`
   - `POST /api/pay` → status `paid`, escrow `Released`, balances homeowner 8,800,000¢ / crew 1,200,000¢ — the full loop works over HTTP exactly as the UI drives it.
3. **NEAR Intents dry quote — LIVE** — no credentials:
   - Solver-relay JSON-RPC first try: rejected (`unknown parameter "dry"` — dry mode belongs to the 1Click API, noted in `intents/quote.js`).
   - `POST https://1click.chaindefuser.com/v0/quote` with `dry: true` → signed quote: **1.0 NEAR → 3.622149 USDT** (amountInUsd $3.64, time estimate 20s), `dry: true` echoed, no deposit address issued.
   - Again through the app (`GET /api/quote?amountNear=1`) → 3.627418 USDT (live rate moved between calls, as expected). **No funds moved at any point.**
   - Testnet RPC reachability also confirmed (`POST https://rpc.testnet.near.org` status → testnet chain id, protocol 88).
4. **Contract build** — `cd contract && npm run build` → **success**: `build/paid-in-full.wasm`, **539,586 bytes**. Verified by loading the module in Node: exports are `init, create_invoice, approve_and_fund, release, cancel, get_invoice, invoice_ids` — all 7 methods present.

## Blockers and workarounds (honest)

- **B1 — near-sdk-js install in this VM.** `npm install` failed twice in the SDK's postinstall: its `tar xvf` exits non-zero here because tar cannot preserve the archives' file ownership (`Cannot change ownership to uid 1001: Operation not permitted`) — the sandbox forbids chown. Workaround applied: `npm install --ignore-scripts`, then the postinstall's three downloads (ailisp/binaryen v0.1.16, near/quickjs v0.1.3 `qjsc` + source, wasi-sdk 11) fetched with curl into `node_modules/near-sdk-js/lib/cli/deps/` using `tar --no-same-owner`. After that, the build ran clean. On a normal dev machine the stock postinstall should work.
- **B2 — sandbox integration test cannot execute in this VM.** `node contract/tests-sandbox/run.mjs` downloads and starts the NEAR sandbox node, which aborts: `couldn't set the file descriptor limit to (65535, 65535), current limit = (4096, 4096) — Operation not permitted`. `ulimit -n` cannot be raised (hard limit 4096). The test itself is complete and expected to run on any normal machine; in this VM the contract is verified by compilation + Wasm export inspection + the 1:1 ledger simulation tests instead.
- **B3 — @types/node pin.** The SDK bundles TypeScript 4.7.4, which cannot parse the current `@types/node` (syntax errors in `ffi.d.ts`). Fixed by pinning `@types/node@18.19.0` as a devDependency in `contract/package.json`. After the pin, the only remaining type error was a missing `initialize` import in the contract source — fixed in the source.
- **B4 — live testnet deploy not performed in this run.** Deploying needs a testnet account + signing keys. No account was created in this run (and none in Chris's name, ever); the near-cli-rs installer needs cargo, which this VM lacks. `contract/scripts/deploy-testnet.sh` performs the deploy in one command for anyone with a team-created `.testnet` account and near-cli, and refuses non-testnet accounts. Deploying the compiled Wasm to a team testnet account and recording the transaction is the first item of the next build pass.

## Simulated vs deployed — the short version

- Running today: clerk, app, UI, unit tests, live Intents dry quotes.
- Compiled but not deployed: the escrow contract Wasm (deploy path scripted, blocked only on a team testnet account + CLI, B4).
- Simulated: escrow value movement inside the demo (ledger), all balances.
- Mainnet: **nothing.** No mainnet account, deploy, or transaction exists or was attempted.

## Fallback decision point (thesis track)

Per the plan, if the contract work is clearly slipping by **end of day Nov 11**, the fallback is to pivot the same shell to the `thesis` track (NEAR onchain-analytics dashboard). **Status at this build (Nov 8): not triggered and not close** — the contract compiled on day one and the full demo loop runs. The decision point stays on the calendar for the Nov 11 check-in regardless; the only risk that could revive it is B4 dragging (deploy/hosting), which affects polish, not the entry's core.

## Left for the next build pass

1. Deploy `paid-in-full.wasm` to a team-created **testnet** account via `contract/scripts/deploy-testnet.sh`; record the account + tx in this log; run `contract/tests-sandbox/run.mjs` on a machine without the fd-limit restriction (or point the app at the deployed contract).
2. Optionally wire the app to the deployed testnet contract (read-only views first: `get_invoice`, `invoice_ids`) behind a mode flag; local simulation stays the default.
3. Record the demo video per `demo/demo-script.md`; capture the 7 screenshots.
4. Make the repository public (human step) and fill `[PUBLIC REPO URL]`.
5. Chris's steps (his alone): create the mainnet NEAR payout account, publish the X post, confirm the payload, send the submission — all before **Nov 14, 5:59 PM CST**. Keep any hosted demo up through Nov 25 per Q-012 guidance.

## Nov 8 evening — v2 fix pass (addendum)

- **B4 CLOSED:** the contract deployed to testnet — first to `paid-in-full.testnet` (tx `ARxLv79u…`, superseded), then to a FRESH account `paid-in-full-v2.testnet` (tx `CLzB1jES9NcS43DMPd9TYTrQfi8T55DeXosfg3nKYCoH`, code hash `9iHW5xy1…`, Wasm 541,471 B). Full record: `DEPLOY.md`.
- **Approval-gate fix:** `contract.ts` records the client at creation; `client_approve` (client-only) sets the approved-sum cap; `approve_and_fund` requires approval + recorded client + exact amount at/under cap. Proven on-chain with two accounts plus stranger denials; cap proven (0.0124 NEAR invoice, 0.01 NEAR cap, funding rejected).
- **Sandbox test:** `contract/tests-sandbox/run.mjs` needed a one-line near-workspaces v4 fix (`crew.balance()`); ran and passed on the build server (exit 0). Still cannot run on the restricted VM (fd limit).
- **`POST /api/contract-sum` removed** — no global sum endpoint; the sum is per-invoice at creation, raisable only via signed change order. Demo reads live on-chain state via `app/onchain.js` (read-only RPC).
- **Video v4** (104.1 s, 1920x1080): live on-chain tail in beat 6, closing narration re-recorded, outro points at the v2 account. Narration pronunciation fixes applied by rewording, NOT verified by ear — the re-review listens.
- **Submission payload draft** updated to describe the gate (approval + cap), not the old "funding is the approval" wording. Placeholders (lead name, email, payout address, repo URL, X post URL) still Chris's alone.
