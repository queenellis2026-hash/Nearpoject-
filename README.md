# Paid in Full — a contractor invoice-to-payment desk on NEAR

Built at **NEAR HACKATHON** ("Build Beyond Boundaries"), November 2026.
Tracks: **realworld** (primary), **business**, **agents**.
All code in this repository was written starting **November 8, 2026**, inside the hackathon's eligible window (code since the October 19, 2026 announcement counts).

## What it does

A small contractor finishes a job and sends an invoice. Two things go wrong in real life:

1. The invoice quietly grows past the price the customer approved — an extra here, a "while we were at it" there — and the argument happens after the work is done.
2. Payment itself is slow and trust-based: the customer holds the money until they feel like paying; the crew carries the risk.

**Paid in Full** is a desk that fixes the order of operations:

- An **agent clerk** prepares the invoice from the job's line items and change orders.
- The clerk **checks the invoice total against the approved contract sum** and **flags any overage** — before a dollar moves.
- A flagged invoice **cannot be approved or paid** until a human resolves the overage (correct the invoice, or sign a change order that raises the approved sum).
- A **human approval** is required before the payment state can change. The clerk cannot approve its own invoice.
- Payment runs through a **NEAR testnet escrow contract**: the client's approval *is* the funding call (exact deposit), and the funds release to the contractor only on the client's release.
- A **NEAR Intents dry quote** (`dry: true` — no funds move) shows what the payment would settle to in USDT if it were paid cross-chain.

## Try it — do X, see Y

You need Node.js 18+. No wallet, no account, no install step for the demo (zero dependencies).

1. **Do:** `npm test`
   **See:** 9 passing tests covering the clerk's flag, the human-approval gate, corrections, change orders, and the escrow fund/release/refund paths.
2. **Do:** `./run-demo.sh` and open http://localhost:3737
   **See:** the desk, pre-filled with the demo job: a bathroom remodel, approved contract sum **$12,000**.
3. **Do:** click **"Clerk: prepare invoice"**, then **"Clerk: check against approved sum"**.
   **See:** an invoice totaling **$12,400** (it includes a $3,100 shower-drain reroute that was never in the contract) and a red **FLAGGED** banner: *exceeds the approved contract sum by $400.00*.
4. **Do:** try **"Human: approve for payment"** while it is flagged.
   **See:** refusal — a flagged invoice cannot be approved.
5. **Do:** leave the corrected total at $12,000 and click **"Human: correct invoice to this total"**, then **"Human: approve for payment"**.
   **See:** the clerk re-checks (OK, within the approved sum), the invoice moves to **approved**.
6. **Do:** click **"Release payment from escrow"**.
   **See:** the invoice becomes **paid**, the escrow shows **Released**, and the crew's (simulated) balance is $12,000. The full event history — created, flagged, corrected, approved, paid — is printed under the result.
7. **Do (optional, needs network):** click **"Get dry quote"**.
   **See:** a live NEAR Intents 1Click quote (`dry: true`) for settling NEAR → USDT. Or run `npm run quote -- 2.5` in a terminal.

The API the page uses is documented by the endpoints in `app/server.js` (`/api/invoices`, `/api/check`, `/api/correct`, `/api/approve`, `/api/pay`, `/api/quote`).

## How NEAR is used (named, concretely)

| NEAR technology | Where | What it does here |
|---|---|---|
| **NEAR smart contract (testnet design)** | `contract/src/contract.ts`, compiled to `contract/build/paid-in-full.wasm` | Escrows one invoice amount per invoice. `approve_and_fund` takes a deposit exactly equal to the invoice amount — the deposit *is* the approval — and `release` pays the contractor; `cancel` refunds the client. Only the funding client can release or cancel. |
| **near-sdk-js 2.0.0** | `contract/` | The contract SDK. `cd contract && npm run build` reproduces the Wasm. |
| **NEAR Intents (1Click API)** | `intents/quote.js` | Dry quotes only: `dry: true` returns a signed settlement quote (verified live: 1 NEAR → 3.622149 USDT, Nov 8, 2026) with no deposit address issued and no funds moved. No JWT/partner registration used (Q-006: it only lowers the fee). |
| **NEAR testnet** | `contract/scripts/deploy-testnet.sh` | The deploy path for the contract. Testnet-only projects are eligible in all tracks (Q-010); no mandatory integration applies (Q-011). |

