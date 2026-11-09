#!/usr/bin/env python3
"""Paid in Full — demo video driver, v5 PART 1 (browser).

Intro card (typewriter) -> desk flow (sections 1-5 sim + on-chain tail +
invoice-amount Intents quote) -> section-6 wallet UI film.
Recorded by Playwright, headed Chromium under Xvfb, 1920x1080.

v5 changes vs v4 (Nov 9, 2026):
- seg2b re-recorded with the script wording (11.712 s, was 9.192 s).
- seg7a re-recorded: "in-tent-s on near" (15.072 s, was 9.408 s) — the
  v4 line rendered "near-intense" in Whisper small; the new line
  transcribes "intents" in both Whisper base and small.
- Quote beat clicks "Get dry quote for this invoice" (the invoice-amount
  quote, ~3,333 NEAR for the $12,000 invoice), NOT the 1-NEAR example.
- NEW tail: after the quote hold, scroll to section 6 and film the wallet
  UI (Connect testnet wallet, the five live action buttons, the
  small-testnet-amount label); fill the live invoice id with the id the
  terminal take will create (inv-3007). The terminal take (separate
  x11grab recording) and part 2 (section-5 refresh + outro) are assembled
  after this part; narration seg8 starts at the wallet_film event.
- Outro card updated to the v3 contract (paid-in-full-v3.testnet).

Part 1 ends on the section-6 UI; it does NOT go to the outro (part 2
does that, after the live calls land on-chain).
"""
import json
import time
import sys
from playwright.sync_api import sync_playwright

DEMO = "/home/hatch/workspace/500-goal/paid-in-full/paid-in-full/demo"
VIDEO_DIR = DEMO + "/raw-take-v5-part1"
DESK_URL = "http://localhost:3737/"
INTRO_URL = "file://" + DEMO + "/cards/intro.html"

LIVE_INVOICE_ID = "inv-3007"

# Narration durations (seconds), measured from the audio files.
# seg4 and seg7a include a hold beyond the narration:
#   seg4: narration 8.928 + 1.5 hold = 10.428 (refusal breathing room)
#   seg7a: narration 15.072 + 2.0 hold = 17.072 (quote viewing time)
# seg6 (v4): 23.448 s. The on-chain sentence starts ~16.4 s in, so the
# on-chain click lands at +16.5 s.
D = {
    "seg0": 7.128,   # intro card line ("This is Paid in Full...")
    "seg1": 10.752,  # desk, $12,000
    "seg2b": 11.712,  # prepare invoice (script wording)
    "seg3": 11.208,  # flag
    "seg4": 10.428,  # refusal (8.928 narration + 1.5 hold)
    "seg5": 11.208,  # correct + re-check + approve
    "seg6": 23.448,  # fund + release + live on-chain state
    "seg7a": 17.072,  # invoice-amount dry quote (15.072 narration + 2.0 hold)
}
# Desk-clip segment boundaries (seconds after the desk page loads)
B = {
    "seg1": 0.0,
    "seg2b": D["seg1"],
    "seg3": D["seg1"] + D["seg2b"],
    "seg4": D["seg1"] + D["seg2b"] + D["seg3"],
    "seg5": D["seg1"] + D["seg2b"] + D["seg3"] + D["seg4"],
    "seg6": D["seg1"] + D["seg2b"] + D["seg3"] + D["seg4"] + D["seg5"],
    "seg7a": D["seg1"] + D["seg2b"] + D["seg3"] + D["seg4"] + D["seg5"] + D["seg6"],
}
DESK_END = B["seg7a"] + D["seg7a"]
WALLET_HOLD = 12.0  # seconds of section-6 UI film after the quote beat

events = {}
t0 = None


def mark(name):
    events[name] = round(time.monotonic() - t0, 3)
    print(f"[{events[name]:7.3f}s] {name}", flush=True)


def wait_until(t):
    while True:
        rem = t - (time.monotonic() - t0)
        if rem <= 0:
            return
        time.sleep(min(rem, 0.05))


def smooth_click(page, selector, scroll=True):
    loc = page.locator(selector).first
    loc.wait_for(state="visible", timeout=10000)
    if scroll:
        page.evaluate("(el) => el.scrollIntoView({behavior:'smooth', block:'center'})",
                      loc.element_handle())
        time.sleep(0.7)
    box = loc.bounding_box()
    if box is None:
        raise RuntimeError(f"no bounding box for {selector}")
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy, steps=25)
    time.sleep(0.2)
    page.mouse.click(cx, cy)


