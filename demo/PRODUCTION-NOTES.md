# Demo video — production notes (Nov 8, 2026)

## v5 — current deliverable (Nov 9, 2026, ~01:50–02:10 UTC)
- **Video:** `paid-in-full-demo.mp4` — H.264, 1920×1080, 25 fps, AAC, **226.84 s (3:46.8)**, 20,282,312 bytes, md5 `d5ad7c2c2a21bb0cb38f1d9479d64053`. v4 preserved as `paid-in-full-demo-v4.mp4` (104.1 s, md5 `65db94038eb54179613132fc4f7537ec`).
- **Audio:** integrated **−16.64 LUFS**, true peak **−1.10 dBTP**, LRA 4.90 (two-pass loudnorm; pass-1 measurement: input −26.68 LUFS, input TP −5.95, LRA 7.60, target offset 1.16). Audio present from 0:00 (first-second max amplitude 0.87, RMS 0.14). Full decode clean (`ffmpeg -i … -f null -`, no errors).
- **What changed from v4:** (1) NEW section 6 wallet write path, filmed live: the desk's wallet UI (Connect testnet wallet, five live action buttons, 0.01 NEAR label, invoice id auto-suggested as inv-3007), then the same four signed calls run WITH NEAR-CLI ON CAMERA in an xterm (no wallet sign-in was available, and none was faked): `create_invoice` → `client_approve` (cap 0.01) → `approve_and_fund` (exactly 0.01) → `release` on a fresh invoice inv-3007 (client paid-in-full-v3.testnet, contractor crew.paid-in-full-v3.testnet, 0.01 NEAR). (2) A supplementary terminal clip shows the final `get_invoice` (Released, approved true, cap = amount) and the four transaction hashes with method names, read live from the NearBlocks testnet indexer. (3) Section 5 re-filmed afterwards: the live table now has a seventh row, inv-3007 RELEASED. (4) Intents beat now clicks "Get dry quote for this invoice" (invoice-amount quote: $12,000 ≈ 3364.04 NEAR at the live rate, dry: true, basis "invoice-amount") instead of the 1-NEAR example button. (5) seg7a re-rendered: the phonetic fix for "near-intense" → "Intents" (see below). (6) seg2b re-rendered script-aligned (drain reroute line). (7) NEW seg8 narration (47.352 s, wallet section). (8) Outro card updated to the v3 contract (deploy tx `8e3kfhWMRHqijsMDMb2BgS8n5tkvmi1gNXJci2XyPKMx`), repo URL on one line (no wrap, `white-space: nowrap`), the sim line reworded ("Sections 1–4 are a local simulation. Section 6 moves real testnet funds (0.01 NEAR)."), and a live-wallet-proof line with the release tx hash. (9) Runtime grew from 104 s to 227 s — the extra ~123 s is the live wallet section running in real time; nothing else was trimmed.
- **Live-call transaction hashes (inv-3007, NearBlocks testnet v3 API; all four visible on camera):**
  - create_invoice: `6RoWB8HvYckUhSqWRs9bsjJfesoBGD1yHUjpw62svZQB`
  - client_approve: `HQhDTCBJ7YhpdwWAy3YAF21cShLFoLS8EnXx4WbZFgg5`
  - approve_and_fund: `8rbaoLcSGw3o11NFGkeGHY8p6kheQQ3WwBSytYP19GZ7`
  - release: `GrMKpW5e7uoZtXq4dZv8GywKQbMzJKhqAFNwuQ5nGXaM`
  - On-chain final state (RPC-verified): inv-3007 Released, approved true, cap 0.01 NEAR = amount 0.01 NEAR. Earlier on-chain state unchanged: inv-3001 Released, inv-3002 Funded, inv-3003 Cancelled, inv-3004 Released, inv-3005 Cancelled, inv-3006 Created. Three failed receipts from the aborted first terminal take exist (approve/fund/release against a not-yet-created inv-3007) — gas only, no state change.
