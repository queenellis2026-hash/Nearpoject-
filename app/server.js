// server.js — Paid in Full demo server. Zero dependencies (node:http).
// Run:  node app/server.js        then open http://localhost:3737
//
// Mode: LOCAL SIMULATION of the testnet escrow (app/ledger.js), plus a
// live NEAR Intents DRY quote (intents/quote.js) when the network is up,
// plus LIVE READ-ONLY views of the deployed contract (app/onchain.js,
// GET /api/onchain) — the demo's payment is simulated, but the on-chain
// invoice state it shows is the real deployed contract's, read live from
// the testnet RPC. The on-chain contract source is in contract/src/contract.ts.
//
// THE GATE, mirrored from the contract: funding requires the recorded
// client's approval. The human approval step (/api/approve) IS the
// client's approval — it approves the invoice in the clerk AND marks the
// escrow approved in the ledger, exactly as client_approve does on-chain.
// /api/fund then asserts that approval before moving money into escrow,
// and /api/release is a separate step so the Funded state is visible.

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const clerk = require('./clerk');
const { EscrowLedger } = require('./ledger');
const { dryQuote } = require('../intents/quote');
const { fetchOnchainInvoicesCached, startOnchainRefresh } = require('./onchain');

// The deployed contract account (fresh v2 deployment — see DEPLOY.md).
// Override with CONTRACT_ACCOUNT=... to point the on-chain panel at a
// different deployment.
const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'paid-in-full-v2.testnet';

// Warm the live on-chain cache in the background (see app/onchain.js) so
// the panel answers instantly on click.
startOnchainRefresh(CONTRACT_ACCOUNT);

const PORT = process.env.PORT || 3737;
const ledger = new EscrowLedger();
const invoices = new Map(); // id -> invoice

// NOTE: there is deliberately NO /api/contract-sum endpoint and no global
// approved sum. The approved contract sum is set per invoice, at creation,
// by the human client (see clerk.createInvoice) — a global "set the
// ceiling" route let any caller raise it to anything, which made "the
// clerk may never pay past it" false even inside the app. The sum can
// only rise through a signed change order on that invoice.

