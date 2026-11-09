#!/usr/bin/env python3
"""Paid in Full — demo video driver, v5 PART 2 (browser).

Section-5 refresh + outro. Runs AFTER the live terminal calls land:
the desk is loaded fresh, the live on-chain panel is clicked, and the
table must now show inv-3007 RELEASED alongside inv-3001..inv-3006.
Then the outro card (v3 contract, repo URL, live release tx).

The caller polls /api/onchain until inv-3007 appears BEFORE starting
this recorder, so the panel answers from the warm cache on click.
"""
import json
import time
from playwright.sync_api import sync_playwright

DEMO = "/home/hatch/workspace/500-goal/paid-in-full/paid-in-full/demo"
VIDEO_DIR = DEMO + "/raw-take-v5-part2"
DESK_URL = "http://localhost:3737/"
OUTRO_URL = "file://" + DEMO + "/cards/outro.html"

D_OUTRO = 8.280   # seg7b narration
OUTRO_HOLD = 9.5  # outro card screen time (narration + breathing room)

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

        page.goto(DESK_URL)
        page.wait_for_selector("h1")
        time.sleep(0.4)
        mark("desk_load")

        # 150% zoom, same as part 1 (CSS fallback as before).
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

        # Section 5 refresh — the live table must now include inv-3007.
        smooth_click(page, "button:has-text('Show live on-chain invoices')")
        mark("onchain_click")
        try:
            page.wait_for_function(
                "() => document.getElementById('onchainOut').textContent.includes('inv-3007')",
                timeout=15000)
            mark("onchain_rendered")
        except Exception as e:
            print("refreshed on-chain panel did not show inv-3007:", e, flush=True)
            mark("onchain_failed")
        page.evaluate("document.getElementById('onchainOut').scrollIntoView({behavior:'smooth', block:'center'})")
        time.sleep(0.6)
        page.screenshot(path=DEMO + "/shot-9-onchain-refresh.png")
        mark("shot_9")
        wait_until(8.0)
        mark("refresh_hold_end")

        # ---- Outro card ----
        page.goto(OUTRO_URL)
        page.wait_for_selector("h1")
        mark("outro_load")
        wait_until(time.monotonic() - t0 + OUTRO_HOLD)
        mark("outro_end")

        ctx.close()
        browser.close()

    with open(DEMO + "/timeline-v5-part2.json", "w") as f:
        json.dump(events, f, indent=2)
    print("TIMELINE:", json.dumps(events), flush=True)


if __name__ == "__main__":
    main()
