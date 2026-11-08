// Tests for the agent clerk + escrow ledger simulation.
// Run from the project root:  npm test     (node --test tests/)
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const clerk = require('../app/clerk');
const { EscrowLedger } = require('../app/ledger');

const ITEMS = [
  { description: 'Tile & grout, bathroom floor', qty: 1, unitPriceCents: 5400_00 },
  { description: 'Vanity + fixtures install', qty: 1, unitPriceCents: 3900_00 },
  { description: 'Extra: reroute shower drain (not in contract)', qty: 1, unitPriceCents: 3100_00 },
];
const APPROVED_SUM = 12000_00; // the contract sum the human approved

function demoInvoice() {
  return clerk.createInvoice({
    jobName: 'Bathroom remodel — final invoice',
    client: 'homeowner',
    contractor: 'gulf-coast-crew',
    lineItems: ITEMS,
  });
}

test('clerk prepares an invoice with exact totals', () => {
  const inv = demoInvoice();
  assert.equal(inv.totalCents, 12400_00);
  assert.equal(inv.status, 'quoted');
});

test('clerk FLAGS an invoice that exceeds the approved contract sum', () => {
  const inv = demoInvoice();
  const check = clerk.checkAgainstApproved(inv, APPROVED_SUM);
  assert.equal(check.flagged, true);
  assert.equal(check.overageCents, 400_00);
  assert.equal(inv.flagged, true);
});

test('a flagged invoice CANNOT be human-approved until resolved', () => {
  const inv = demoInvoice();
  clerk.checkAgainstApproved(inv, APPROVED_SUM);
  assert.throws(() => clerk.humanApprove(inv, { approvedBy: 'Chris' }), /FLAGGED/);
});

test('payment is impossible before human approval', () => {
  const inv = demoInvoice();
  clerk.checkAgainstApproved(inv, APPROVED_SUM);
  assert.throws(() => clerk.assertPayable(inv), /human approval required/);
});

test('the demo moment: flag -> human corrects -> re-check OK -> approve -> pay', () => {
  const inv = demoInvoice();
  let check = clerk.checkAgainstApproved(inv, APPROVED_SUM);
  assert.equal(check.flagged, true);

  clerk.correctInvoiceTotal(inv, 12000_00, 'Chris', 'drain reroute re-quoted separately');
  check = clerk.checkAgainstApproved(inv, APPROVED_SUM);
  assert.equal(check.flagged, false);
  assert.equal(inv.totalCents, 12000_00);

  clerk.humanApprove(inv, { approvedBy: 'Chris' });
  assert.equal(inv.status, 'approved');
  clerk.markPaid(inv, 'test release');
  assert.equal(inv.status, 'paid');
});

test('raising the approved sum with a signed change order also resolves an overage honestly', () => {
  const inv = demoInvoice();
  let sum = APPROVED_SUM;
  let check = clerk.checkAgainstApproved(inv, sum);
  assert.equal(check.flagged, true); // $12,400 invoice vs $12,000 approved
  // Human signs a change order covering the extra work: the APPROVED
  // contract sum rises to $15,100, so the same invoice now fits inside it.
  sum += 3100_00;
  check = clerk.checkAgainstApproved(inv, sum);
  assert.equal(check.flagged, false);
  assert.equal(check.overageCents, 0);
});

test('ledger mirrors the contract: fund moves money into escrow, release pays the contractor', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 20000_00);
  ledger.createEscrow('inv-1', 'gulf-coast-crew', 12000_00);
  ledger.fund('inv-1', 'homeowner');
  assert.equal(ledger.balanceOf('homeowner'), 8000_00);
  assert.equal(ledger.escrowOf('inv-1').status, 'Funded');
  assert.throws(() => ledger.release('inv-1', 'gulf-coast-crew'), /only the client/);
  ledger.release('inv-1', 'homeowner');
  assert.equal(ledger.balanceOf('gulf-coast-crew'), 12000_00);
  assert.equal(ledger.escrowOf('inv-1').status, 'Released');
});

test('ledger cancel refunds the funding client in full', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 5000_00);
  ledger.createEscrow('inv-2', 'gulf-coast-crew', 5000_00);
  ledger.fund('inv-2', 'homeowner');
  ledger.cancel('inv-2', 'homeowner');
  assert.equal(ledger.balanceOf('homeowner'), 5000_00);
  assert.equal(ledger.escrowOf('inv-2').status, 'Cancelled');
});

test('approval requires a named human — the clerk cannot approve its own invoice', () => {
  const inv = demoInvoice();
  clerk.correctInvoiceTotal(inv, 12000_00, 'Chris');
  clerk.checkAgainstApproved(inv, APPROVED_SUM);
  assert.throws(() => clerk.humanApprove(inv, {}), /human approval is required/);
  assert.throws(() => clerk.humanApprove(inv), /human approval is required/);
});
