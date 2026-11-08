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

function createInvoice({ jobName, client, contractor, lineItems, changeOrders = [] }) {
  if (!jobName) throw new Error('jobName is required');
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
    status: 'quoted', // quoted -> approved -> paid
    flagged: false,
    clerkCheck: null,
    history: [{ at: 'now', event: 'created', detail: `invoice prepared by agent clerk, total $${(baseCents + coCents) / 100}` }],
  };
  return invoice;
}

// The clerk's core check: invoice total vs the approved contract sum.
// Returns a check object and records it on the invoice. If the invoice
// exceeds the approved sum it is FLAGGED and cannot be approved as-is.
function checkAgainstApproved(invoice, approvedContractSumCents) {
  const approved = Math.round(Number(approvedContractSumCents));
  if (!Number.isFinite(approved) || approved < 0) throw new Error('approvedContractSumCents must be >= 0');
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

// A human can approve a change order, which raises the approved contract
// sum. After that the clerk re-checks; this is the honest way an overage
// gets resolved (paper first, then money).
function approveChangeOrder(invoice, changeOrder, approvedBy) {
  if (!approvedBy) throw new Error('a change order needs a human approver (approvedBy)');
  const co = { description: changeOrder.description || 'change order', amountCents: Math.round(Number(changeOrder.amountCents) || 0), approvedBy };
  invoice.changeOrders.push(co);
  invoice.changeOrderCents += co.amountCents;
  invoice.totalCents = invoice.baseCents + invoice.changeOrderCents;
  invoice.history.push({ at: 'now', event: 'change-order-approved', detail: `${co.description}: +$${(co.amountCents / 100).toFixed(2)} approved by ${approvedBy}` });
  return invoice;
}

// Correct an invoice downward: remove/replace a line item total by issuing
// a corrected invoice total. Used in the demo: the clerk flags $12,400
// against a $12,000 approval; the human corrects the invoice to $12,000.
function correctInvoiceTotal(invoice, correctedTotalCents, correctedBy, note) {
  if (!correctedBy) throw new Error('a correction needs a human (correctedBy)');
  const target = Math.round(Number(correctedTotalCents));
  const delta = target - invoice.totalCents;
  if (delta >= 0) throw new Error('a correction must lower the total; use a change order to raise it');
  invoice.changeOrders.push({ description: note || 'human correction', amountCents: delta, approvedBy: correctedBy });
  invoice.changeOrderCents += delta;
  invoice.totalCents = target;
  invoice.history.push({ at: 'now', event: 'corrected', detail: `total corrected to $${(target / 100).toFixed(2)} by ${correctedBy}` });
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
