// Integration test: deploys the REAL compiled contract
// (build/paid-in-full.wasm) into a local NEAR sandbox (near-workspaces)
// and runs the full escrow flow against it. No testnet account, no
// network, no real funds — the sandbox chain is local and disposable.
//
// Run:  node tests-sandbox/run.mjs     (from the contract/ folder)
// Requires: npm install (near-workspaces downloads the sandbox binary
// on first use).
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
  amount_yocto: AMOUNT,
});
let inv = await contract.view('get_invoice', { invoice_id: 'inv-0001' });
assert.equal(inv.status, 'Created');
console.log('create_invoice OK — status:', inv.status);

// Wrong deposit must fail (approval is the exact deposit, nothing else).
await assert.rejects(
  client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0001' }, { attachedDeposit: '500000000000000000000000' }),
);
console.log('under-deposit correctly rejected');

await client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0001' }, { attachedDeposit: AMOUNT });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0001' });
assert.equal(inv.status, 'Funded');
assert.equal(inv.client, client.accountId);
console.log('approve_and_fund OK — status:', inv.status, '| client:', inv.client);

// The contractor cannot release someone else's escrow.
await assert.rejects(crew.call(contract, 'release', { invoice_id: 'inv-0001' }));
console.log('release by non-client correctly rejected');

const crewBefore = BigInt((await crew.account.getAccountBalance()).available);
await client.call(contract, 'release', { invoice_id: 'inv-0001' });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0001' });
assert.equal(inv.status, 'Released');
const crewAfter = BigInt((await crew.account.getAccountBalance()).available);
assert.ok(crewAfter > crewBefore, 'contractor balance must increase after release');
console.log('release OK — contractor received ~1 test NEAR (sandbox funds)');

// Cancel path refunds the client.
await crew.call(contract, 'create_invoice', {
  invoice_id: 'inv-0002', job: 'Fence repair', contractor: crew.accountId, amount_yocto: AMOUNT,
});
await client.call(contract, 'approve_and_fund', { invoice_id: 'inv-0002' }, { attachedDeposit: AMOUNT });
await client.call(contract, 'cancel', { invoice_id: 'inv-0002' });
inv = await contract.view('get_invoice', { invoice_id: 'inv-0002' });
assert.equal(inv.status, 'Cancelled');
console.log('cancel OK — status:', inv.status);

await worker.tearDown();
console.log('\nALL SANDBOX CONTRACT TESTS PASSED');
