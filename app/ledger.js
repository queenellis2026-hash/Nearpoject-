// ledger.js — a local simulation of the NEAR testnet escrow contract
// (contract/src/contract.ts), with the same states and rules:
//
//   contract:  Created (approved flag set by client_approve, cap recorded)
//              --approve_and_fund (deposit == amount)--> Funded
//              Funded  --release (by the client who funded)-----> Released
//              Created|Funded --cancel (by the recorded client)--> Cancelled
//                        (Created: no escrow held, no funds move;
//                         Funded: refund in full)
//
// There is NO "Approved" status: approval is a boolean flag on a Created
// escrow, set by client_approve together with the approved-sum cap.
// The app runs against this ledger in "local" mode so a judge can run the
// full flow with no wallet, no faucet, and no network. Amounts here are
// integer cents (the desk app's unit); the on-chain contract uses
// yoctoNEAR strings for the same amounts.
//
// THE GATE, mirrored: like the contract, this ledger requires the
// recorded client's approval before funding — and the approval sets an
// approved-sum CAP. fund() asserts the escrow was approved, the caller is
// the recorded client, AND the invoice amount does not exceed the cap.
// The clerk's flag and the human approval in the app are the workflow;
// the approval state + cap here are the lock. Binding the client alone
// would not make the approved-sum rule real — the cap is what makes "no
// dollar moves past the approved sum" true in the simulation too.

'use strict';

class EscrowLedger {
  constructor() {
    this.balances = new Map(); // account -> cents (simulated test funds)
    this.escrows = new Map(); // invoiceId -> { amountCents, client, contractor, status, approved, approvedSumCents }
  }

  // Test-funds faucet for the local simulation ONLY. On testnet this role
  // is played by the free testnet faucet; no real money exists here.
  mint(account, amountCents) {
    this.balances.set(account, (this.balances.get(account) || 0) + amountCents);
  }

  balanceOf(account) {
    return this.balances.get(account) || 0;
  }

  escrowOf(invoiceId) {
    return this.escrows.get(invoiceId) || null;
  }

  // Mirrors contract create_invoice: the intended client is recorded at
  // creation; only that account may approve, fund, release or cancel.
  // The approved-sum cap starts unset (null) — only the recorded client
  // can set it, via approve().
  createEscrow(invoiceId, contractor, amountCents, client) {
    if (this.escrows.has(invoiceId)) throw new Error(`escrow ${invoiceId} already exists`);
    if (!client) throw new Error('an escrow needs a recorded client');
    this.escrows.set(invoiceId, { amountCents, client, contractor, status: 'Created', approved: false, approvedSumCents: null });
    return this.escrows.get(invoiceId);
  }

  // Mirrors contract client_approve: only the recorded client, only while
  // the escrow is still Created (unfunded). The approval SETS the cap —
  // the cap-setting is the approval, exactly as on-chain. The cap is the
  // approved contract sum the clerk checked against. Like the contract,
  // the cap must be at least the invoice amount: a too-low cap fails fast
  // here, records nothing, and the client can retry with a correct cap.
  approve(invoiceId, caller, approvedSumCents) {
    const e = this._get(invoiceId);
    if (e.status !== 'Created') throw new Error(`cannot approve escrow in status ${e.status}`);
    if (caller !== e.client) throw new Error('only the recorded client can approve this escrow');
    if (e.approved) throw new Error('escrow is already approved');
    const cap = Math.round(Number(approvedSumCents));
    if (!Number.isFinite(cap) || cap <= 0) throw new Error('approved sum must be positive');
    if (cap < e.amountCents) throw new Error('approved sum must be at least the invoice amount');
    e.approved = true;
    e.approvedSumCents = cap;
    return e;
  }

  // Voids a prior approval: clears the approved flag AND the cap, so the
  // escrow must be approved again (with the current approved sum as the
  // cap) before it can fund. Only while the escrow is still Created —
  // never void a Funded/Released escrow, where money has already moved
  // or is held. No on-chain counterpart exists (on-chain amounts are
  // immutable, so a stale approval cannot arise there); the desk app
  // needs it because a correction or change order voids the clerk's
  // approval, and the ledger's approval must go with it in the same
  // request, or a stale ledger approval would let the old cap fund the
  // new total. Idempotent when nothing is approved yet.
  voidApproval(invoiceId) {
    const e = this._get(invoiceId);
    if (e.status !== 'Created') throw new Error(`cannot void approval for escrow in status ${e.status}`);
    e.approved = false;
    e.approvedSumCents = null;
    return e;
  }

  // Mirrors contract approve_and_fund: the recorded client attaches
  // exactly the invoice amount; it moves from the client's balance into
  // escrow. Requires the client's prior approval AND that the invoice
  // amount does not exceed the approved-sum cap — an unapproved escrow,
  // or an invoice over the approved sum, cannot be funded, however the
  // caller reaches this function.
  fund(invoiceId, client) {
    const e = this._get(invoiceId);
    if (e.status !== 'Created') throw new Error(`cannot fund escrow in status ${e.status}`);
    if (!e.approved) throw new Error('escrow must be approved by the client before funding');
    if (client !== e.client) throw new Error('only the recorded client can fund this escrow');
    if (e.amountCents > e.approvedSumCents) throw new Error('invoice amount exceeds the approved sum');
    if (this.balanceOf(client) < e.amountCents) throw new Error('insufficient simulated balance to fund escrow');
    this.balances.set(client, this.balanceOf(client) - e.amountCents);
    e.status = 'Funded';
    return e;
  }

  // Mirrors contract release: only the funding client can release, and
  // only from Funded. The amount lands with the contractor.
  release(invoiceId, caller) {
    const e = this._get(invoiceId);
    if (e.status !== 'Funded') throw new Error(`cannot release escrow in status ${e.status}`);
    if (caller !== e.client) throw new Error('only the client who funded this escrow can release it');
    this.balances.set(e.contractor, this.balanceOf(e.contractor) + e.amountCents);
    e.status = 'Released';
    return e;
  }

  // Mirrors contract cancel: the recorded client may cancel from Created
  // (unfunded — no escrow held, so no funds move) or from Funded (refund
  // the funding client in full). Cancel after release is rejected.
  cancel(invoiceId, caller) {
    const e = this._get(invoiceId);
    if (e.status !== 'Created' && e.status !== 'Funded') throw new Error(`cannot cancel escrow in status ${e.status}`);
    if (caller !== e.client) throw new Error('only the recorded client can cancel this escrow');
    if (e.status === 'Funded') {
      this.balances.set(e.client, this.balanceOf(e.client) + e.amountCents);
    }
    e.status = 'Cancelled';
    return e;
  }

  _get(invoiceId) {
    const e = this.escrows.get(invoiceId);
    if (!e) throw new Error(`no escrow for ${invoiceId}`);
    return e;
  }
}

module.exports = { EscrowLedger };
