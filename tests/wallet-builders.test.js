// Tests for the live-wallet pure call builders (app/public/wallet.js).
// Run from the project root:  npm test     (node --test tests/)
//
// wallet.js is browser code (an ES module, no static imports), so it is
// loaded here with a dynamic import. NO change to wallet.js was needed to
// make it importable: its only browser touchpoints — the `document` guard
// around initWalletUI and the CDN import inside loadNearApi — never run
// under Node, and Node 22+ detects the module syntax on import.
//
// What is covered: the five builders' exact call shapes, the yocto
// conversions, cap validation (fail fast below the amount), and method
// scoping (the sign-in key may only call the five contract methods).
'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let w;
before(async () => {
  w = await import('../app/public/wallet.js');
});

const CLIENT = 'alice.testnet';
const CONTRACTOR = 'crew.paid-in-full-v3.testnet';
const JOB = 'Weekley bathroom remodel — live testnet invoice';
const GAS_100_TGAS = 100_000_000_000_000n;

function createArgs(overrides = {}) {
  return {
    invoiceId: 'inv-3004',
    job: JOB,
    contractor: CONTRACTOR,
    client: CLIENT,
    amountNear: '0.01',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildCreateInvoice
// ---------------------------------------------------------------------------

test('create builder returns the exact call shape for the default 0.01 NEAR', () => {
  const call = w.buildCreateInvoice(createArgs());
  assert.equal(call.methodName, 'create_invoice');
  assert.deepEqual(call.args, {
    invoice_id: 'inv-3004',
    job: JOB,
    contractor: CONTRACTOR,
    client: CLIENT,
    amount_yocto: '10000000000000000000000', // 0.01 NEAR, exact
  });
  assert.equal(call.gas, GAS_100_TGAS);
  assert.equal(call.attachedDeposit, '0'); // create takes no deposit
});

test('create builder converts whole and fractional NEAR amounts exactly', () => {
  assert.equal(w.buildCreateInvoice(createArgs({ amountNear: '1' })).args.amount_yocto, '1000000000000000000000000');
  assert.equal(w.buildCreateInvoice(createArgs({ amountNear: '1.5' })).args.amount_yocto, '1500000000000000000000000');
  assert.equal(w.buildCreateInvoice(createArgs({ amountNear: '0.000001' })).args.amount_yocto, '1000000000000000000');
  assert.equal(w.buildCreateInvoice(createArgs({ amountNear: '0.000000000000000000000001' })).args.amount_yocto, '1');
});

test('create builder rejects a bad contractor or client account id', () => {
  assert.throws(() => w.buildCreateInvoice(createArgs({ contractor: 'Bad Name' })), /contractor must be a valid NEAR account id/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ contractor: 'UPPER.testnet' })), /contractor must be a valid NEAR account id/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ contractor: 'x' })), /contractor must be a valid NEAR account id/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ client: '' })), /client must be a valid NEAR account id/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ client: 'alice@testnet' })), /client must be a valid NEAR account id/);
});

test('create builder rejects a missing invoice id, job, or amount', () => {
  assert.throws(() => w.buildCreateInvoice(createArgs({ invoiceId: '' })), /an invoice id is required/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ invoiceId: undefined })), /an invoice id is required/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ job: '' })), /a job description is required/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ amountNear: '0' })), /amount must be positive/);
  assert.throws(() => w.buildCreateInvoice(createArgs({ amountNear: 'free' })), /not a NEAR amount/);
});

// ---------------------------------------------------------------------------
// buildClientApprove — cap validation
// ---------------------------------------------------------------------------

test('approve builder passes when the cap equals the amount, cap carried in yocto', () => {
  const call = w.buildClientApprove({ invoiceId: 'inv-3004', capNear: '0.01', amountNear: '0.01' });
  assert.equal(call.methodName, 'client_approve');
  assert.deepEqual(call.args, { invoice_id: 'inv-3004', approved_sum_yocto: '10000000000000000000000' });
  assert.equal(call.gas, GAS_100_TGAS);
  assert.equal(call.attachedDeposit, '0');
});

test('approve builder passes when the cap exceeds the amount — the cap is kept, not clamped', () => {
  const call = w.buildClientApprove({ invoiceId: 'inv-3004', capNear: '0.02', amountNear: '0.01' });
  assert.equal(call.args.approved_sum_yocto, '20000000000000000000000');
});

test('approve builder FAILS FAST when the cap is below the amount — nothing is built', () => {
  assert.throws(
    () => w.buildClientApprove({ invoiceId: 'inv-3004', capNear: '0.009', amountNear: '0.01' }),
    /approved sum \(0.009 NEAR\) must be at least the invoice amount \(0.01 NEAR\)/,
  );
});

test('approve builder rejects a zero, negative, or junk cap or amount', () => {
  assert.throws(() => w.buildClientApprove({ invoiceId: 'inv-3004', capNear: '0', amountNear: '0.01' }), /amount must be positive/);
  assert.throws(() => w.buildClientApprove({ invoiceId: 'inv-3004', capNear: '0.01', amountNear: '-1' }), /not a NEAR amount/);
  assert.throws(() => w.buildClientApprove({ invoiceId: 'inv-3004', capNear: 'lots', amountNear: '0.01' }), /not a NEAR amount/);
  assert.throws(() => w.buildClientApprove({ invoiceId: '', capNear: '0.01', amountNear: '0.01' }), /an invoice id is required/);
});

