# TTS render texts — v5 (verbatim input to the TTS, Ellis's voice)

Voice (all segments): `avocado_v2:vd2_r8_rep1k_0307_v068_28k_g5k`
("Contented Barrel"). Command: `/opt/hatch/bin/tts speak --voice
"avocado_v2:vd2_r8_rep1k_0307_v068_28k_g5k" --output audio/segN.mp3
--text-stdin`.

This file exists because v4's script and its recorded audio diverged — the
script was aspirational, the audio was what actually shipped. The rule for
v5 onward: the render text IS the script line. If a line changes, change
both files in the same commit.

## Segment durations (final, ffprobe)

| seg | duration | placement in v5 (s) | notes |
|-----|----------|---------------------|-------|
| seg0 | 7.128 | 0.000 | cold open |
| seg1 | 10.752 | 8.013 | |
| seg2b | 11.712 | 18.765 | re-rendered v5, script-aligned |
| seg3 | 11.208 | 30.477 | |
| seg4 | 8.928 | 41.685 | +1.5 s hold in timeline |
| seg5 | 11.208 | 52.113 | |
| seg6 | 23.448 | 63.321 | |
| seg7a | 15.072 | 86.769 | re-rendered v5, phonetic "in-tent-s" |
| seg7b | 8.280 | 215.466 | outro |
| seg8 | 47.352 | 104.652 | NEW in v5 — wallet section |

## Render texts (verbatim)

**seg0** (7.128 s):
> This is Paid in Full. An agent clerk checks every invoice before a dollar moves.

**seg1** (10.752 s):
> A homeowner and a small crew agreed a price for this bathroom remodel, $12,000. Then the final invoice arrived for more.

**seg2b** (11.712 s) — v5 re-render, script-aligned:
> Our agent clerk prepares the invoice from the job's line items. Twelve thousand four hundred — including a thirty-one-hundred-dollar drain reroute that was never in the contract.

**seg3** (11.208 s):
> Before a dollar moves, the clerk checks the invoice against the approved contract sum and flags it. $400 over. This invoice cannot be paid.

**seg4** (8.928 s):
> Not even by clicking approve. A flagged invoice is locked until a human resolves the overage. On paper, first.

**seg5** (11.208 s):
> The drain job gets re-quoted separately, the invoice is corrected to the agreed 12,000, the clerk re-checks, clean, and now the human approves.

**seg6** (23.448 s):
> The approved invoice is funded into escrow and the client releases it. Payment releases from the locally simulated escrow on near and the crew is paid in full, exactly the approved amount. No more, no less. And the same escrow lives on near testnet. Here are the real invoices on chain with their approval and cap.

**seg7a** (15.072 s) — v5 re-render; the phonetic spelling is load-bearing:
> And with in-tent-s on near, the desk can quote cross-chain settlement live — here, a dry quote for the full twelve-thousand-dollar invoice, priced from the live one-near rate. No funds moved.

Do NOT "fix" the spelling to "Intents": the plain word rendered as
"near-intense" in Whisper small (and base, on the first v5 attempt). The
reworded line "in-tent-s on near" transcribes as "intents" in both Whisper
base and small, in the raw segment and in the final mix (verified Nov 9).
Also tried and failed: "near in-tents", "in tents", "intentz", "in-tentz",
speed 90.

**seg7b** (8.280 s):
> This is Paid in Full — the agent prepares and checks. The human decides. The blockchain provides the foundation. Built at NEAR Hackathon.

**seg8** (47.352 s) — NEW in v5:
> The desk also has a wallet section — connect a testnet wallet, and those same five calls run for real, on a small testnet amount. There is no wallet sign-in on camera here, so the same signed calls run from the terminal instead, with the team's testnet key. A fresh invoice, inv-3007, for one hundredth of a near. The client approves it, with the cap set to the amount. Then the client funds it — exactly one hundredth of a near, no more — and releases it to the crew. Each call returns its transaction hash, on testnet, for anyone to check. And the invoice reads Released — approved, funded, and paid, for exactly the amount.

## Known transcription artifacts (not TTS defects)

- Whisper base hears "rerout" where Whisper small hears "reroute" in seg2b,
  in both the v4 audio and fresh v5 renders. Model artifact; the small model
  and the on-screen text carry the word. Not a blocker.
- Whisper base drops "signed" → "sign" and "one hundredth" → "100th" in
  seg8; small hears both correctly. Normal STT compression, not a defect.
