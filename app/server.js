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

// The deployed contract account (fresh v3 deployment — see DEPLOY.md).
// Override with CONTRACT_ACCOUNT=... to point the on-chain panel at a
// different deployment.
const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'paid-in-full-v3.testnet';

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
// only rise through a signed change order on that invoice, and only BEFORE
// the client approves it: once approved the sum is frozen (the on-chain
// contract has no change-order function and no re-approve), and only a
// new invoice can change it.

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
  //
  // Atomic, mirroring /api/approve: read-only pre-checks first (so a
  // refusal carries the clerk's instructive message and touches neither
  // layer), then the LEDGER void first, then the clerk mutation inside a
  // try with snapshot rollback. Correcting a merely-approved invoice is
  // allowed — the correction voids that approval (the F1 approve ->
  // correct -> re-approve flow). Correcting a PAID invoice is refused by
  // the pre-check; correcting a FUNDED one is refused by the ledger void,
  // which throws for a Funded escrow before the clerk mutates. Either
  // way a failed correction leaves NO mutation persisted in either layer:
  // before this fix the clerk rewrote the paid invoice as 'quoted' at
  // the lowered total and only then did the ledger void throw.
  'POST /api/correct': async (req, res) => {
    const { invoiceId, correctedTotalCents, correctedBy, note } = await readBody(req);
    const inv = mustGet(invoiceId);
    if (!correctedBy) throw new Error('a correction needs a human (correctedBy)');
    if (inv.status !== 'quoted' && inv.status !== 'approved') {
      throw new Error(`cannot correct an invoice in status "${inv.status}" — the invoice is already ${inv.status}; only a new invoice can change it`);
    }
    const target = Math.round(Number(correctedTotalCents));
    if (!Number.isFinite(target)) throw new Error('a correction needs a numeric correctedTotalCents');
    if (target - inv.totalCents >= 0) throw new Error('a correction must lower the total; use a change order to raise it');
    // Snapshot both layers for rollback, then LEDGER FIRST.
    const snapshot = snapshotInvoice(inv);
    const escrow = ledger.escrowOf(inv.id);
    const escrowApproval = escrow ? { approved: escrow.approved, approvedSumCents: escrow.approvedSumCents } : null;
    ledger.voidApproval(inv.id);
    try {
      clerk.correctInvoiceTotal(inv, correctedTotalCents, correctedBy, note);
      syncEscrowAmount(inv);
      const check = clerk.checkAgainstApproved(inv);
      json(res, 200, { invoice: inv, check });
    } catch (e) {
      restoreInvoice(inv, snapshot);
      if (escrow && escrowApproval) {
        escrow.approved = escrowApproval.approved;
        escrow.approvedSumCents = escrowApproval.approvedSumCents;
      }
      throw e;
    }
  },

  // Human approves a change order for a SPECIFIC invoice, and only BEFORE
  // the invoice is approved. The change order is recorded on that invoice
  // (with the approver and a history entry), and the invoice's approved
  // sum rises by the change order amount so the clerk's re-check can pass.
  // Once the client approves, the approved sum is FROZEN — the on-chain
  // contract has no change-order function and no re-approve — so a change
  // order after approval is rejected (clerk.approveChangeOrder throws)
  // and only a new invoice can change the approved sum. Requires an
  // invoice id and a named human.
  //
  // Atomic, mirroring /api/correct: read-only pre-checks first, then the
  // LEDGER void first, then the clerk mutation inside a try with snapshot
  // rollback. The clerk guard already refuses non-'quoted' invoices
  // (approved, paid) before mutating; the ledger void is the second lock
  // for a Funded/Released escrow, and the snapshot is the third — a
  // failed change order leaves NO mutation persisted in either layer.
  'POST /api/change-order': async (req, res) => {
    const { invoiceId, changeOrder, approvedBy } = await readBody(req);
    if (!invoiceId) throw new Error('a change order needs an invoiceId');
    if (!approvedBy) throw new Error('a change order needs a human approver (approvedBy)');
    if (!changeOrder || typeof changeOrder.amountCents === 'undefined') {
      throw new Error('a change order needs an amountCents');
    }
    const inv = mustGet(invoiceId);
    if (inv.status !== 'quoted') {
      const why = inv.status === 'approved'
        ? 'the invoice is already approved'
        : inv.status === 'paid'
          ? 'the invoice is already paid'
          : `the invoice is in status "${inv.status}"`;
      throw new Error(`cannot approve a change order: ${why} — the approved sum is frozen; only a new invoice can change it`);
    }
    const snapshot = snapshotInvoice(inv);
    const escrow = ledger.escrowOf(inv.id);
    const escrowApproval = escrow ? { approved: escrow.approved, approvedSumCents: escrow.approvedSumCents } : null;
    // A pre-approval change order voids any prior clerk approval (the
    // clerk resets the invoice to quoted); void the ledger approval in
    // the same request so the next approval sets the cap from the NEW
    // approved sum instead of funding against the old one. A change order
    // on an already-approved invoice is rejected by the pre-check above,
    // so this never re-opens a frozen cap.
    ledger.voidApproval(inv.id);
    try {
      clerk.approveChangeOrder(inv, changeOrder, approvedBy);
      const check = clerk.checkAgainstApproved(inv);
      json(res, 200, {
        invoice: inv,
        check,
        approvedContractSumCents: inv.approvedSumCents,
        note: `change order approved by ${approvedBy} for ${invoiceId}`,
      });
    } catch (e) {
      restoreInvoice(inv, snapshot);
      if (escrow && escrowApproval) {
        escrow.approved = escrowApproval.approved;
        escrow.approvedSumCents = escrowApproval.approvedSumCents;
      }
      throw e;
    }
  },

  // THE HUMAN GATE: only a human approval moves quoted -> approved. This
  // is also the client's on-chain approval, mirrored: the ledger escrow
  // is marked approved here, WITH the invoice's approved sum as the cap —
  // and /api/fund asserts both the approval and the cap before moving
  // money. The demo app passes the $12,000 approved sum as the cap, so
  // the on-chain rule "no dollar moves past the approved sum" holds here.
  // The ledger is approved FIRST, and only then the clerk: if the ledger
  // throws (e.g. escrow already approved), the clerk has not mutated
  // yet, so a failed approval leaves no half-approved invoice behind.
  // The mirror case is covered too: if the clerk then throws (no clerk
  // check yet, missing approver), the ledger approval is voided again
  // before the error propagates — either both approve or neither does.
  // Approval FREEZES the cap: a change order cannot raise it afterwards
  // (see /api/change-order) — only a new invoice can change the approved
  // sum once the client has approved.
  'POST /api/approve': async (req, res) => {
    const { invoiceId, approvedBy } = await readBody(req);
    const inv = mustGet(invoiceId);
    // Clerk's read-only pre-checks FIRST, so a refusal carries the clerk's
    // instructive message (flagged / unchecked / wrong status) instead of
    // the ledger's cap error. These checks mutate nothing, so the
    // ledger-first atomicity below is preserved: either both approve or
    // neither does. (F1 follow-up: ledger-first alone surfaced the cap
    // error for a flagged invoice, hiding the FLAGGED refusal the demo shows.)
    if (!approvedBy) throw new Error('human approval is required: pass { approvedBy: "<name>" }');
    if (!inv.clerkCheck) throw new Error('clerk has not checked this invoice yet');
    if (inv.flagged) throw new Error(`cannot approve: invoice is FLAGGED (${inv.clerkCheck.verdict}). Resolve the overage and re-check first.`);
    if (inv.status !== 'quoted') throw new Error(`cannot approve an invoice in status "${inv.status}"`);
    ledger.approve(inv.id, inv.client, inv.approvedSumCents);
    try {
      clerk.humanApprove(inv, { approvedBy });
    } catch (e) {
      ledger.voidApproval(inv.id);
      throw e;
    }
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
  //
  // Honest about the amount: with ?invoiceId=<id> the quote is for the
  // CURRENT INVOICE's amount. The NEAR price is NOT invented — it comes
  // from the live API itself: a 1-NEAR dry quote's amountOutUsd is the
  // implied USD price of 1 NEAR, the invoice amount in NEAR is
  // invoice USD / that rate, and the returned quote is a second live dry
  // quote for that NEAR amount. With ?amountNear=<n> (or no params) the
  // quote is a plain example for that many NEAR — labelled as such, NOT
  // the invoice amount.
  'GET /api/quote': async (req, res, url) => {
    const invoiceId = url.searchParams.get('invoiceId');
    // Unknown invoice id is a client error (400 via the route wrapper),
    // not a quote failure — look it up before the quote try/catch.
    const inv = invoiceId ? mustGet(invoiceId) : null;
    try {
      if (inv) {
        const unit = await dryQuote({ amountNear: 1 });
        const nearUsd = parseFloat(unit.amountOutUsd);
        if (!Number.isFinite(nearUsd) || nearUsd <= 0) {
          throw new Error('live quote returned no usable NEAR price');
        }
        const invoiceUsd = inv.totalCents / 100;
        const invoiceNear = invoiceUsd / nearUsd;
        const q = await dryQuote({ amountNear: invoiceNear });
        json(res, 200, {
          ...q,
          basis: 'invoice-amount',
          invoiceId,
          invoiceTotalUsd: invoiceUsd,
          invoiceAmountNear: invoiceNear,
          note: `DRY quote only — for the current invoice amount ($${invoiceUsd.toFixed(2)} ≈ ${invoiceNear.toFixed(2)} NEAR at the live 1-NEAR dry-quote rate of $${nearUsd.toFixed(4)}/NEAR). No deposit address issued, no funds moved.`,
        });
        return;
      }
      const amountNear = url.searchParams.get('amountNear') || '1';
      const q = await dryQuote({ amountNear });
      json(res, 200, {
        ...q,
        basis: 'example',
        note: `DRY quote only — an example for ${amountNear} NEAR, NOT the invoice amount. No deposit address issued, no funds moved.`,
      });
    } catch (e) {
      json(res, 502, { error: `dry quote unavailable: ${e.message}`, dry: true });
    }
  },

  // Live on-chain state, read-only (testnet RPC views of the deployed
  // contract — no keys, no signing, no writes). This is the REAL contract's
  // live invoice state, not a mock: the proof invoices (inv-3001 Released,
  // inv-3002 Funded, inv-3003 Cancelled) are on paid-in-full-v3.testnet.
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

// Deep snapshot of a clerk invoice for rollback. The invoices Map holds
// the invoice object by reference, so restoring in place (delete every
// key, re-assign the snapshot's) puts the stored invoice back exactly
// as it was — a failed route leaves no clerk mutation persisted.
function snapshotInvoice(inv) {
  return JSON.parse(JSON.stringify(inv));
}

function restoreInvoice(inv, snapshot) {
  for (const k of Object.keys(inv)) delete inv[k];
  Object.assign(inv, snapshot);
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
  // Section 6 live-wallet client module (app/public/wallet.js). Static
  // file only — the wallet library itself loads from the esm.sh CDN at
  // runtime, so the server stays zero-dependency.
  if (req.method === 'GET' && url.pathname === '/wallet.js') {
    const js = fs.readFileSync(path.join(__dirname, 'public', 'wallet.js'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/javascript' });
    res.end(js);
    return;
  }
  json(res, 404, { error: 'not found' });
});

server.listen(PORT, () => {
  console.log(`Paid in Full demo: http://localhost:${PORT}`);
  console.log('Mode: local escrow simulation + live NEAR Intents dry quotes.');
});