// ---------------------------------------------------------------------------
// buildApproveAndFund / buildRelease / buildCancel
// ---------------------------------------------------------------------------

test('fund builder attaches EXACTLY the invoice amount as the deposit', () => {
  const call = w.buildApproveAndFund({ invoiceId: 'inv-3004', amountNear: '0.01' });
  assert.equal(call.methodName, 'approve_and_fund');
  assert.deepEqual(call.args, { invoice_id: 'inv-3004' }); // amount rides as the deposit, not an arg
  assert.equal(call.gas, GAS_100_TGAS);
  assert.equal(call.attachedDeposit, '10000000000000000000000');
  assert.throws(() => w.buildApproveAndFund({ invoiceId: '', amountNear: '0.01' }), /an invoice id is required/);
  assert.throws(() => w.buildApproveAndFund({ invoiceId: 'inv-3004', amountNear: '0' }), /amount must be positive/);
});

test('release builder shape: method, args, gas, zero deposit — and it needs an invoice id', () => {
  const call = w.buildRelease({ invoiceId: 'inv-3004' });
  assert.equal(call.methodName, 'release');
  assert.deepEqual(call.args, { invoice_id: 'inv-3004' });
  assert.equal(call.gas, GAS_100_TGAS);
  assert.equal(call.attachedDeposit, '0');
  assert.throws(() => w.buildRelease({ invoiceId: '' }), /an invoice id is required/);
  assert.throws(() => w.buildRelease({}), /an invoice id is required/);
});

test('cancel builder shape: method, args, gas, zero deposit — and it needs an invoice id', () => {
  const call = w.buildCancel({ invoiceId: 'inv-3004' });
  assert.equal(call.methodName, 'cancel');
  assert.deepEqual(call.args, { invoice_id: 'inv-3004' });
  assert.equal(call.gas, GAS_100_TGAS);
  assert.equal(call.attachedDeposit, '0');
  assert.throws(() => w.buildCancel({ invoiceId: '' }), /an invoice id is required/);
});

// ---------------------------------------------------------------------------
// Method scoping, purity, amount helpers, constants
// ---------------------------------------------------------------------------

test('method scoping: every builder method is in METHOD_NAMES, and the scope is exactly the five contract methods', () => {
  assert.deepEqual(w.METHOD_NAMES, ['create_invoice', 'client_approve', 'approve_and_fund', 'release', 'cancel']);
  for (const call of [
    w.buildCreateInvoice(createArgs()),
    w.buildClientApprove({ invoiceId: 'inv-3004', capNear: '0.01', amountNear: '0.01' }),
    w.buildApproveAndFund({ invoiceId: 'inv-3004', amountNear: '0.01' }),
    w.buildRelease({ invoiceId: 'inv-3004' }),
    w.buildCancel({ invoiceId: 'inv-3004' }),
  ]) {
    assert.ok(w.METHOD_NAMES.includes(call.methodName), `${call.methodName} is outside the sign-in scope`);
  }
});

test('builders are pure: two identical builds are equal but independent objects', () => {
  const a = w.buildCreateInvoice(createArgs());
  const b = w.buildCreateInvoice(createArgs());
  assert.deepEqual(a, b);
  a.args.job = 'mutated';
  assert.notEqual(b.args.job, 'mutated');
  assert.notEqual(a.args, b.args);
});

test('nearToYocto / yoctoToNear round-trip exactly, including zero', () => {
  for (const near of ['0.01', '1', '1.5', '0.000001', '123.456', '0.000000000000000000000001']) {
    assert.equal(w.yoctoToNear(w.nearToYocto(near)), near, `round-trip failed for ${near}`);
  }
  assert.equal(w.yoctoToNear('0'), '0');
  assert.equal(w.yoctoToNear('10000000000000000000000'), '0.01');
});

test('nearToYocto rejects zero, negatives, junk, and more than 24 decimal places', () => {
  assert.throws(() => w.nearToYocto('0'), /amount must be positive/);
  assert.throws(() => w.nearToYocto('0.0'), /amount must be positive/);
  assert.throws(() => w.nearToYocto('-1'), /not a NEAR amount/);
  assert.throws(() => w.nearToYocto('1.2.3'), /not a NEAR amount/);
  assert.throws(() => w.nearToYocto(''), /not a NEAR amount/);
  assert.throws(() => w.nearToYocto('0.0000000000000000000000001'), /more than 24 decimal places/);
  assert.throws(() => w.yoctoToNear('-1'), /negative yocto amount/);
});

test('base64 helpers round-trip — the view-call arg encoding', () => {
  const json = JSON.stringify({ invoice_id: 'inv-3004' });
  assert.equal(w.utf8ToBase64(json), Buffer.from(json, 'utf8').toString('base64'));
  const unicode = 'Weekley — remodel ✓';
  assert.equal(w.bytesToUtf8(Buffer.from(w.utf8ToBase64(unicode), 'base64')), unicode);
});

test('constants: the v3 contract, the small testnet default, and the default job', () => {
  assert.equal(w.CONTRACT_ID, 'paid-in-full-v3.testnet');
  assert.equal(w.DEFAULT_AMOUNT_NEAR, '0.01');
  assert.equal(w.DEFAULT_CONTRACTOR, 'crew.paid-in-full-v3.testnet');
  assert.equal(w.DEFAULT_JOB, JOB);
  assert.equal(w.GAS, GAS_100_TGAS);
});
