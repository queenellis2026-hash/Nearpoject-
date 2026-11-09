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
    approvedSumCents: APPROVED_SUM,
  });
}

test('clerk prepares an invoice with exact totals', () => {
  const inv = demoInvoice();
  assert.equal(inv.totalCents, 12400_00);
  assert.equal(inv.status, 'quoted');
});

test('clerk FLAGS an invoice that exceeds the approved contract sum', () => {
  const inv = demoInvoice();
  const check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, true);
  assert.equal(check.overageCents, 400_00);
  assert.equal(inv.flagged, true);
});

test('a flagged invoice CANNOT be human-approved until resolved', () => {
  const inv = demoInvoice();
  clerk.checkAgainstApproved(inv);
  assert.throws(() => clerk.humanApprove(inv, { approvedBy: 'Chris' }), /FLAGGED/);
});

test('payment is impossible before human approval', () => {
  const inv = demoInvoice();
  clerk.checkAgainstApproved(inv);
  assert.throws(() => clerk.assertPayable(inv), /human approval required/);
});

test('the demo moment: flag -> human corrects -> re-check OK -> approve -> pay', () => {
  const inv = demoInvoice();
  let check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, true);

  clerk.correctInvoiceTotal(inv, 12000_00, 'Chris', 'drain reroute re-quoted separately');
  check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, false);
  assert.equal(inv.totalCents, 12000_00);

  clerk.humanApprove(inv, { approvedBy: 'Chris' });
  assert.equal(inv.status, 'approved');
  clerk.markPaid(inv, 'test release');
  assert.equal(inv.status, 'paid');
});

test('raising the approved sum with a signed change order also resolves an overage honestly', () => {
  const inv = demoInvoice();
  let check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, true); // $12,400 invoice vs $12,000 approved
  // Human signs a change order covering the extra work: the invoice's
  // APPROVED sum rises to $15,100, so the same invoice now fits inside it.
  clerk.approveChangeOrder(inv, { description: 'Drain reroute', amountCents: 3100_00 }, 'Chris');
  assert.equal(inv.approvedSumCents, 15100_00);
  check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, false);
  assert.equal(check.overageCents, 0);
});

test('a correction after approval VOIDS the approval — re-check and re-approval required', () => {
  const inv = demoInvoice();
  clerk.correctInvoiceTotal(inv, 12000_00, 'Chris');
  clerk.checkAgainstApproved(inv);
  clerk.humanApprove(inv, { approvedBy: 'Chris' });
  assert.equal(inv.status, 'approved');
  assert.equal(inv.approvedBy, 'Chris');

  // Correct again, to a lower total, after approval.
  clerk.correctInvoiceTotal(inv, 11000_00, 'Chris', 'further correction');
  assert.equal(inv.status, 'quoted');
  assert.equal(inv.approvedBy, undefined);
  assert.equal(inv.clerkCheck, null);
  // No approval without a fresh clerk check.
  assert.throws(() => clerk.humanApprove(inv, { approvedBy: 'Chris' }), /has not checked/);
  assert.throws(() => clerk.assertPayable(inv), /not "approved"/);
  // Re-check and re-approve restores the payable state.
  const check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, false);
  clerk.humanApprove(inv, { approvedBy: 'Chris' });
  assert.equal(inv.status, 'approved');
});

test('a change order after approval is REJECTED — the approved sum is frozen', () => {
  const inv = demoInvoice();
  clerk.correctInvoiceTotal(inv, 12000_00, 'Chris');
  clerk.checkAgainstApproved(inv);
  clerk.humanApprove(inv, { approvedBy: 'Chris' });
  assert.equal(inv.status, 'approved');
  // The on-chain contract has no change-order function and no re-approve:
  // once approved, the cap is frozen and only a new invoice can change it.
  assert.throws(
    () => clerk.approveChangeOrder(inv, { description: 'Extra work', amountCents: 100_00 }, 'Chris'),
    /already approved|frozen/,
  );
  // Nothing changed: still approved, same sum, same approver, check intact.
  assert.equal(inv.status, 'approved');
  assert.equal(inv.approvedBy, 'Chris');
  assert.equal(inv.approvedSumCents, 12000_00);
  assert.ok(inv.clerkCheck, 'clerk check intact');
  assert.equal(inv.changeOrders.length, 1); // only the correction — no change order was added
});

