# Demo video script — "Paid in Full" (60–90 seconds)

One complete moment, no intro slide: **invoice raised → agent flags the overage → human corrects and approves → escrow releases.**
Record at 1080p, browser zoom ~110%, mouse slow. Narration can be AI voiceover (disclose it in the post if used) or the human's own voice.

## Storyboard

| Time | Screen | Narration |
|---|---|---|
| 0:00–0:08 | Desk open. Approved contract sum field shows **$12,000**. | "A homeowner and a small crew agreed a price for this bathroom remodel: twelve thousand dollars. Then the final invoice arrived — for more." |
| 0:08–0:22 | Click **"Clerk: prepare invoice"**. Invoice appears: three line items, total **$12,400**. Zoom the $3,100 line: *"Extra: reroute shower drain (not in contract)."* | "Our agent clerk prepares the invoice from the job's line items. Twelve thousand four hundred — including a thirty-one-hundred-dollar drain reroute that was never in the contract." |
| 0:22–0:34 | Click **"Clerk: check against approved sum"**. Red **FLAGGED** banner: *exceeds the approved contract sum by $400.00*. | "Before a dollar moves, the clerk checks the invoice against the approved contract sum — and flags it. Four hundred dollars over. This invoice cannot be paid." |
| 0:34–0:44 | Click **"Human: approve for payment"** — refusal message appears. | "Not even by clicking approve. A flagged invoice is locked until a human resolves the overage — on paper, first." |
| 0:44–0:58 | Corrected total field ($12,000) → click **"Human: correct invoice to this total"**. Clerk re-check turns green: *within the approved contract sum*. Click **"Human: approve for payment"** → status **APPROVED**. | "The drain job gets re-quoted separately, the invoice is corrected to the agreed twelve thousand, the clerk re-checks — clean — and now the human approves." |
| 0:58–1:12 | Click **"Release payment from escrow"**. Status flips to **PAID**, escrow **Released**, crew balance $12,000, event history printed. | "Payment releases from escrow on NEAR — the approval was the funding, and the crew is paid in full, exactly the approved amount. No more, no less." |
| 1:12–1:25 | Scroll to the Intents panel, click **"Get dry quote"**; the live NEAR → USDT quote renders. End frame: repo URL + "Built at NEAR HACKATHON". | "And with NEAR Intents, the desk can quote cross-chain settlement live — shown here as a dry quote, no funds moved. Paid in Full: the agent prepares and checks, the human decides, NEAR settles. Built at NEAR Hackathon." |

Runtime ≈ 85 seconds. If it runs long, trim the 0:08–0:22 narration, not the flag or the refusal — those are the product.

## Screenshots to capture (for the X post if video is trimmed, and for the repo)

1. `shot-1-desk.png` — the desk with the approved contract sum set ($12,000).
2. `shot-2-invoice.png` — the prepared invoice, total $12,400, drain-reroute line visible.
3. `shot-3-flag.png` — the red FLAGGED banner with the $400.00 overage verdict.
4. `shot-4-refusal.png` — the approval refusal on the flagged invoice.
5. `shot-5-approved.png` — corrected invoice, green re-check, status APPROVED with the approver's name.
6. `shot-6-paid.png` — PAID status, escrow Released, crew balance, and the full event history.
7. `shot-7-quote.png` — the live NEAR Intents dry quote JSON.

## Recording checklist

- Run `./run-demo.sh` fresh so the demo job starts clean (tests pass first — that output is fine to flash on screen for two seconds).
- Do the whole take in one pass through the UI; do not edit the flag or refusal beats.
- Keep the "local simulation" wording visible in shot 6 — the demo is honest about what is simulated; the contract source and Wasm are in the repo.
