// clerk.js — the "agent clerk" for Paid in Full.
//
// Pure logic, no I/O. The clerk:
//   1. prepares an invoice from a job + line items (+ any change orders),
//   2. checks the invoice total against the APPROVED contract sum,
//   3. FLAGS any invoice that exceeds the approved amount,
//   4. refuses to let anything reach "paid" without a human approval step.
//
// Money is integer cents everywhere in the desk app so totals are exact.
// The NEAR contract (contract/src/contract.ts) mirrors these states
// on-chain in yoctoNEAR: Created -> Funded -> Released.

'use strict';

function lineTotalCents(item) {
  if (!item || typeof item.description !== 'string' || item.description.length === 0) {
    throw new Error('line item needs a description');
  }
  const qty = Number(item.qty);
  const unit = Number(item.unitPriceCents);
  if (!Number.isFinite(qty) || qty <= 0) throw new Error('line item qty must be > 0');
  if (!Number.isFinite(unit) || unit < 0) throw new Error('line item unitPriceCents must be >= 0');
  return Math.round(qty * unit);
}

function sumLineItemsCents(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('an invoice needs at least one line item');
  }
  return lineItems.reduce((acc, it) => acc + lineTotalCents(it), 0);
}

let invoiceCounter = 0;

// The approved contract sum is set PER INVOICE, at creation, by the human
// client — it is the ceiling the clerk checks against and the cap the
// ledger/contract enforces at funding time. It is NOT a global and there
// is no endpoint that sets it after the fact: a global "set approved sum"
// route was the sharpest no-auth hole in the demo (any caller could raise
// the ceiling to anything, which made "the clerk may never pay past it"
// false even inside the app). The sum is committed with the invoice and
// can only rise through a signed change order on that invoice — and only
// BEFORE the client approves it. Once the client approves, the approved
// sum is FROZEN: the on-chain contract has no change-order function and
// no re-approve, so the cap cannot move after approval; only a new
// invoice can change it.
function createInvoice({ jobName, client, contractor, lineItems, changeOrders = [], approvedSumCents }) {
  if (!jobName) throw new Error('jobName is required');
  const approved = Math.round(Number(approvedSumCents));
  if (!Number.isFinite(approved) || approved <= 0) throw new Error('an invoice needs a positive approvedSumCents (the approved contract sum)');
  const baseCents = sumLineItemsCents(lineItems);
  const coCents = changeOrders.reduce((acc, co) => acc + Math.round(Number(co.amountCents) || 0), 0);
  invoiceCounter += 1;
  const invoice = {
    id: `inv-${String(invoiceCounter).padStart(4, '0')}`,
    jobName,
    client: client || 'client',
    contractor: contractor || 'contractor',
    lineItems: lineItems.map((it) => ({ ...it, lineTotalCents: lineTotalCents(it) })),
    changeOrders: changeOrders.map((co) => ({ ...co })),
    baseCents,
    changeOrderCents: coCents,
    totalCents: baseCents + coCents,
    approvedSumCents: approved,
    status: 'quoted', // quoted -> approved -> paid
    flagged: false,
    clerkCheck: null,
    history: [{ at: 'now', event: 'created', detail: `invoice prepared by agent clerk, total $${(baseCents + coCents) / 100}, approved contract sum $${approved / 100}` }],
  };
  return invoice;
}

// The clerk's core check: invoice total vs the invoice's own approved
// contract sum. Returns a check object and records it on the invoice. If
// the invoice exceeds the approved sum it is FLAGGED and cannot be
// approved as-is.
function checkAgainstApproved(invoice) {
  const approved = invoice.approvedSumCents;
  if (!Number.isFinite(approved) || approved < 0) throw new Error('invoice has no approvedSumCents to check against');
  const overageCents = invoice.totalCents - approved;
  const flagged = overageCents > 0;
  const check = {
    approvedContractSumCents: approved,
    invoiceTotalCents: invoice.totalCents,
    overageCents: Math.max(0, overageCents),
    flagged,
    verdict: flagged
      ? `FLAGGED: invoice exceeds the approved contract sum by $${(overageCents / 100).toFixed(2)}`
      : 'OK: invoice is within the approved contract sum',
  };
  invoice.clerkCheck = check;
  invoice.flagged = flagged;
  invoice.history.push({ at: 'now', event: flagged ? 'flagged' : 'checked-ok', detail: check.verdict });
  return check;
}

