// Paid in Full — NEAR testnet escrow contract (near-sdk-js, TypeScript).
//
// One invoice = one escrow record:
//   create_invoice    contractor registers an invoice (amount in yoctoNEAR)
//                     and records the intended CLIENT at creation time
//   client_approve    the recorded client approves the invoice AND sets the
//                     approved-sum CAP (see THE GATE below) — the cap-setting
//                     IS the approval
//   approve_and_fund  the recorded client calls it WITH a deposit exactly
//                     equal to the invoice amount — that call is the funding,
//                     and the deposit is held in escrow by this contract
//   release           the funding client releases the escrow to the
//                     contractor (the payment moment)
//   cancel            the recorded client cancels an invoice while it is
//                     still Created (unfunded — no funds move) or Funded
//                     (funded — refunded in full)
//
// THE GATE (why client_approve exists, and why it sets a cap): the desk
// app (app/clerk.js) has an agent clerk that checks every invoice against
// the approved contract sum and flags overages, and a human approval is
// required before funding is attempted. That check used to live ONLY in
// the app — the contract accepted funding from any caller with the exact
// deposit, so a flagged invoice could be funded and released directly
// on-chain, bypassing the clerk entirely. This contract now enforces the
// gate itself, in two parts:
//   (1) CLIENT BINDING — approve_and_fund asserts the caller is the
//       client recorded at creation, so a stranger cannot fund an invoice.
//   (2) APPROVED-SUM CAP — the client sets approved_sum_yocto when they
//       approve, and approve_and_fund asserts the invoice amount is less
//       than or equal to it. Binding the client alone would NOT make the
//       approved-sum rule real on-chain: the client could still fund a
//       $12,400 invoice against a $12,000 approval. The cap is what makes
//       "no dollar moves past the approved sum" true on-chain.
//
// Design choices:
// - WHO SETS THE CAP: the client, never the contractor. The contractor
//   creates the invoice (and names the client), but only the recorded
//   client can call client_approve, so only the client can set the cap.
//   A contractor-set cap would be the contractor setting their own
//   ceiling — meaningless.
// - THE CAP-SETTING IS THE APPROVAL: there is no separate parameterless
//   approval call. That would be redundant — an approval without a cap
//   would leave the invoice fundable up to any amount, and a cap without
//   approval would be meaningless. One call, one decision: the client
//   approves the invoice AND states the sum they approve it up to.
// - The cap is set once, before funding. A cap below the invoice amount
//   fails fast at approval: client_approve asserts the approved sum is at
//   least the invoice amount, panics with a clear error, and — because a
//   NEAR panic rolls the call back — records nothing, so the client can
//   retry with a correct cap. There is NO on-chain change order that
//   raises the cap after approval, and the cap is never re-set. The
//   remedy for a wrong invoice amount is a corrected invoice (a new
//   invoice id), exactly as the desk app's workflow does.
//
// Build:  npm run build   (produces build/paid-in-full.wasm)
// Deploy (testnet only): see scripts/deploy-testnet.sh — needs a testnet
// account the TEAM creates; never deploy to mainnet from this repo.

import { NearBindgen, near, call, view, initialize, LookupMap, Vector, assert } from 'near-sdk-js';

class Invoice {
  job: string = '';
  contractor: string = '';
  client: string = ''; // recorded at creation; only this account may approve/fund/release/cancel
  amountYocto: string = '0'; // string: yoctoNEAR exceeds JS number range
  status: string = 'Created'; // Created | Funded | Released | Cancelled
  approved: boolean = false; // set by client_approve, together with the cap
  approvedSumYocto: string = '0'; // the cap, set by the client at approval; '0' = no cap set
}

// A plausible NEAR account id: 2–64 chars, lowercase letters, digits,
// '.', '_' or '-'. Rejects the empty string, spaces, uppercase and
// anything that cannot be an account — so a transfer can never be
// addressed to a malformed account (see the status-before-transfer note
// on release/cancel below).
function isValidAccountId(id: string): boolean {
  if (typeof id !== 'string' || id.length < 2 || id.length > 64) return false;
  for (let i = 0; i < id.length; i++) {
    const c = id[i];
    const ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c === '.' || c === '_' || c === '-';
    if (!ok) return false;
  }
  return true;
}

@NearBindgen({ requireInit: true })
export class PaidInFull {
  invoices: LookupMap<Invoice> = new LookupMap('invoices-v1');
  ids: Vector<string> = new Vector('invoice-ids-v1');

  @initialize({ privateFunction: true })
  init() {}

  @call({})
  create_invoice({ invoice_id, job, contractor, client, amount_yocto }: { invoice_id: string; job: string; contractor: string; client: string; amount_yocto: string }) {
    assert(this.invoices.get(invoice_id) === null, 'invoice already exists');
    assert(BigInt(amount_yocto) > 0n, 'amount must be positive');
    assert(isValidAccountId(contractor), 'contractor must be a valid NEAR account id');
    assert(isValidAccountId(client), 'client must be a valid NEAR account id');
    const inv = new Invoice();
    inv.job = job;
    inv.contractor = contractor;
    inv.client = client;
    inv.amountYocto = amount_yocto;
    inv.approved = false;
    inv.approvedSumYocto = '0';
    this.invoices.set(invoice_id, inv);
    this.ids.push(invoice_id);
    near.log(`invoice ${invoice_id} created: ${job}, amount ${amount_yocto} yocto, client ${client}`);
  }