## What is real, what is simulated — honestly

| Piece | Status |
|---|---|
| Agent clerk logic (prepare, check, flag, human gate) | **Real and running** — `app/clerk.js`, covered by tests, exercised by the demo UI. |
| Demo app + UI | **Real and running** — zero-dependency Node server, `app/server.js`. |
| Escrow flow in the demo | **Local simulation** — `app/ledger.js` mirrors the contract's states and rules 1:1 (Created → Funded → Released/Cancelled, exact-amount funding, client-only release) so judges can run it with no wallet or faucet. |
| The NEAR contract itself | **Real code, deployed and proven on testnet** — TypeScript source compiles to a 539,586-byte Wasm exporting all 7 methods, deployed to `paid-in-full.testnet` (tx `FFLd5A7dud5FmghMLCAfZuBvFZwPrQyPrbrg88ShgyXf`, code hash `5CzGbR7KbWsjqarxYaSKHBSgTwz4rZxNDP9KHBpz6ayC`); the full escrow loop was proven on chain (create_invoice → approve_and_fund → release). See `DEPLOY.md`. |
| NEAR Intents | **Real, live, dry-only** — quotes are fetched from the production 1Click API with `dry: true`. No deposit address is ever requested; no funds can move. |
| Money | **No real money anywhere.** No mainnet account, no mainnet deploy, no real transaction of any kind. Simulated balances are test numbers in a local process. |

## Repository map

```
app/clerk.js            the agent clerk: totals, approved-sum check, FLAG, human gate
app/ledger.js           local escrow simulation mirroring the contract
app/server.js           zero-dependency demo server + JSON API
app/public/index.html   the desk UI (purple = agent acts, blue = human acts)
contract/src/contract.ts  the NEAR testnet escrow contract (near-sdk-js)
contract/scripts/       testnet deploy script (refuses non-testnet accounts)
contract/tests-sandbox/ sandbox integration test for the compiled Wasm
intents/quote.js        NEAR Intents dry-quote client (+ CLI: npm run quote)
tests/                  unit tests: npm test
demo/demo-script.md     60–90s demo video script, storyboard, screenshot list
submission/             X post draft + submission payload draft (human sends both)
BUILDLOG.md             what was built, what ran, what is blocked, with evidence
```

## Build the contract yourself

```sh
cd contract
npm install        # near-sdk-js; its postinstall downloads its build toolchain
npm run build      # -> build/paid-in-full.wasm
```

Note: in restricted sandboxes the near-sdk-js postinstall can fail when `tar` cannot preserve file ownership; installing with `npm install --ignore-scripts` and fetching the three toolchain archives (binaryen, QuickJS, wasi-sdk) into `node_modules/near-sdk-js/lib/cli/deps/` by hand works around it — that is what our build machine needed; see `BUILDLOG.md`.

## Disclosure — third-party and AI tools

- **Libraries/services:** near-sdk-js 2.0.0 (contract), NEAR Intents 1Click public API (dry quotes), Node.js built-ins only for the app (no npm dependencies). No templates or boilerplate projects were used; the estimate logic echoes the team's own pre-hackathon contractor calculator (a spreadsheet product, disclosed as baseline per the rules — no code was copied from it; the desk is new code written for this event).
- **AI:** This project was designed and written by **Rowan, an AI agent**, working under the direction of the team's human lead, Chris Babcock, who reviews, approves the submission, and performs every step the rules reserve for a human (creating the payout account, publishing the demo post, confirming the submission payload). AI assistance is disclosed here rather than hidden, as the event's own rulebook expects.

## License

MIT — see `LICENSE`.