test('ledger mirrors the contract: fund moves money into escrow, release pays the contractor', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 20000_00);
  ledger.createEscrow('inv-1', 'gulf-coast-crew', 12000_00, 'homeowner');
  ledger.approve('inv-1', 'homeowner', 12000_00);
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
  ledger.createEscrow('inv-2', 'gulf-coast-crew', 5000_00, 'homeowner');
  ledger.approve('inv-2', 'homeowner', 5000_00);
  ledger.fund('inv-2', 'homeowner');
  ledger.cancel('inv-2', 'homeowner');
  assert.equal(ledger.balanceOf('homeowner'), 5000_00);
  assert.equal(ledger.escrowOf('inv-2').status, 'Cancelled');
});

test('approval requires a named human — the clerk cannot approve its own invoice', () => {
  const inv = demoInvoice();
  clerk.correctInvoiceTotal(inv, 12000_00, 'Chris');
  clerk.checkAgainstApproved(inv);
  assert.throws(() => clerk.humanApprove(inv, {}), /human approval is required/);
  assert.throws(() => clerk.humanApprove(inv), /human approval is required/);
});

test('ledger fund requires the recorded client approval first — the gate binds', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 20000_00);
  ledger.createEscrow('inv-3', 'gulf-coast-crew', 12000_00, 'homeowner');
  // No approval yet: funding fails.
  assert.throws(() => ledger.fund('inv-3', 'homeowner'), /must be approved/);
  // A non-client cannot approve.
  assert.throws(() => ledger.approve('inv-3', 'gulf-coast-crew'), /only the recorded client/);
  // The recorded client approves; a second approval fails.
  ledger.approve('inv-3', 'homeowner', 12000_00);
  assert.equal(ledger.escrowOf('inv-3').approved, true);
  assert.throws(() => ledger.approve('inv-3', 'homeowner'), /already approved/);
  // A non-client cannot fund even after approval.
  assert.throws(() => ledger.fund('inv-3', 'gulf-coast-crew'), /only the recorded client/);
  // The recorded client funds.
  ledger.fund('inv-3', 'homeowner');
  assert.equal(ledger.escrowOf('inv-3').status, 'Funded');
});

test('ledger fund and release are separate steps — the Funded state is visible', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 20000_00);
  ledger.createEscrow('inv-4', 'gulf-coast-crew', 12000_00, 'homeowner');
  ledger.approve('inv-4', 'homeowner', 12000_00);
  // Release before funding fails.
  assert.throws(() => ledger.release('inv-4', 'homeowner'), /cannot release escrow in status Created/);
  ledger.fund('inv-4', 'homeowner');
  assert.equal(ledger.escrowOf('inv-4').status, 'Funded');
  assert.equal(ledger.balanceOf('homeowner'), 8000_00);
  assert.equal(ledger.balanceOf('gulf-coast-crew'), 0); // not paid yet
  // Funding twice fails.
  assert.throws(() => ledger.fund('inv-4', 'homeowner'), /cannot fund escrow in status Funded/);
  ledger.release('inv-4', 'homeowner');
  assert.equal(ledger.escrowOf('inv-4').status, 'Released');
  assert.equal(ledger.balanceOf('gulf-coast-crew'), 12000_00);
});

test('ledger approve rejects a cap below the invoice amount — fail fast, state unchanged, retry succeeds', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 30000_00); // enough to fund both the $12,400 and the $12,000 escrows below
  // The flagged invoice: $12,400 against a $12,000 approved sum.
  ledger.createEscrow('inv-5', 'gulf-coast-crew', 12400_00, 'homeowner');
  // A cap below the amount fails fast at approval — mirror of the
  // contract's client_approve assert. Nothing is recorded, so the client
  // can retry with a correct cap.
  assert.throws(() => ledger.approve('inv-5', 'homeowner', 12000_00), /at least the invoice amount/);
  assert.equal(ledger.escrowOf('inv-5').approved, false);
  assert.equal(ledger.escrowOf('inv-5').approvedSumCents, null);
  assert.equal(ledger.escrowOf('inv-5').status, 'Created');
  // Retry with a correct cap succeeds, and the escrow funds.
  ledger.approve('inv-5', 'homeowner', 12400_00);
  assert.equal(ledger.escrowOf('inv-5').approvedSumCents, 12400_00);
  ledger.fund('inv-5', 'homeowner');
  assert.equal(ledger.escrowOf('inv-5').status, 'Funded');
  // The corrected invoice: $12,000 against the same $12,000 cap — funds.
  ledger.createEscrow('inv-6', 'gulf-coast-crew', 12000_00, 'homeowner');
  ledger.approve('inv-6', 'homeowner', 12000_00);
  ledger.fund('inv-6', 'homeowner');
  assert.equal(ledger.escrowOf('inv-6').status, 'Funded');
});