  // The on-chain gate: the recorded client approves the invoice AND sets
  // the approved-sum cap in the same call. Only the recorded client may
  // call it, and only while the invoice is still Created (unfunded). A
  // flagged or unchecked invoice is never approved here — the app's clerk
  // check and human approval happen before this call is made, and the cap
  // the client sets is the approved contract sum from that check.
  @call({})
  client_approve({ invoice_id, approved_sum_yocto }: { invoice_id: string; approved_sum_yocto: string }) {
    const inv = this._get(invoice_id);
    assert(inv.status === 'Created', `cannot approve an invoice in status ${inv.status}`);
    assert(near.predecessorAccountId() === inv.client, 'only the recorded client can approve this invoice');
    assert(!inv.approved, 'invoice is already approved');
    assert(BigInt(approved_sum_yocto) > 0n, 'approved sum must be positive');
    assert(BigInt(approved_sum_yocto) >= BigInt(inv.amountYocto), 'approved sum must be at least the invoice amount');
    inv.approved = true;
    inv.approvedSumYocto = approved_sum_yocto;
    this.invoices.set(invoice_id, inv);
    near.log(`invoice ${invoice_id} approved by client ${inv.client} up to ${approved_sum_yocto} yocto`);
  }

  @call({ payableFunction: true })
  approve_and_fund({ invoice_id }: { invoice_id: string }) {
    const inv = this._get(invoice_id);
    assert(inv.status === 'Created', `cannot fund an invoice in status ${inv.status}`);
    assert(inv.approved, 'invoice must be approved by the client before funding (call client_approve first)');
    assert(near.predecessorAccountId() === inv.client, 'only the recorded client can fund this invoice');
    assert(BigInt(inv.amountYocto) <= BigInt(inv.approvedSumYocto), 'invoice amount exceeds the approved sum');
    const deposit = near.attachedDeposit();
    assert(deposit === BigInt(inv.amountYocto), 'attached deposit must equal the invoice amount exactly');
    inv.status = 'Funded';
    this.invoices.set(invoice_id, inv);
    near.log(`invoice ${invoice_id} approved and funded by ${inv.client}`);
  }

  @call({})
  release({ invoice_id }: { invoice_id: string }) {
    const inv = this._get(invoice_id);
    assert(inv.status === 'Funded', `cannot release an invoice in status ${inv.status}`);
    assert(near.predecessorAccountId() === inv.client, 'only the client who funded this invoice can release it');
    inv.status = 'Released';
    this.invoices.set(invoice_id, inv);
    const promise = near.promiseBatchCreate(inv.contractor);
    near.promiseBatchActionTransfer(promise, BigInt(inv.amountYocto));
    near.log(`invoice ${invoice_id} released to ${inv.contractor}`);
  }

  // Cancels an invoice that is still Created (unfunded — no escrow
  // exists, so no transfer is attempted) or Funded (refund in full).
  // Only the recorded client may cancel.
  @call({})
  cancel({ invoice_id }: { invoice_id: string }) {
    const inv = this._get(invoice_id);
    assert(inv.status === 'Created' || inv.status === 'Funded', `cannot cancel an invoice in status ${inv.status}`);
    assert(near.predecessorAccountId() === inv.client, 'only the client who funded this invoice can cancel it');
    const wasFunded = inv.status === 'Funded';
    inv.status = 'Cancelled';
    this.invoices.set(invoice_id, inv);
    if (wasFunded) {
      const promise = near.promiseBatchCreate(inv.client);
      near.promiseBatchActionTransfer(promise, BigInt(inv.amountYocto));
    }
    near.log(`invoice ${invoice_id} cancelled${wasFunded ? ', refunded to ' + inv.client : ' (unfunded, no refund)'}`);
  }

  @view({})
  get_invoice({ invoice_id }: { invoice_id: string }): Invoice {
    return this._get(invoice_id);
  }

  @view({})
  invoice_ids(): string[] {
    return this.ids.toArray();
  }

  _get(invoice_id: string): Invoice {
    const inv = this.invoices.get(invoice_id);
    assert(inv !== null, `no invoice ${invoice_id}`);
    return inv as Invoice;
  }
}

// KNOWN LIMITATIONS (deliberate, documented — not fixed in this version):
//
// 1. Status-before-transfer: release/cancel set the invoice status to its
//    terminal state BEFORE creating the async transfer promise, with no
//    callback and no withdraw/rescue function. If a transfer failed, the
//    funds would strand in the contract. create_invoice's account
//    validation only checks the FORMAT of the contractor and client ids —
//    it does not prove those accounts exist on-chain, so a release to a
//    well-formed but never-created account would still fail and strand
//    the funds. A rescue function is out of scope for this version.
//
// 2. No expiry: invoices never expire, so a Created invoice can be
//    approved and funded arbitrarily late. The approval gate means a stale
//    invoice still needs the recorded client's explicit approval (with a
//    cap) to move, which bounds the risk, but there is no deadline
//    enforcement.
//
// 3. invoice_ids() is unbounded: it returns the entire Vector of invoice
//    ids in one view call. At large scale that is a gas/time risk (the
//    call grows with the number of invoices). For this hackathon's volume
//    it is fine; a production version would paginate (e.g. an offset/limit
//    view) instead.