// Simulated test funds for the local demo (testnet faucet equivalent).
ledger.mint('homeowner', 100000_00);
ledger.mint('gulf-coast-crew', 0);

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const routes = {
  'POST /api/invoices': async (req, res) => {
    const body = await readBody(req);
    const inv = clerk.createInvoice(body);
    invoices.set(inv.id, inv);
    ledger.createEscrow(inv.id, inv.contractor, inv.totalCents, inv.client);
    json(res, 201, inv);
  },

  'GET /api/invoices': async (req, res) => {
    json(res, 200, [...invoices.values()]);
  },

  // Agent clerk check: compare against the invoice's own approved sum.
  'POST /api/check': async (req, res) => {
    const { invoiceId } = await readBody(req);
    const inv = mustGet(invoiceId);
    const check = clerk.checkAgainstApproved(inv);
    json(res, 200, { invoice: inv, check });
  },

  // Human corrects a flagged invoice downward.
  'POST /api/correct': async (req, res) => {
    const { invoiceId, correctedTotalCents, correctedBy, note } = await readBody(req);
    const inv = mustGet(invoiceId);
    clerk.correctInvoiceTotal(inv, correctedTotalCents, correctedBy, note);
    syncEscrowAmount(inv);
    const check = clerk.checkAgainstApproved(inv);
    json(res, 200, { invoice: inv, check });
  },

  // Human approves a change order for a SPECIFIC invoice. The change order
  // is recorded on that invoice (with the approver and a history entry),
  // and the invoice's approved sum rises by the change order amount so the
  // clerk's re-check can pass. Requires an invoice id and a named human.
  'POST /api/change-order': async (req, res) => {
    const { invoiceId, changeOrder, approvedBy } = await readBody(req);
    if (!invoiceId) throw new Error('a change order needs an invoiceId');
    if (!approvedBy) throw new Error('a change order needs a human approver (approvedBy)');
    if (!changeOrder || typeof changeOrder.amountCents === 'undefined') {
      throw new Error('a change order needs an amountCents');
    }
    const inv = mustGet(invoiceId);
    clerk.approveChangeOrder(inv, changeOrder, approvedBy);
    const check = clerk.checkAgainstApproved(inv);
    json(res, 200, {
      invoice: inv,
      check,
      approvedContractSumCents: inv.approvedSumCents,
      note: `change order approved by ${approvedBy} for ${invoiceId}`,
    });
  },

  // THE HUMAN GATE: only a human approval moves quoted -> approved. This
  // is also the client's on-chain approval, mirrored: the ledger escrow
  // is marked approved here, WITH the invoice's approved sum as the cap —
  // and /api/fund asserts both the approval and the cap before moving
  // money. The demo app passes the $12,000 approved sum as the cap, so
  // the on-chain rule "no dollar moves past the approved sum" holds here.
  'POST /api/approve': async (req, res) => {
    const { invoiceId, approvedBy } = await readBody(req);
    const inv = mustGet(invoiceId);
    clerk.humanApprove(inv, { approvedBy });
    ledger.approve(inv.id, inv.client, inv.approvedSumCents);
    json(res, 200, inv);
  },

  // Payment, step 1: fund the escrow. Requires the human/client approval
  // (asserted in the ledger, mirroring contract client_approve +
  // approve_and_fund). The invoice stays payable and the escrow is now
  // visibly Funded — the release is a separate step.
  'POST /api/fund': async (req, res) => {
    const { invoiceId } = await readBody(req);
    const inv = mustGet(invoiceId);
    clerk.assertPayable(inv); // throws unless human-approved and unflagged
    ledger.fund(inv.id, inv.client);
    json(res, 200, {
      invoice: inv,
      escrow: ledger.escrowOf(inv.id),
      balances: { homeowner: ledger.balanceOf('homeowner'), crew: ledger.balanceOf('gulf-coast-crew') },
    });
  },

  // Payment, step 2: release the funded escrow to the contractor.
  'POST /api/release': async (req, res) => {
    const { invoiceId } = await readBody(req);
    const inv = mustGet(invoiceId);
    clerk.assertPayable(inv); // throws unless human-approved and unflagged
    ledger.release(inv.id, inv.client);
    clerk.markPaid(inv, `escrow released to ${inv.contractor} (local simulation of testnet contract)`);
    json(res, 200, {
      invoice: inv,
      escrow: ledger.escrowOf(inv.id),
      balances: { homeowner: ledger.balanceOf('homeowner'), crew: ledger.balanceOf('gulf-coast-crew') },
    });
  },

  // Live NEAR Intents DRY quote (no funds move).
  'GET /api/quote': async (req, res, url) => {
    const amountNear = url.searchParams.get('amountNear') || '1';
    try {
      const q = await dryQuote({ amountNear });
      json(res, 200, q);
    } catch (e) {
      json(res, 502, { error: `dry quote unavailable: ${e.message}`, dry: true });
    }
  },

  // Live on-chain state, read-only (testnet RPC views of the deployed
  // contract — no keys, no signing, no writes). This is the REAL contract's
  // live invoice state, not a mock: the proof invoices (inv-2001 Released,
  // inv-2002/inv-2003 Created over the cap) are on paid-in-full-v2.testnet.
  // The server refreshes it from the RPC every 60 s in the background
  // (app/onchain.js) so the panel answers instantly on click. If the RPC
  // is unreachable the UI shows the error, not a fake panel.
  'GET /api/onchain': async (req, res) => {
    try {
      const data = await fetchOnchainInvoicesCached(CONTRACT_ACCOUNT);
      json(res, 200, data);
    } catch (e) {
      json(res, 502, { error: `on-chain state unavailable: ${e.message}`, contract: CONTRACT_ACCOUNT });
    }
  },
};

function syncEscrowAmount(inv) {
  const e = ledger.escrowOf(inv.id);
  if (e && e.status === 'Created') e.amountCents = inv.totalCents;
}

function mustGet(id) {
  const inv = invoices.get(id);
  if (!inv) throw new Error(`no invoice ${id}`);
  return inv;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const key = `${req.method} ${url.pathname}`;
  if (routes[key]) {
    try { await routes[key](req, res, url); }
    catch (e) { json(res, 400, { error: e.message }); }
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }
  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`Paid in Full demo: http://localhost:${PORT}`);
  console.log('Mode: local escrow simulation + live NEAR Intents dry quotes.');
});
