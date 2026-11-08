// server.js — Paid in Full demo server. Zero dependencies (node:http).
// Run:  node app/server.js        then open http://localhost:3737
//
// Mode: LOCAL SIMULATION of the testnet escrow (app/ledger.js), plus a
// live NEAR Intents DRY quote (intents/quote.js) when the network is up.
// The on-chain contract source is in contract/src/contract.ts.

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const clerk = require('./clerk');
const { EscrowLedger } = require('./ledger');
const { dryQuote } = require('../intents/quote');

const PORT = process.env.PORT || 3737;
const ledger = new EscrowLedger();
const invoices = new Map(); // id -> invoice
let approvedContractSumCents = 0; // set per demo via /api/contract-sum

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
  'POST /api/contract-sum': async (req, res) => {
    const { approvedContractSumCents: sum } = await readBody(req);
    approvedContractSumCents = Math.round(Number(sum));
    json(res, 200, { approvedContractSumCents });
  },

  'POST /api/invoices': async (req, res) => {
    const body = await readBody(req);
    const inv = clerk.createInvoice(body);
    invoices.set(inv.id, inv);
    ledger.createEscrow(inv.id, inv.contractor, inv.totalCents);
    json(res, 201, inv);
  },

  'GET /api/invoices': async (req, res) => {
    json(res, 200, [...invoices.values()]);
  },

  // Agent clerk check: compare against the approved contract sum.
  'POST /api/check': async (req, res) => {
    const { invoiceId } = await readBody(req);
    const inv = mustGet(invoiceId);
    const check = clerk.checkAgainstApproved(inv, approvedContractSumCents);
    json(res, 200, { invoice: inv, check });
  },

  // Human corrects a flagged invoice downward.
  'POST /api/correct': async (req, res) => {
    const { invoiceId, correctedTotalCents, correctedBy, note } = await readBody(req);
    const inv = mustGet(invoiceId);
    clerk.correctInvoiceTotal(inv, correctedTotalCents, correctedBy, note);
    syncEscrowAmount(inv);
    const check = clerk.checkAgainstApproved(inv, approvedContractSumCents);
    json(res, 200, { invoice: inv, check });
  },

  // Human approves a change order, raising the approved contract sum.
  'POST /api/change-order': async (req, res) => {
    const { changeOrder, approvedBy } = await readBody(req);
    approvedContractSumCents += Math.round(Number(changeOrder.amountCents) || 0);
    json(res, 200, { approvedContractSumCents, note: `change order approved by ${approvedBy}` });
  },

  // THE HUMAN GATE: only a human approval moves quoted -> approved.
  'POST /api/approve': async (req, res) => {
    const { invoiceId, approvedBy } = await readBody(req);
    const inv = mustGet(invoiceId);
    clerk.humanApprove(inv, { approvedBy });
    json(res, 200, inv);
  },

  // Payment: fund escrow + release through the (simulated) contract flow.
  'POST /api/pay': async (req, res) => {
    const { invoiceId } = await readBody(req);
    const inv = mustGet(invoiceId);
    clerk.assertPayable(inv); // throws unless human-approved and unflagged
    ledger.fund(inv.id, inv.client);
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
