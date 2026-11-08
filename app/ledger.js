// ledger.js — a local simulation of the NEAR testnet escrow contract
// (contract/src/contract.ts), with the same states and rules:
//
//   contract:  Created --approve_and_fund (deposit == amount)--> Funded
//              Funded  --release (by the client who funded)-----> Released
//              Funded  --cancel  (by the client who funded)-----> Cancelled (refund)
//
// The app runs against this ledger in "local" mode so a judge can run the
// full flow with no wallet, no faucet, and no network. Amounts here are
// integer cents (the desk app's unit); the on-chain contract uses
// yoctoNEAR strings for the same amounts.

'use strict';

class EscrowLedger {
  constructor() {
    this.balances = new Map(); // account -> cents (simulated test funds)
    this.escrows = new Map(); // invoiceId -> { amountCents, client, contractor, status }
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

  // Mirrors contract create_invoice.
  createEscrow(invoiceId, contractor, amountCents) {
    if (this.escrows.has(invoiceId)) throw new Error(`escrow ${invoiceId} already exists`);
    this.escrows.set(invoiceId, { amountCents, client: null, contractor, status: 'Created' });
    return this.escrows.get(invoiceId);
  }

  // Mirrors contract approve_and_fund: the client attaches exactly the
  // invoice amount; it moves from the client's balance into escrow.
  fund(invoiceId, client) {
    const e = this._get(invoiceId);
    if (e.status !== 'Created') throw new Error(`cannot fund escrow in status ${e.status}`);
    if (this.balanceOf(client) < e.amountCents) throw new Error('insufficient simulated balance to fund escrow');
    this.balances.set(client, this.balanceOf(client) - e.amountCents);
    e.client = client;
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

  // Mirrors contract cancel: refund the funding client.
  cancel(invoiceId, caller) {
    const e = this._get(invoiceId);
    if (e.status !== 'Funded') throw new Error(`cannot cancel escrow in status ${e.status}`);
    if (caller !== e.client) throw new Error('only the client who funded this escrow can cancel it');
    this.balances.set(e.client, this.balanceOf(e.client) + e.amountCents);
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