- **Intents fix — VERIFIED from the final mix (faster-whisper, base + small, Nov 9):** the final file's seg7a region (86.769–101.841 s) transcribes as "And with intents on near, the desk can quote cross-chain settlement live. Here, a dry quote for the full $12,000 invoice, priced from the live one near rate. No funds moved." in BOTH models. The fix was word order, not spelling: "near in-tents", "in tents", "intentz", "in-tentz", and speed 90 all still rendered "near-intense"; the line as recorded ("And with in-tent-s on near, …") transcribes "intents" in both models across three identical takes and in the final mix. Cold open (final file, Whisper small): "This is Paid in Full and Agent Clerk checks every invoice before a dollar moves." — "Paid" clean, no "Tade". seg8 region (final file, small): "The desk also has a wallet section. Connect a Testnet wallet and those same five calls run for real on a small Testnet amount. There is no wallet sign in on camera here so the same signed calls run from the terminal instead with the team's Testnet key. A fresh invoice, INV-3007 for one hundredth of a near." — clean.
- **"drain rerout" listen-check:** Whisper base still hears "rerout" and small hears "reroute" in seg2b, in the v4 audio AND in two fresh v5 renders — a Whisper-base artifact, not a TTS defect. Not a blocker; the on-screen text carries the word.
- **Release-hang + supplementary clip:** the main terminal take's release call was submitted on camera, but near-cli hung awaiting the outcome printout past the end of the take (the transaction itself landed). The take was trimmed at 60 s (last frame with new content; the fund tx id sits at the bottom edge, partially cut — the supplementary clip carries the clean hash list). The supplementary clip (`term-take2.sh`, 30.56 s) was filmed afterwards with the same xterm setup: `get_invoice` → Released, then the indexer listing. No call was re-run; inv-3007 was already Released.
- **Em-dash lesson:** xdotool CANNOT type U+2014 — it errors mid-string and corrupts the shell state. The first terminal attempt failed this way (no state changed). All typed text in `term-take.sh`/`term-take2.sh` is ASCII-only; the on-chain job string is "Weekley bathroom remodel - live testnet invoice" (hyphen), while the desk UI shows an em dash — a trivial mismatch, noted, not fixed.
- **Wallet-id doubling lesson:** `wallet.js` line 405 auto-suggests the next live invoice id into the empty field; typing inv-3007 again produced "inv-3007inv-3007" in the first part-1 take. Fixed in `record-v5.py`: read the field, assert it equals inv-3007, do NOT type.
- **v4 end-card discrepancy:** the task states v4 "ends on a black frame with no end card". That does NOT match the v4 file on disk — frames at 98 s, 101 s, 103 s, and 103.9 s all show the full outro card (tagline, repo URL on one line, BUILT AT NEAR HACKATHON, v2 contract lines). The end card WAS present in v4; v5 still improves it (v3 contract, no-wrap repo URL, release tx, longer hold). The final frame of v5 (225 s) shows the outro card in full — the video does not end on black.
- **Beats verified present and in order by frame extraction from the final file** (frames in `demo/v5-verify/`, `f<N>.png` = second N): 0:03 intro | 0:12 approved sum | 0:22 invoice $12,400 | 0:32 FLAGGED +$400 | 0:43 refusal verbatim ("cannot approve: invoice is FLAGGED (FLAGGED: invoice exceeds the approved contract sum by $400.00). Resolve the overage and re-check first.") | 0:56 corrected $12,000 + re-check | 1:06 FUNDED | 1:11 PAID + history | 1:23 on-chain table inv-3001..3006 | 1:30 invoice-amount dry quote ($12,000 ≈ 3364.04 NEAR, dry: true) | 1:46 wallet UI (five buttons, inv-3007 pre-filled) | 2:17 terminal create call | 2:30 terminal approve hash | 2:53 terminal fund hash (bottom edge) | 3:17 supplementary clip (Released view + all four hashes) | 3:32 refresh table with inv-3007 RELEASED | 3:40 outro (repo URL one line, v3 contract, release tx) | 3:45 final frame still outro card.
- **Narration placement (ms, final):** seg0=0, seg1=8013, seg2b=18765, seg3=30477, seg4=41685, seg5=52113, seg6=63321, seg7a=86769, seg8=104652, seg7b=215466. Segment durations: seg0 7.128, seg1 10.752, seg2b 11.712, seg3 11.208, seg4 8.928, seg5 11.208, seg6 23.448, seg7a 15.072, seg7b 8.280, seg8 47.352. Exact render texts: `demo/audio/render-texts-v5.md` (new — v4 had no such record, which is why script and audio diverged).
- **Drivers:** `record-v5.py` + `timeline-v5-part1.json` (part 1, 116.72 s), `term-take.sh inv-3007` + `term-take-inv-3007.log` (terminal, trimmed to 60 s), `term-take2.sh inv-3007` + `term-take2-inv-3007.log` (supplementary, 30.56 s), `record-v5-part2.py` + `timeline-v5-part2.json` (part 2, 19.56 s), `assemble-v5.sh` (transcode → concat → adelay+amix → loudnorm two-pass). Assembly intermediates: `v5-p1.mp4`, `v5-term.mp4`, `v5-term2.mp4`, `v5-p2.mp4`, `v5-raw.mp4`, `v5-mix.mp4`, `v5-loudnorm-pass1.log`, `v5-loudnorm-measured.json`.
- **What was NOT touched:** contract, app logic, submission draft. Nothing submitted to DoraHacks. The only file changed outside `demo/` scope is `demo-script.md` (storyboard rows for the quote, wallet, terminal, refresh, and outro beats) and `demo/cards/outro.html` (v3 contract + release tx). Old seg7a/seg2b audio preserved in `demo/audio/v4-backup/`.

