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

// Cancel path refunds the client.
await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0002', job: 'Fence repair', contractor: crew.accountId, client: client.accountId, amount_yocto: AMOUNT,
});
await client.call(contract, 'client_approve', { invoice_id: 'inv-0002', approved_sum_yocto: AMOUNT });
await client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0002' }, { attachedDeposit: AMOUNT });
await client.call(contract, 'cancel', { invoice_id: 'inv-0002' });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0002' });
assert.equal(inv.status, 'Cancelled');
console.log('cancel OK — status:', inv.status);

// The cap binds: an invoice over the approved sum cannot be funded,
// even after approval. (The $12,400 invoice against a $12,000 approval.)
const OVER = '1240000000000000000000000000000'; // 1,240 NEAR in yocto
const CAP = '1200000000000000000000000000000'; // 1,200 NEAR in yocto
await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0003', job: 'Over the approved sum', contractor: crew.accountId, client: client.accountId, amount_yocto: OVER,
});
await client.call(contract, 'client_approve', { invoice_id: 'inv-0003', approved_sum_yocto: CAP });
await assert.rejects(
  client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0003' }, { attachedDeposit: OVER }),
);
inv = await contract.view('get_invoice', { invoice_id: 'inv-0003' });
assert.equal(inv.status, 'Created');
console.log('fund over the cap correctly rejected — status still:', inv.status);

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

await worker.tearDown();
console.log('\nALL SANDBOX CONTRACT TESTS PASSED');
