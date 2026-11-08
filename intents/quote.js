// quote.js — NEAR Intents settlement quote at DRY level only.
//
// Uses the public 1Click API (NEAR Intents) with "dry": true. A dry quote
// returns a signed quote (amounts out, fees, time estimate) WITHOUT
// issuing a deposit address and WITHOUT moving any funds. No API key or
// JWT is required for quotes (HACKATHON.md Q-006: a JWT only lowers the
// fee; we register for nothing).
//
// Verified live on 2026-11-08: 1 NEAR (nep141:wrap.near) -> USDT on NEAR
// returned amountOut 3.622149 USDT for a 1.0 NEAR input, dry: true echoed
// in the response. See BUILDLOG.md.
//
// Integration point: when the team is ready for real settlement (NOT in
// this hackathon build), the same request with "dry": false returns a
// deposit address; the payer sends the origin asset there and Intents
// settles to the recipient. This build never does that.

'use strict';

const ONECLICK_QUOTE_URL = 'https://1click.chaindefuser.com/v0/quote';

// Placeholder-format NEAR address used purely as quote context. A dry
// quote does not send anything to it. Judges: this is not a real account
// controlled by the team; it exists so the API can price the route.
const QUOTE_CONTEXT_ADDRESS = '11111111111111111111111111111111';

async function dryQuote({ amountNear }) {
  const amountYocto = BigInt(Math.round(Number(amountNear) * 1e6)) * 10n ** 18n; // exact-ish NEAR -> yocto
  const deadline = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const body = {
    dry: true,
    swapType: 'EXACT_INPUT',
    originAsset: 'nep141:wrap.near',
    destinationAsset: 'nep141:usdt.tether-token.near',
    amount: amountYocto.toString(),
    slippageTolerance: 100, // 1%
    depositType: 'ORIGIN_CHAIN',
    refundTo: QUOTE_CONTEXT_ADDRESS,
    refundType: 'ORIGIN_CHAIN',
    recipient: QUOTE_CONTEXT_ADDRESS,
    recipientType: 'DESTINATION_CHAIN',
    deadline,
  };
  const res = await fetch(ONECLICK_QUOTE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`1Click quote failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return {
    dry: true,
    amountInNear: data.quote.amountInFormatted,
    amountInUsd: data.quote.amountInUsd,
    amountOutUsdt: data.quote.amountOutFormatted,
    amountOutUsd: data.quote.amountOutUsd,
    timeEstimateSeconds: data.quote.timeEstimate,
    note: 'DRY quote only — no deposit address issued, no funds moved.',
  };
}

module.exports = { dryQuote, ONECLICK_QUOTE_URL };

// Allow `node intents/quote.js 2.5` for a quick manual check.
if (require.main === module) {
  const amt = process.argv[2] || '1';
  dryQuote({ amountNear: amt })
    .then((q) => console.log(JSON.stringify(q, null, 2)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
