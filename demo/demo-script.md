# Demo video script — "Paid in Full" (60–90 seconds)

One complete moment, no intro slide: **invoice raised → agent flags the overage → human corrects and approves → escrow releases → the real contract's live state on-chain.**
Record at 1080p, browser zoom 150%, mouse slow. Narration can be AI voiceover (disclose it in the post if used) or the human's own voice.

## Storyboard

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:07 | Intro card (typewriter): **"Paid in Full"**. | "This is Paid in Full. An agent clerk checks every invoice before a dollar moves." |
| 0:07–0:18 | Desk open. Click **"Set approved sum"** — the confirmed state appears: *Approved contract sum confirmed: $12,000.00*. | "A homeowner and a small crew agreed a price for this bathroom remodel: twelve thousand dollars. Then the final invoice arrived — for more." |
| 0:18–0:27 | Click **"Clerk: prepare invoice"**. Invoice appears: three line items, total **$12,400**. Zoom the $3,100 line: *"Extra: reroute shower drain (not in contract)."* | "Our agent clerk prepares the invoice from the job's line items. Twelve thousand four hundred — including a thirty-one-hundred-dollar drain reroute that was never in the contract." |
| 0:27–0:38 | Click **"Clerk: check against approved sum"**. Red **FLAGGED** banner: *exceeds the approved contract sum by $400.00*. | "Before a dollar moves, the clerk checks the invoice against the approved contract sum — and flags it. Four hundred dollars over. This invoice cannot be paid." |
| 0:38–0:49 | Click **"Human: approve for payment"** — refusal message appears. | "Not even by clicking approve. A flagged invoice is locked until a human resolves the overage — on paper, first." |
| 0:49–1:00 | Corrected total field ($12,000) → click **"Human: correct invoice to this total"**. Then click **"Clerk: check against approved sum"** again — the re-check is its own visible action and turns green: *within the approved contract sum*. Click **"Human: approve for payment"** → status **APPROVED**. | "The drain job gets re-quoted separately, the invoice is corrected to the agreed twelve thousand, the clerk re-checks — clean — and now the human approves." |
| 1:00–1:24 | Click **"Fund escrow"** — escrow **Funded**. Click **"Release payment from escrow"**. Status flips to **PAID**, escrow **Released**, crew balance $12,000, event history printed. Then click **"Show live on-chain invoices"** — the real deployed contract's live invoice state renders from the testnet RPC (inv-3001 Released, inv-3002 Funded, inv-3003 Cancelled). | "The approved invoice is funded into escrow — and now the client releases it. Payment releases from the locally simulated escrow on near, and the crew is paid in full, exactly the approved amount. No more, no less. And the same escrow lives on near testnet — here are the real invoices on-chain, with their approval and cap." |
| 1:27–1:45 | Scroll to the Intents panel, click **"Get dry quote for this invoice"**; the live NEAR → USDT quote for the full $12,000 invoice renders and stays on screen for a full 4–5 seconds. | "And with in-tent-s on near, the desk can quote cross-chain settlement live — here, a dry quote for the full twelve-thousand-dollar invoice, priced from the live one-near rate. No funds moved." |
| 1:45–1:56 | Scroll to section 6, the wallet UI: **"Connect testnet wallet"**, the five live action buttons, the 0.01 NEAR label; the live invoice id field already suggests **inv-3007**. | "The desk also has a wallet section — connect a testnet wallet, and those same five calls run for real, on a small testnet amount. There is no wallet sign-in on camera here, so the same signed calls run from the terminal instead, with the team's testnet key." |
| 1:56–3:27 | Terminal (xterm, green on black): `near view` invoice list (inv-3001…inv-3006), then the four signed calls on a fresh invoice **inv-3007** (0.01 NEAR) — `create_invoice` → `client_approve` (cap 0.01) → `approve_and_fund` (exactly 0.01) → `release` — each printing its transaction hash; then a follow-up terminal clip: `get_invoice` reads **Released**, and the live indexer lists all four hashes with their method names. | "A fresh invoice, inv-3007, for one hundredth of a near. The client approves it, with the cap set to the amount. Then the client funds it — exactly one hundredth of a near, no more — and releases it to the crew. Each call returns its transaction hash, on testnet, for anyone to check. And the invoice reads Released — approved, then funded, then paid, for exactly the amount." |
| 3:27–3:36 | Back on the desk, click **"Show live on-chain invoices"** again — the table now has a seventh row: **inv-3007 RELEASED**. | *(seg8 tail / silence while the table is read)* |
| 3:36–3:47 | End frame: repo URL + "Built at NEAR Hackathon" + v3 contract + deploy tx + live release tx. | "This is Paid in Full: the agent prepares and checks. The human decides. The blockchain provides the foundation. Built at NEAR Hackathon." |

Runtime: v5 is **≈227 seconds** (v4 was 104 s). The extra ~123 s is the
live wallet section: the terminal calls run in real time (near-cli +
testnet finality) and the narration names the no-wallet-sign-in constraint
plainly. If a future cut runs long, trim the terminal holds, not the flag,
the refusal, the on-chain view, or the release — those are the product.
Narration as recorded: seg0 opens "This is Paid in Full."; "NEAR" is spelled
"near" (lowercase) in the seg6/seg7a/seg8 recording texts so the TTS pronounces it
"neer", not "NIR". seg7a's render text says "in-tent-s on near" — the plain
"near Intents" rendered as "near-intense" in Whisper small, and the
reworded line transcribes "intents" in both Whisper base and small (verified
from the final mix). seg7b opens "This is Paid in Full — …" so "Paid" sits off
the onset (v3's closing rendered as "tayden full"). The cold-open line is
seg0, in the storyboard above — narration and script now match. One
exception (F9): the 1:56–3:27 narration in the table above now reads
"approved, then funded, then paid" — the shipped v5 audio says
"approved, funded, and paid". The states are sequential, not
simultaneous; the audio is approved as-is and was not re-recorded.
Exact TTS render texts per segment: `demo/audio/render-texts-v5.md`.

## Screenshots to capture (for the X post if video is trimmed, and for the repo)

1. `shot-1-desk.png` — the desk with the approved contract sum set ($12,000).
2. `shot-2-invoice.png` — the prepared invoice, total $12,400, drain-reroute line visible.
3. `shot-3-flag.png` — the red FLAGGED banner with the $400.00 overage verdict.
4. `shot-4-refusal.png` — the approval refusal on the flagged invoice.
5. `shot-5-approved.png` — corrected invoice, green re-check, status APPROVED with the approver's name.
6. `shot-6-funded.png` — escrow Funded, $12,000 held in escrow.
7. `shot-6-paid.png` — PAID status, escrow Released, crew balance, and the full event history.
8. `shot-6-onchain.png` — the live on-chain invoice table from the testnet RPC (inv-3001 Released, inv-3002 Funded, inv-3003 Cancelled).
9. `shot-7-quote.png` — the live NEAR Intents dry quote JSON.

## Recording checklist

- Run `./run-demo.sh` fresh so the demo job starts clean (tests pass first — that output is fine to flash on screen for two seconds).
- Do the whole take in one pass through the UI; do not edit the flag or refusal beats.
- Keep the "local simulation" wording visible in shot 6 — the demo is honest about what is simulated; the contract source and Wasm are in the repo.
- Record at 150% browser zoom so the app fills the frame; the outro card states the simulation plainly ("Escrow payment demonstrated using a local simulation. No funds moved.").