// A human can approve a change order, which raises the invoice's
// approved contract sum — but ONLY BEFORE the client approves the
// invoice. A change order raises the approved sum the client WILL
// approve up to; once the client has approved, the approved sum is
// FROZEN (the on-chain contract has no change-order function and no
// re-approve), so a change order after approval — or after payment —
// is REJECTED here, and only a new invoice can change the approved
// sum. After a pre-approval change order the clerk re-checks; this is
// the honest way an overage gets resolved (paper first, then money).
//
// The change order is AUTHORIZATION, not billing: it records that the
// client agreed to the extra work and raises the invoice's approved sum,
// but it does NOT add to the invoice total — the extra work is already
// billed in the invoice's line items. Adding it here would double-count:
// the total and the approved sum would rise by the same amount and the
// overage could never clear. (A change order that adds genuinely new work
// belongs in the line items of a new invoice, not here.)
//
// The approved sum lives ON the invoice (see createInvoice), so the raise
// happens here — there is no global sum for a caller to bump.
//
// A pre-approval change order changes the authorized sum, so — like a
// correction — it clears any prior approval state: the invoice goes back
// to 'quoted', the approver is cleared, and the clerk check is cleared.
// Re-check and re-approval are required before payment.
function approveChangeOrder(invoice, changeOrder, approvedBy) {
  if (!approvedBy) throw new Error('a change order needs a human approver (approvedBy)');
  // Only a 'quoted' invoice can take a change order. An approved invoice
  // has its sum FROZEN, and a paid invoice is closed — either way only a
  // new invoice can change the approved sum. The guard throws BEFORE any
  // mutation, so a rejected change order leaves the invoice untouched.
  if (invoice.status !== 'quoted') {
    const why = invoice.status === 'approved'
      ? 'the invoice is already approved'
      : invoice.status === 'paid'
        ? 'the invoice is already paid'
        : `the invoice is in status "${invoice.status}"`;
    throw new Error(`cannot approve a change order: ${why} — the approved sum is frozen; only a new invoice can change it`);
  }
  const co = { description: changeOrder.description || 'change order', amountCents: Math.round(Number(changeOrder.amountCents) || 0), approvedBy };
  invoice.changeOrders.push(co);
  invoice.approvedSumCents += co.amountCents;
  invoice.status = 'quoted';
  invoice.approvedBy = undefined;
  invoice.clerkCheck = null;
  invoice.history.push({ at: 'now', event: 'change-order-approved', detail: `${co.description}: +$${(co.amountCents / 100).toFixed(2)} approved by ${approvedBy} — approved sum rises to $${(invoice.approvedSumCents / 100).toFixed(2)} (pre-approval only; once approved the sum is frozen); re-check and approval required before payment` });
  return invoice;
}

// Correct an invoice downward: remove/replace a line item total by issuing
// a corrected invoice total. Used in the demo: the clerk flags $12,400
// against a $12,000 approval; the human corrects the invoice to $12,000.
//
// A correction INVALIDATES any prior approval: the approval was for the
// old total, so the invoice goes back to 'quoted', the approver is
// cleared, and the clerk check is cleared — the invoice must be re-checked
// and re-approved before it can be paid.
//
// A correction is REFUSED on a paid invoice (closed): rewriting its total
// after the contractor was paid would corrupt the desk record. A
// funded-but-unreleased invoice still shows clerk status 'approved'; the
// server refuses those too — the ledger void throws for a Funded escrow
// before the clerk mutates — because the clerk cannot see funding.
function correctInvoiceTotal(invoice, correctedTotalCents, correctedBy, note) {
  if (!correctedBy) throw new Error('a correction needs a human (correctedBy)');
  if (invoice.status !== 'quoted' && invoice.status !== 'approved') {
    throw new Error(`cannot correct an invoice in status "${invoice.status}" — the invoice is already ${invoice.status}; only a new invoice can change it`);
  }
  const target = Math.round(Number(correctedTotalCents));
  if (!Number.isFinite(target)) throw new Error('a correction needs a numeric correctedTotalCents');
  const delta = target - invoice.totalCents;
  if (delta >= 0) throw new Error('a correction must lower the total; use a change order to raise it');
  invoice.changeOrders.push({ description: note || 'human correction', amountCents: delta, approvedBy: correctedBy });
  invoice.changeOrderCents += delta;
  invoice.totalCents = target;
  invoice.status = 'quoted';
  invoice.approvedBy = undefined;
  invoice.clerkCheck = null;
  invoice.history.push({ at: 'now', event: 'corrected', detail: `total corrected to $${(target / 100).toFixed(2)} by ${correctedBy} — prior approval void, re-check and re-approval required` });
  return invoice;
}

// THE HUMAN GATE. No invoice becomes payable without this step, and a
// flagged invoice cannot pass it until the overage is resolved and the
// clerk has re-checked.
function humanApprove(invoice, { approvedBy } = {}) {
  if (!approvedBy) throw new Error('human approval is required: pass { approvedBy: "<name>" }');
  if (!invoice.clerkCheck) throw new Error('clerk has not checked this invoice yet');
  if (invoice.flagged) {
    throw new Error(`cannot approve: invoice is FLAGGED (${invoice.clerkCheck.verdict}). Resolve the overage and re-check first.`);
  }
  if (invoice.status !== 'quoted') throw new Error(`cannot approve an invoice in status "${invoice.status}"`);
  invoice.status = 'approved';
  invoice.approvedBy = approvedBy;
  invoice.history.push({ at: 'now', event: 'human-approved', detail: `approved for payment by ${approvedBy}` });
  return invoice;
}

// Payment is a state change that only an approved, unflagged invoice can
// make. The actual value movement is done by the ledger/contract layer;
// this function is the clerk-side gate the app calls before releasing.
function assertPayable(invoice) {
  if (invoice.status !== 'approved') {
    throw new Error(`cannot pay: invoice status is "${invoice.status}", not "approved" (human approval required first)`);
  }
  if (invoice.flagged) throw new Error('cannot pay: invoice is flagged');
  return true;
}

function markPaid(invoice, releaseDetail) {
  assertPayable(invoice);
  invoice.status = 'paid';
  invoice.history.push({ at: 'now', event: 'paid', detail: releaseDetail || 'escrow released to contractor' });
  return invoice;
}

module.exports = {
  lineTotalCents,
  sumLineItemsCents,
  createInvoice,
  checkAgainstApproved,
  approveChangeOrder,
  correctInvoiceTotal,
  humanApprove,
  assertPayable,
  markPaid,
};
