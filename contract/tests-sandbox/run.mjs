// Integration test: deploys the REAL compiled contract
// (build/paid-in-full.wasm) into a local NEAR sandbox (near-workspaces)
// and runs the full escrow flow against it. No testnet account, no
// network, no real funds — the sandbox chain is local and disposable.
//
// Run:  node tests-sandbox/run.mjs     (from the contract/ folder)
// Requires: npm install (near-workspaces downloads the sandbox binary
// on first use).
//
// The gate under test: funding requires the recorded client's approval,
// and the approval sets an approved-sum CAP. create_invoice records the
// client; client_approve (recorded client only, Created only) sets the
// approval AND the cap; approve_and_fund asserts the approval, the caller
// is the recorded client, AND the amount does not exceed the cap.
import { Worker } from 'near-workspaces';
import assert from 'node:assert/strict';

const worker = await Worker.init();
const root = worker.rootAccount;
const contract = await root.createSubAccount('paidinfull');
const client = await root.createSubAccount('homeowner');
const crew = await root.createSubAccount('crew');

await contract.deploy('build/paid-in-full.wasm');
await contract.call(contract, 'init', {});

const AMOUNT = '1000000000000000000000000'; // 1 NEAR in yocto

await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0001',
  job: 'Bathroom remodel — final invoice',
  contractor: crew.accountId,
  client: client.accountId,
  amount_yocto: AMOUNT,
});
let inv = await contract.view('get_invoice', { invoice_id: 'inv-0001' });
assert.equal(inv.status, 'Created');
assert.equal(inv.approved, false);
assert.equal(inv.client, client.accountId);
console.log('create_invoice OK — status:', inv.status, '| client:', inv.client, '| approved:', inv.approved);

// The contractor cannot approve — only the recorded client can.
await assert.rejects(crew.call(contract, 'client_approve', { invoice_id: 'inv-0001' }));
console.log('client_approve by non-client correctly rejected');

// Funding WITHOUT approval must fail — the gate binds.
await assert.rejects(
  client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0001' }, { attachedDeposit: AMOUNT }),
);
console.log('fund without approval correctly rejected');

// The recorded client approves, setting the cap to 1 NEAR (the amount).
await client.call(contract, 'client_approve', { invoice_id: 'inv-0001', approved_sum_yocto: AMOUNT });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0001' });
assert.equal(inv.approved, true);
assert.equal(inv.approvedSumYocto, AMOUNT);
console.log('client_approve OK — approved:', inv.approved, '| cap:', inv.approvedSumYocto);

// A second approval fails.
await assert.rejects(client.call(contract, 'client_approve', { invoice_id: 'inv-0001', approved_sum_yocto: AMOUNT }));
console.log('double approval correctly rejected');

// Wrong deposit must fail (approval is the exact deposit, nothing else).
await assert.rejects(
  client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0001' }, { attachedDeposit: '500000000000000000000000' }),
);
console.log('under-deposit correctly rejected');

// Funding by a NON-recorded client must fail even after approval.
await assert.rejects(
  crew.call(contract, 'approve_and_fund', { invoice_id: 'inv-0001' }, { attachedDeposit: AMOUNT }),
);
console.log('fund by non-recorded client correctly rejected');

await client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0001' }, { attachedDeposit: AMOUNT });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0001' });
assert.equal(inv.status, 'Funded');
assert.equal(inv.client, client.accountId);
console.log('approve_and_fund OK — status:', inv.status, '| client:', inv.client);

// The contractor cannot release someone else's escrow.
await assert.rejects(crew.call(contract, 'release', { invoice_id: 'inv-0001' }));
console.log('release by non-client correctly rejected');

// near-workspaces v4: the subaccount IS a NearAccount — balance() returns
// an AccountBalance whose .available is a NEAR (yocto as a decimal string).
// (The v3 spelling crew.account.getAccountBalance() no longer exists.)
const crewBefore = BigInt((await crew.balance()).available.toString());
await client.call(contract, 'release', { invoice_id: 'inv-0001' });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0001' });
assert.equal(inv.status, 'Released');
const crewAfter = BigInt((await crew.balance()).available.toString());
assert.ok(crewAfter > crewBefore, 'contractor balance must increase after release');
console.log('release OK — contractor received ~1 test NEAR (sandbox funds)');

// Cancel path refunds the client in full.
await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0002', job: 'Fence repair', contractor: crew.accountId, client: client.accountId, amount_yocto: AMOUNT,
});
await client.call(contract, 'client_approve', { invoice_id: 'inv-0002', approved_sum_yocto: AMOUNT });
await client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0002' }, { attachedDeposit: AMOUNT });
const clientBeforeCancel = BigInt((await client.balance()).available.toString());
await client.call(contract, 'cancel', { invoice_id: 'inv-0002' });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0002' });
assert.equal(inv.status, 'Cancelled');
const clientAfterCancel = BigInt((await client.balance()).available.toString());
// Refund in full: the client gets the whole 1 NEAR back, minus only the
// gas of the cancel call itself (allow 0.05 NEAR for gas).
assert.ok(
  clientAfterCancel >= clientBeforeCancel + BigInt(AMOUNT) - BigInt('50000000000000000000000'),
  'cancel-from-Funded must refund the full amount',
);
console.log('cancel-from-Funded OK — status:', inv.status, '| client refunded in full');