## v4 — current deliverable (Nov 8, 2026, ~22:40 CST — Rowan review follow-up)
- **Video:** `paid-in-full-demo.mp4` — H.264, 1920×1080, 25 fps, AAC, **104.1 s**, 9.96 MB, md5 `65db94038eb54179613132fc4f7537ec`. v3 preserved as `paid-in-full-demo-v3.mp4` (8.9 MB, md5 `add3e3fc4fba99a29a69c3b468f840e0`).
- **Audio:** integrated **−16.74 LUFS**, true peak **−1.12 dBTP**, LRA 4.90, no clipping (two-pass loudnorm; pass-1 measurement: input −27.47 LUFS, input TP −7.46, LRA 7.20, target offset 1.43).
- **What changed from v3:** (1) beat 6 has a live on-chain tail — after the PAID banner the desk clicks "Show live on-chain invoices" and the REAL deployed contract's live invoice table renders from the testnet RPC (inv-2001 RELEASED, inv-2002/inv-2003 CREATED over the cap); seg6 narration re-recorded with the on-chain line (23.448 s, was 16.392 s). (2) seg7b re-recorded opening "This is Paid in Full — …" so "Paid" sits off the onset (v3's closing rendered as "tayden full"). (3) Outro card + UI explorer links point at the FRESH contract account `paid-in-full-v2.testnet` (deploy tx `CLzB1jES9NcS43DMPd9TYTrQfi8T55DeXosfg3nKYCoH`), not the v1 account. (4) demo-script.md now carries the seg0 cold-open line in the storyboard (narration and script match).
- **On-chain panel latency fix:** the first v4 take rendered the panel 14 s after the click (4 serial RPC calls at ~4 s each from this VM), landing it in the quote beat. Fixed by parallelising the `get_invoice` calls AND caching the live state server-side (refreshed from the RPC every 60 s in the background, `app/onchain.js`) — the panel now answers in ~0.01 s on click. The data is still the real on-chain state, read live from the RPC; the cache is a 60 s freshness window, not a mock.
- **Beats verified present and in order by frame extraction from the final file** (frames in `demo/v4-verify/`): 0:03 intro | 0:12 approved sum confirmed $12,000 (green box) | 0:22 invoice $12,400 | 0:32 red FLAGGED +$400 | 0:43 refusal ("cannot approve: invoice is FLAGGED… Resolve the overage and re-check first.") | 0:56 corrected $12,000 + re-check OK | 0:64 FUNDED banner | 0:70 PAID banner + readable event history | 0:81 live on-chain invoice table (inv-2001 RELEASED, inv-2002/inv-2003 CREATED, caps 0.0100 NEAR vs amounts 0.0124 NEAR) | 0:88 dry quote JSON (1 NEAR → 3.517572 USDT, dry: true) | 0:98 outro with the new tagline + "Smart contract deployed on NEAR testnet: paid-in-full-v2.testnet" + "Escrow payment demonstrated using a local simulation. No funds moved." + explorer URL + deploy tx.
- **Repo verified public** (GitHub API, Nov 8): `queenellis2026-hash/Nearpoject-`, `private: false`, https://github.com/queenellis2026-hash/Nearpoject- — the outro's repo URL is correct and live.
- **Aural verification gap (unchanged from v3):** the "Tade"→"Paid", "NIR"→"near", and "tayden full" fixes were applied by rewording/respelling, but no local speech-to-text model exists on this VM, so the pronunciation was NOT aurally verified by the producer. The re-review (Grok + ChatGPT) listens and confirms.
- Raw take: `demo/raw-take-v4/page@f15e9846b01dbf37e374055be8449441.webm` (26.4 MB). Narration placement (ms): seg0=0, seg1=7800, seg2b=18552, seg3=27744, seg4=38952, seg5=49380, seg6=60588, seg7a=84036, seg7b=95701; trimmed to 104 s; mix via ffmpeg adelay+amix (libx264 crf 18 preset medium) → `v4-mix.mp4`, then loudnorm pass 2 → final.

