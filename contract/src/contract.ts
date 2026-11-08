// Paid in Full — NEAR testnet escrow contract (near-sdk-js, TypeScript).
//
// One invoice = one escrow record:
//   create_invoice    contractor registers an invoice (amount in yoctoNEAR)
//   approve_and_fund  the client calls it WITH a deposit exactly equal to
//                     the invoice amount — that call is the approval, and
//                     the deposit is held in escrow by this contract
//   release           the funding client releases the escrow to the
//                     contractor (the payment moment)
//   cancel            the funding client cancels a funded invoice and is
//                     refunded in full
//
// The desk app (app/clerk.js) enforces the layer above this: an agent
// clerk checks every invoice against the approved contract sum and flags
// overages, and a human approval is required before funding is attempted.
// This contract is deliberately minimal — the smallest real NEAR fit for
// "escrow/releases an invoice amount against an approval".
//
// Build:  npm run build   (produces build/paid-in-full.wasm)
// Deploy (testnet only): see scripts/deploy-testnet.sh — needs a testnet
// account the TEAM creates; never deploy to mainnet from this repo.

import { NearBindgen, near, call, view, initialize, LookupMap, Vector, assert } from 'near-sdk-js';

class Invoice {
  job: string = '';
  contractor: string = '';
  client: string = '';
  amountYocto: string = '0'; // string: yoctoNEAR exceeds JS number range
  status: string = 'Created'; // Created | Funded | Released | Cancelled
}

@NearBindgen({ requireInit: true })
export class PaidInFull {
  invoices: LookupMap<Invoice> = new LookupMap('invoices-v1');
  ids: Vector<string> = new Vector('invoice-ids-v1');

  @initialize({ privateFunction: true })
  init() {}

  @call({})
  create_invoice({ invoice_id, job, contractor, amount_yocto }: { invoice_id: string; job: string; contractor: string; amount_yocto: string }) {
    assert(this.invoices.get(invoice_id) === null, 'invoice already exists');
    assert(BigInt(amount_yocto) > 0n, 'amount must be positive');
    const inv = new Invoice();
    inv.job = job;
    inv.contractor = contractor;
    inv.amountYocto = amount_yocto;
    this.invoices.set(invoice_id, inv);
    this.ids.push(invoice_id);
    near.log(`invoice ${invoice_id} created: ${job}, amount ${amount_yocto} yocto`);
  }

  @call({ payableFunction: true })
  approve_and_fund({ invoice_id }: { invoice_id: string }) {
    const inv = this._get(invoice_id);
    assert(inv.status === 'Created', `cannot fund an invoice in status ${inv.status}`);
    const deposit = near.attachedDeposit();
    assert(deposit === BigInt(inv.amountYocto), 'attached deposit must equal the invoice amount exactly');
    inv.client = near.predecessorAccountId();
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

  @call({})
  cancel({ invoice_id }: { invoice_id: string }) {
    const inv = this._get(invoice_id);
    assert(inv.status === 'Funded', `cannot cancel an invoice in status ${inv.status}`);
    assert(near.predecessorAccountId() === inv.client, 'only the client who funded this invoice can cancel it');
    inv.status = 'Cancelled';
    this.invoices.set(invoice_id, inv);
    const promise = near.promiseBatchCreate(inv.client);
    near.promiseBatchActionTransfer(promise, BigInt(inv.amountYocto));
    near.log(`invoice ${invoice_id} cancelled, refunded to ${inv.client}`);
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