// The cap binds at APPROVAL now, not only at funding: a cap below the
// invoice amount fails fast in client_approve with a clear error, records
// nothing (the NEAR panic rolls the call back), and the client can retry
// with a correct cap. (The $12,400 invoice against a $12,000 approval,
// scaled to 12.4 / 12 NEAR so the sandbox subaccounts — ~100 NEAR each —
// can actually fund the retry.)
// NOTE: with the approval-time check, the funding-time cap check in
// approve_and_fund can no longer be reached through the normal path — it
// stays in the contract as defence in depth.
const OVER = '12400000000000000000000000'; // 12.4 NEAR in yocto
const CAP = '12000000000000000000000000'; // 12 NEAR in yocto
await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0003', job: 'Over the approved sum', contractor: crew.accountId, client: client.accountId, amount_yocto: OVER,
});
await assert.rejects(
  client.call(contract, 'client_approve', { invoice_id: 'inv-0003', approved_sum_yocto: CAP }),
  (err) => {
    assert.match(String(err), /approved sum must be at least the invoice amount/);
    return true;
  },
);
inv = await contract.view('get_invoice', { invoice_id: 'inv-0003' });
assert.equal(inv.approved, false, 'failed approval must record nothing — approved stays false');
assert.equal(inv.approvedSumYocto, '0', 'failed approval must record nothing — cap stays 0');
assert.equal(inv.status, 'Created');
console.log('low-cap approve rejected with the clear error — approved:', inv.approved, '| cap:', inv.approvedSumYocto, '| status:', inv.status);

// Retry with a correct cap succeeds — the invoice is NOT bricked.
await client.call(contract, 'client_approve', { invoice_id: 'inv-0003', approved_sum_yocto: OVER });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0003' });
assert.equal(inv.approved, true);
assert.equal(inv.approvedSumYocto, OVER);
await client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0003' }, { attachedDeposit: OVER });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0003' });
assert.equal(inv.status, 'Funded');
console.log('retry with a correct cap OK — approved, then funded');

// Contractor validation: an empty or malformed contractor is rejected.
await assert.rejects(crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0004', job: 'Bad contractor', contractor: '', client: client.accountId, amount_yocto: AMOUNT,
}));
await assert.rejects(crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0004', job: 'Bad contractor', contractor: 'has space', client: client.accountId, amount_yocto: AMOUNT,
}));
console.log('invalid contractor correctly rejected');

// Double-fund, double-release, cancel-after-release: the guards exist
// in code and are exercised here.
await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0005', job: 'Double transitions', contractor: crew.accountId, client: client.accountId, amount_yocto: AMOUNT,
});
await client.call(contract, 'client_approve', { invoice_id: 'inv-0005', approved_sum_yocto: AMOUNT });
await client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0005' }, { attachedDeposit: AMOUNT });
await assert.rejects(
  client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0005' }, { attachedDeposit: AMOUNT }),
);
console.log('fund twice correctly rejected');
await client.call(contract, 'release', { invoice_id: 'inv-0005' });
await assert.rejects(client.call(contract, 'release', { invoice_id: 'inv-0005' }));
console.log('release twice correctly rejected');
await assert.rejects(client.call(contract, 'cancel', { invoice_id: 'inv-0005' }));
console.log('cancel after release correctly rejected');

// Cancel from Created: an unfunded invoice can be cancelled, and no
// funds move — the contract holds no escrow for it. Covers both an
// unapproved invoice and an approved-but-unfunded one.
await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0006', job: 'Unfunded cancel', contractor: crew.accountId, client: client.accountId, amount_yocto: AMOUNT,
});
const contractBefore = BigInt((await contract.balance()).available.toString());
const clientBeforeUnfundedCancel = BigInt((await client.balance()).available.toString());
await client.call(contract, 'cancel', { invoice_id: 'inv-0006' });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0006' });
assert.equal(inv.status, 'Cancelled');
const contractAfter = BigInt((await contract.balance()).available.toString());
const clientAfterUnfundedCancel = BigInt((await client.balance()).available.toString());
// No escrow exists for an unfunded invoice, so no refund can move: the
// client must NOT gain the invoice amount, and the contract must NOT lose
// it. (Exact-zero equality is not asserted: a cancel call still executes
// a receipt, and sandbox gas accounting can shift the contract's
// available balance by gas-scale dust — the run showed +0.000257 NEAR.
// The invariant that matters is that no 1-NEAR refund moves either way.)
const dust = BigInt('10000000000000000000000'); // 0.01 NEAR
assert.ok(contractAfter >= contractBefore - dust, 'cancel-from-Created must not drain the contract');
assert.ok(clientAfterUnfundedCancel <= clientBeforeUnfundedCancel, 'cancel-from-Created must not refund the client');
console.log('cancel-from-Created (unapproved) OK — status:', inv.status, '| no refund moved');

await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0007', job: 'Approved but unfunded cancel', contractor: crew.accountId, client: client.accountId, amount_yocto: AMOUNT,
});
await client.call(contract, 'client_approve', { invoice_id: 'inv-0007', approved_sum_yocto: AMOUNT });
// A stranger cannot cancel even an unfunded invoice.
await assert.rejects(crew.call(contract, 'cancel', { invoice_id: 'inv-0007' }));
inv = await contract.view('get_invoice', { invoice_id: 'inv-0007' });
assert.equal(inv.status, 'Created', 'stranger cancel must leave the invoice untouched');
console.log('stranger cancel-from-Created correctly rejected — status still:', inv.status);
await client.call(contract, 'cancel', { invoice_id: 'inv-0007' });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0007' });
assert.equal(inv.status, 'Cancelled');
console.log('cancel-from-Created (approved, unfunded) OK — status:', inv.status);

await worker.tearDown();
console.log('\nALL SANDBOX CONTRACT TESTS PASSED');