## Deliverables
- **Video:** `paid-in-full-demo.mp4` — H.264, 1920×1080, 25 fps, AAC, **88.48 s**, 4.2 MB.
- **Screenshots:** `shot-1-desk.png` … `shot-7-quote.png` (all 1920×1080), for the X post and the repo.
- **Narration audio:** `audio/seg0.mp3`, `seg1.mp3`, `seg2b.mp3`, `seg3.mp3`, `seg4.mp3`,
  `seg5.mp3`, `seg6.mp3`, `seg7a.mp3`, `seg7b.mp3` — Ellis's designed voice
  (`avocado_v2:vd2_r8_rep1k_0307_v068_28k_g5k`, "Contented Barrel"); no substitution.
  AI voiceover is disclosed in the submission/X post (see `submission/x-post-draft.md`).
- **Driver + timeline:** `record.py`, `timeline.json` (logged event times used for the audio sync).
- **Cards:** `cards/intro.html` (typewriter) and `cards/outro.html` (repo URL + Built at NEAR Hackathon).

## How it was made
- One continuous Playwright take (headed Chromium under Xvfb, 1920×1080, 110% zoom
  via CSS zoom fallback — the Ctrl+= browser zoom did not take, verified by element size),
  slow mouse, in one pass through the UI. No edits to the flag or refusal beats.
- Demo server run fresh (`./run-demo.sh` — all 9 tests pass first), then the flow:
  set sum $12,000 → prepare invoice $12,400 → clerk flags +$400.00 → approve refused →
  correct to $12,000 → re-check OK → approve → release from escrow → live Intents dry quote.
- The Intents quote is a REAL live dry quote from the NEAR Intents 1Click API
  (dry: true, no funds moved; in this take 1 NEAR → 3.621252 USDT).
- Audio starts at 0:00 (intro line over the title card). Narration placed at the logged
  action times; the 0:08–0:22 narration was trimmed per the script (seg2b) and the
  closing line plays over the outro card, keeping the runtime at ~88 s.