test('ledger cancel from Created works — no escrow held, no funds move', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 20000_00);
  ledger.createEscrow('inv-8', 'gulf-coast-crew', 12000_00, 'homeowner');
  // A stranger cannot cancel even an unfunded escrow.
  assert.throws(() => ledger.cancel('inv-8', 'gulf-coast-crew'), /only the recorded client/);
  assert.equal(ledger.escrowOf('inv-8').status, 'Created');
  ledger.cancel('inv-8', 'homeowner');
  assert.equal(ledger.escrowOf('inv-8').status, 'Cancelled');
  assert.equal(ledger.balanceOf('homeowner'), 20000_00); // nothing moved
  assert.equal(ledger.balanceOf('gulf-coast-crew'), 0);
  // A cancelled escrow cannot be funded or approved afterwards.
  assert.throws(() => ledger.fund('inv-8', 'homeowner'), /cannot fund escrow in status Cancelled/);
  assert.throws(() => ledger.approve('inv-8', 'homeowner', 12000_00), /cannot approve escrow in status Cancelled/);
});

test('ledger cancel after release is still rejected', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 20000_00);
  ledger.createEscrow('inv-9', 'gulf-coast-crew', 12000_00, 'homeowner');
  ledger.approve('inv-9', 'homeowner', 12000_00);
  ledger.fund('inv-9', 'homeowner');
  ledger.release('inv-9', 'homeowner');
  assert.throws(() => ledger.cancel('inv-9', 'homeowner'), /cannot cancel escrow in status Released/);
  assert.equal(ledger.balanceOf('gulf-coast-crew'), 12000_00); // payment stands
});

test('approval needs a positive cap — zero or missing is rejected', () => {
  const ledger = new EscrowLedger();
  ledger.mint('homeowner', 20000_00);
  ledger.createEscrow('inv-7', 'gulf-coast-crew', 12000_00, 'homeowner');
  assert.throws(() => ledger.approve('inv-7', 'homeowner', 0), /must be positive/);
  assert.throws(() => ledger.approve('inv-7', 'homeowner'), /must be positive/);
  assert.equal(ledger.escrowOf('inv-7').approved, false);
});

test('a change order resolves the overage: approved sum rises, re-check passes', () => {
  const inv = demoInvoice(); // $12,400
  let check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, true);
  clerk.approveChangeOrder(inv, { description: 'Drain reroute', amountCents: 400_00 }, 'Chris');
  assert.equal(inv.approvedSumCents, 12400_00); // the invoice's approved sum rises by the change order amount
  check = clerk.checkAgainstApproved(inv);
  assert.equal(check.flagged, false);
  assert.equal(check.overageCents, 0);
  assert.equal(inv.totalCents, 12400_00); // total unchanged — the work was already billed
});

test('change order is linked to the invoice, needs a human, and is recorded', () => {
  const inv = demoInvoice();
  clerk.checkAgainstApproved(inv);
  assert.equal(inv.flagged, true);
  // No approver: rejected.
  assert.throws(
    () => clerk.approveChangeOrder(inv, { description: 'Drain reroute', amountCents: 400_00 }, undefined),
    /needs a human approver/,
  );
  clerk.approveChangeOrder(inv, { description: 'Drain reroute', amountCents: 400_00 }, 'Chris');
  // Linked to this invoice, with the approver and a history entry.
  const co = inv.changeOrders.find((c) => c.description === 'Drain reroute');
  assert.ok(co, 'change order recorded on the invoice');
  assert.equal(co.amountCents, 400_00);
  assert.equal(co.approvedBy, 'Chris');
  assert.ok(inv.history.some((h) => h.event === 'change-order-approved'), 'history entry recorded');
  // The total does NOT rise: the change order is authorization for work
  // already billed in the line items. The invoice's approved sum rises
  // instead (approveChangeOrder raises it), so the re-check can pass.
  assert.equal(inv.totalCents, 12400_00);
  assert.equal(inv.approvedSumCents, 12400_00);
  // The invoice goes back to 'quoted' — re-check and re-approval required.
  assert.equal(inv.status, 'quoted');
});