def smooth_move_to(page, selector):
    loc = page.locator(selector).first
    loc.wait_for(state="visible", timeout=10000)
    box = loc.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy, steps=25)
    time.sleep(0.3)


def main():
    global t0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, executable_path="/home/hatch/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome", args=[
            "--no-sandbox", "--disable-dev-shm-usage",
            "--window-size=1920,1080", "--window-position=0,0",
            "--hide-scrollbars",
        ])
        ctx = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            record_video_dir=VIDEO_DIR,
            record_video_size={"width": 1920, "height": 1080},
        )
        page = ctx.new_page()
        t0 = time.monotonic()
        mark("record_start")

        # ---- Intro card (typewriter) ----
        page.goto(INTRO_URL)
        page.wait_for_selector("#title")
        mark("intro_load")
        wait_until(D["seg0"])
        mark("intro_end")

        # ---- Desk ----
        page.goto(DESK_URL)
        page.wait_for_selector("h1")
        time.sleep(0.4)
        mark("desk_load")
        t_desk = time.monotonic() - t0

        # 150% zoom: three Ctrl+= presses (100 -> 110 -> 125 -> 150).
        # Verify via element size; fall back to CSS zoom 1.5.
        h1 = page.locator("h1").first
        h_before = h1.bounding_box()["height"]
        for _ in range(3):
            page.keyboard.press("Control+Equal")
            time.sleep(0.4)
        h_after = h1.bounding_box()["height"]
        if h_after < h_before * 1.4:
            page.evaluate("document.body.style.zoom = 1.5")
            time.sleep(0.3)
            print("zoom: fell back to CSS zoom 1.5", flush=True)
        else:
            print(f"zoom: browser zoom applied ({h_before:.1f} -> {h_after:.1f})", flush=True)

        def at(seg):
            return t_desk + B[seg]

        # seg1 — desk open, set the approved sum
        wait_until(at("seg1") + 0.6)
        smooth_click(page, "button:has-text('Set approved sum')", scroll=False)
        mark("set_sum")
        wait_until(at("seg1") + 2.5)
        page.screenshot(path=DEMO + "/shot-1-desk.png")
        mark("shot_1")

        # seg2b — clerk prepares the invoice
        wait_until(at("seg2b"))
        smooth_click(page, "button:has-text('Clerk: prepare invoice')")
        mark("prepare_invoice")
        wait_until(at("seg2b") + 1.8)
        page.screenshot(path=DEMO + "/shot-2-invoice.png")
        mark("shot_2")
        # hover the $3,100 drain-reroute line (4th table row: header + 3 items)
        try:
            smooth_move_to(page, "#invoiceOut table tr:nth-child(4)")
        except Exception as e:
            print("drain-row hover failed (non-fatal):", e, flush=True)

        # seg3 — clerk checks against the approved sum
        wait_until(at("seg3"))
        smooth_click(page, "button:has-text('Clerk: check against approved sum')")
        mark("check")
        wait_until(at("seg3") + 1.8)
        page.screenshot(path=DEMO + "/shot-3-flag.png")
        mark("shot_3")

        # seg4 — human tries to approve the flagged invoice (refusal).
        wait_until(at("seg4"))
        smooth_click(page, "button:has-text('Human: approve for payment')")
        mark("approve_refused")
        wait_until(at("seg4") + 1.8)
        page.screenshot(path=DEMO + "/shot-4-refusal.png")
        mark("shot_4")

        # seg5 — human corrects the invoice, clerk RE-CHECKS as its own
        # visible action, then the human approves.
        wait_until(at("seg5"))
        smooth_click(page, "button:has-text('Human: correct invoice to this total')")
        mark("correct")
        wait_until(at("seg5") + 3.5)
        smooth_click(page, "button:has-text('Clerk: check against approved sum')")
        mark("recheck")
        wait_until(at("seg5") + 7.0)
        smooth_click(page, "button:has-text('Human: approve for payment')")
        mark("approve_ok")
        wait_until(at("seg5") + 9.0)
        page.screenshot(path=DEMO + "/shot-5-approved.png")
        mark("shot_5")

        # seg6 — fund the escrow, show the Funded state, then release.
        wait_until(at("seg6"))
        smooth_click(page, "button:has-text('Fund escrow')")
        mark("fund")
        page.evaluate("document.getElementById('fundOut').scrollIntoView({behavior:'smooth', block:'start'})")
        time.sleep(0.8)
        wait_until(at("seg6") + 3.5)
        page.screenshot(path=DEMO + "/shot-6-funded.png")
        mark("shot_6_funded")
        wait_until(at("seg6") + 6.5)
        smooth_click(page, "button:has-text('Release payment from escrow')")
        mark("pay")
        # scroll the PAID result + history into view for the shot and the video
        page.evaluate("document.getElementById('payOut').scrollIntoView({behavior:'smooth', block:'start'})")
        time.sleep(0.8)
        wait_until(at("seg6") + 9.5)
        page.screenshot(path=DEMO + "/shot-6-paid.png")
        mark("shot_6")

        # seg6, on-chain tail — the narration's on-chain sentence starts
        # ~16.4 s in, so click "Show live on-chain invoices" at +16.5 s.
        # This reads the REAL deployed contract's live invoice state from
        # the testnet RPC (section 5, /api/onchain) — not a mock.
        wait_until(at("seg6") + 16.5)
        smooth_click(page, "button:has-text('Show live on-chain invoices')")
        mark("onchain_click")
        try:
            page.wait_for_function(
                "() => document.getElementById('onchainOut').textContent.includes('inv-3001')",
                timeout=15000)
            mark("onchain_rendered")
        except Exception as e:
            print("on-chain panel did not render live:", e, flush=True)
            mark("onchain_failed")
        page.evaluate("document.getElementById('onchainOut').scrollIntoView({behavior:'smooth', block:'center'})")
        time.sleep(0.6)
        wait_until(at("seg6") + 20.0)
        page.screenshot(path=DEMO + "/shot-6-onchain.png")
        mark("shot_6_onchain")

        # seg7a — live NEAR Intents dry quote FOR THIS INVOICE (v5: the
        # invoice-amount quote, ~3,333 NEAR for the $12,000 invoice — NOT
        # the 1-NEAR example button).
        wait_until(at("seg7a"))
        smooth_click(page, "button:has-text('Get dry quote for this invoice')")
        mark("quote_click")
        try:
            page.wait_for_function(
                "() => document.getElementById('quoteOut').textContent.includes('invoice-amount')",
                timeout=15000)
            mark("quote_rendered")
        except Exception as e:
            print("invoice quote did not render live:", e, flush=True)
            mark("quote_failed")
        page.evaluate("document.getElementById('quoteOut').scrollIntoView({behavior:'smooth', block:'center'})")
        time.sleep(0.6)
        wait_until(at("seg7a") + 4.5)
        page.screenshot(path=DEMO + "/shot-7-quote.png")
        mark("shot_7")

        # ---- Section 6 wallet UI film (NEW in v5) ----
        # Narration seg8 starts here. No wallet sign-in happens on camera
        # (none is available): the desk's wallet section is shown, the
        # live invoice id is filled in, and the signed calls run in the
        # terminal take that follows this part.
        wait_until(t_desk + DESK_END)
        mark("desk_end")
        page.evaluate("document.querySelector('section:nth-of-type(6)').scrollIntoView({behavior:'smooth', block:'start'})")
        time.sleep(0.8)
        mark("wallet_film")
        # The app auto-suggests the next live invoice id (wallet.js
        # suggestNextInvoiceId) — it is already inv-3007 here. Click the
        # field to show it; do NOT type (typing would double it).
        smooth_click(page, "#liveInvoiceId", scroll=False)
        live_id = page.locator("#liveInvoiceId").input_value()
        print(f"wallet live invoice id (app-suggested): {live_id}", flush=True)
        if live_id != LIVE_INVOICE_ID:
            raise RuntimeError(f"live invoice id is {live_id!r}, expected {LIVE_INVOICE_ID!r}")
        mark("wallet_id_filled")
        time.sleep(0.5)
        page.screenshot(path=DEMO + "/shot-8-wallet.png")
        mark("shot_8")
        # scroll the five live action buttons into view
        page.evaluate("document.getElementById('liveCreate').scrollIntoView({behavior:'smooth', block:'center'})")
        time.sleep(0.8)
        try:
            smooth_move_to(page, "#liveRelease")
        except Exception as e:
            print("wallet button hover failed (non-fatal):", e, flush=True)
        page.screenshot(path=DEMO + "/shot-8b-wallet-buttons.png")
        mark("shot_8b")
        wait_until(t_desk + DESK_END + WALLET_HOLD)
        mark("part1_end")

        ctx.close()
        browser.close()

    with open(DEMO + "/timeline-v5-part1.json", "w") as f:
        json.dump(events, f, indent=2)
    print("TIMELINE:", json.dumps(events), flush=True)


if __name__ == "__main__":
    main()