- The "local simulation" wording is visible in shot 6 and in the video
  ("(simulated test funds)", "local simulation of testnet contract") — the demo is
  honest about what is simulated; the contract source and Wasm are in the repo.

## Timing (final video)
| Time | Beat |
|---|---|
| 0:00–0:06 | Intro card (typewriter: "Paid in Full") |
| 0:06–0:17 | Desk open, approved sum $12,000 |
| 0:18–0:27 | Invoice prepared: $12,400, drain reroute $3,100 |
| 0:27–0:39 | Red FLAGGED banner: +$400.00 over |
| 0:39–0:48 | Approval refused on the flagged invoice |
| 0:48–0:59 | Corrected to $12,000, re-check OK, APPROVED by Chris (homeowner's rep) |
| 0:59–1:12 | PAID, escrow Released, crew balance $12,000, event history |
| 1:12–1:19 | Live NEAR Intents dry quote JSON |
| 1:19–1:28 | Outro: repo URL + "Built at NEAR Hackathon" + paid-in-full.testnet |

## Notes / deviations
- Runtime 88.5 s (target ~85 s; the extra ~3.5 s is the intro line + outro line breathing room).
  The flag and refusal beats were NOT trimmed.
- The demo server (`node app/server.js` on localhost:3737) is still running from the
  recording session; stop it when done reviewing. Nothing was pushed to GitHub and
  nothing was submitted — production only.

## Review loop — round 2 (Grok + ChatGPT, Nov 8, ~2:53 PM CST) — VIDEO v3
- Grok + ChatGPT reviewed v2. Both agreed the core claim ("a flagged invoice cannot be
  approved or paid") was true only inside the demo app, not on-chain — fixed in the
  contract/app (client_approve + approved-sum cap, redeployed; see DEPLOY.md).
  Video fixes applied in v3 (this file is now v3; v2 preserved as
  paid-in-full-demo-v2.mp4, v1 as paid-in-full-demo-v1-quiet.mp4):
  - Narration re-recorded (Ellis's voice, same TTS): seg0 now "This is Paid in Full.
    An agent clerk checks every invoice before a dollar moves." — the old seg0 rendered
    "Paid" as "Tade" (the TTS cached the exact same bytes for the identical text, so the
    line was reworded to move "Paid" off the onset and force a fresh render). seg6/seg7a/
    seg7b re-recorded with "near" lowercase — the all-caps "NEAR" rendered as "NIR".
    seg6 is now fund + release as two steps ("Payment releases from the locally simulated
    escrow on near"); seg7b uses the new tagline ("The agent prepares and checks. The
    human decides. The blockchain provides the foundation.").
  - 150% browser zoom (CSS zoom 1.5 fallback — the Ctrl+= browser zoom still does not
    take in this headed Chromium; verified by element size). The app now fills the frame
    (v2 was ~830px of 1920px).
  - Beat 4 (refusal) +1.5 s breathing room; beat 7a (dry quote) +2 s hold — the quote
    JSON stays on screen ~7–9 s after rendering.
  - Beat 5: correction and re-check are two separate visible clicks.
  - Beat 6: fund and release are separate buttons/steps; the Funded state is visible.
  - Beat 1: the approved sum is a prominent green confirmation box
    ("Approved contract sum confirmed: $12,000.00").
  - Outro reworded: "Smart contract deployed on NEAR testnet — paid-in-full.testnet —
    Escrow payment demonstrated using a local simulation. No funds moved." + explorer URL
    + deploy tx. The demo UI also links the contract account + deploy tx (section 4).
- v3 verified (Nov 8, ~21:50): H.264, 1920×1080, 25 fps, AAC, **98.0 s**, 8.9 MB,
  md5 add3e3fc4fba99a29a69c3b468f840e0. All 7 beats present and in order by frame
  extraction (0:03 intro, 0:12 confirmed sum, 0:22 invoice $12,400, 0:32 FLAGGED +$400,
  0:43 refusal, 0:56 corrected $12,000 + re-check OK, 0:66 FUNDED, 0:71 PAID + event
  history, 0:82 dry quote 1 NEAR → 3.571159 USDT, 0:93 outro). Audio: integrated
  **−16.7 LUFS**, true peak **−1.29 dBTP**, max −1.3 dB, no clipping (two-pass loudnorm).
  Runtime 98 s (was 88.5 s) — the extra ~9.5 s is the two-step fund/release, the
  beat-4 hold, and the quote hold.
- v3 timing: 0:00–0:07 intro | 0:08–0:19 desk + confirmed sum | 0:19–0:28 invoice
  $12,400 | 0:28–0:39 FLAGGED +$400 | 0:39–0:50 refusal | 0:50–1:01 correct + re-check
  + approve | 1:01–1:17 fund → release → PAID | 1:17–1:29 dry quote | 1:29–1:38 outro.
- Raw take: demo/raw-take-v3/page@5a500a0f9ec17c8a881a57f5542ae83b.webm (21.6 MB).
  NOTE: /tmp is a tmpfs that gets wiped — the first v3 good take (and the v2 raw video
  and the Playwright venv) were lost to a /tmp wipe on Nov 8 ~21:36; the take was
  re-recorded and the raw video now lives in the workspace (record.py VIDEO_DIR points
  there). Do not put irreplaceable intermediates in /tmp.
- Aural verification gap: the "Tade"→"Paid" and "NIR"→"near" fixes were applied by
  rewording/respelling, but no local speech-to-text model exists on this VM (no whisper
  model, faster-whisper not installed), so the pronunciation was NOT aurally verified
  by the producer. The re-review (Grok + ChatGPT) listens and confirms.
- First v3 take failed and was discarded: record.py passed scroll=False for the
  prepare/check clicks, so the mouse missed the below-the-fold buttons and the flow
  never created an invoice ("no invoice null" at correct/approve/fund). Fixed by
  scrolling every desk button into view before clicking; also fixed the drain-row hover
  selector (tr:nth-child(4), not 3).

## Review loop — round 1 (self-review, Nov 8, ~2:47 PM CST)
- Independent frame-by-frame check of all 7 beats (frames extracted at 0:02, 0:10, 0:20, 0:32, 0:43, 0:53, 1:05, 1:15, 1:24): every beat is present, legible, and correct. Intro card clean; FLAGGED banner and refusal box clear; PAID + event history + "local simulation" wording visible; live Intents dry quote JSON rendered (1 NEAR → 3.621252 USDT, dry: true, no funds moved); outro has repo URL + "Built at NEAR Hackathon" + paid-in-full.testnet.
- Audio (v1): mean −27.5 dB, max −7.2 dB, loudness range 5.1 LU, no clipping, no dead air (longest pause 1.44 s at a beat transition — natural). FINDING: the mix was quiet for a demo video (integrated −27.2 LUFS vs the −16 LUFS web-video standard) — a phone viewer would have to turn it up.
- FIX APPLIED (v2, now the deliverable): two-pass loudnorm to −16 LUFS, true peak −1.5 dBTP. Verified: mean −16.7 dB, max −1.4 dB, integrated −16.5 LUFS, true peak −1.37 dBTP, loudness range 4.2 LU, no clipping. Video stream copied bit-for-bit (frame at 0:32 byte-identical to v1). Runtime unchanged at 88.5 s. v1 preserved as paid-in-full-demo-v1-quiet.mp4.
- NOT CHANGED: all 7 beats intact; flag and refusal beats untouched; "local simulation" wording intact; voiceover unchanged (Ellis's voice); no contract or app changes; nothing pushed or submitted.
- STILL OWED (browser-only, not done by the review subagent — see review-package/): Grok + ChatGPT reviews via grok.com / chatgpt.com. The review package is ready in review-package/ for the parent agent to run in the browser.
