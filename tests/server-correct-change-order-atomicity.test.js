// Server-level tests for the /api/correct and /api/change-order atomicity
// fix (v3 fix round, worker A):
//
// Before the fix, both routes mutated the clerk FIRST and only then called
// ledger.voidApproval — which throws for a Funded/Released escrow. So a
// correction on a PAID invoice returned 400 ("cannot void approval for
// escrow in status Released") BUT the clerk had already rewritten the
// paid invoice as 'quoted' at the lowered total: desk state corrupted,
// no double-spend possible (the ledger still refused) but the record
// was wrong. After the fix the routes are ledger-first with snapshot
// rollback (mirroring /api/approve): a failed route leaves NO clerk
// mutation persisted.
//
// The funded/paid distinction: a funded-but-unreleased invoice still
// shows clerk status 'approved' (the clerk cannot see funding), so the
// clerk guard alone cannot refuse it — the ledger void, run BEFORE the
// clerk mutates, is the lock there. Correcting a merely-approved
// (unfunded) invoice stays allowed: the correction voids that approval
// (the F1 approve -> correct -> re-approve flow, covered by
// server-approve-correct-reapprove.test.js, which must stay green).
//
// Run from the project root:  npm test     (node --test tests/*.test.js)
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const clerk = require('../app/clerk');

const PROJECT_ROOT = path.join(__dirname, '..');
let portCounter = 3744;

function startServer() {
  const port = portCounter;
  portCounter += 1;
  const child = spawn('node', ['app/server.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  return { child, base: `http://localhost:${port}` };
}

async function waitForServer(child, base, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${base}/api/invoices`);
      if (res.ok) return;
    } catch (e) {
      if (Date.now() > deadline) throw new Error(`server did not start in ${timeoutMs}ms: ${e.message}`);
      if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    }
    if (Date.now() > deadline) throw new Error(`server did not answer in ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

function makeClient(base) {
  async function post(route, body) {
    const res = await fetch(`${base}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }
  async function get(route) {
    const res = await fetch(`${base}${route}`);
    return { status: res.status, body: await res.json() };
  }
  return { post, get };
}

// Create an invoice and return its id. Default: the demo's flagged
// $12,400 invoice against a $12,000 approved sum.
async function createInvoice(client, lineItems, approvedSumCents) {
  const created = await client.post('/api/invoices', {
    jobName: 'Bathroom remodel',
    client: 'homeowner',
    contractor: 'gulf-coast-crew',
    lineItems: lineItems || [{ description: 'Tile', qty: 1, unitPriceCents: 12400_00 }],
    approvedSumCents: approvedSumCents === undefined ? 12000_00 : approvedSumCents,
  });
  assert.equal(created.status, 201, `create failed: ${JSON.stringify(created.body)}`);
  return created.body.id;
}

async function getInvoice(client, id) {
  const all = await client.get('/api/invoices');
  assert.equal(all.status, 200);
  const inv = all.body.find((i) => i.id === id);
  assert.ok(inv, `invoice ${id} not found`);
  return inv;
}

// Drive an invoice to FUNDED (approved, not yet released).
async function driveToFunded(client, id) {
  const checked = await client.post('/api/check', { invoiceId: id });
  assert.equal(checked.status, 200);
  const approved = await client.post('/api/approve', { invoiceId: id, approvedBy: 'Chris' });
  assert.equal(approved.status, 200, `approve failed: ${JSON.stringify(approved.body)}`);
  const funded = await client.post('/api/fund', { invoiceId: id });
  assert.equal(funded.status, 200, `fund failed: ${JSON.stringify(funded.body)}`);
  return funded.body;
}

// Drive an invoice to PAID (funded, then released).
async function driveToPaid(client, id) {
  await driveToFunded(client, id);
  const released = await client.post('/api/release', { invoiceId: id });
  assert.equal(released.status, 200, `release failed: ${JSON.stringify(released.body)}`);
  return released.body;
}

test('(a) correct on a PAID invoice is rejected and the clerk state is unchanged', async () => {
  const { child, base } = startServer();
  const client = makeClient(base);
  try {
    await waitForServer(child, base);
    const id = await createInvoice(client,
      [{ description: 'Tile', qty: 1, unitPriceCents: 12000_00 }], 12000_00);
    await driveToPaid(client, id);

    const before = await getInvoice(client, id);
    assert.equal(before.status, 'paid');
    assert.equal(before.totalCents, 12000_00);
    assert.equal(before.approvedSumCents, 12000_00);
    assert.equal(before.changeOrders.length, 0);

    const corrected = await client.post('/api/correct', {
      invoiceId: id,
      correctedTotalCents: 11500_00,
      correctedBy: 'Chris',
      note: 'repriced after payment',
    });
    assert.equal(corrected.status, 400, `correct on a paid invoice must fail, got: ${JSON.stringify(corrected.body)}`);
    assert.match(corrected.body.error, /paid/);

    // The bug, before the fix: the 400 above still left the invoice
    // rewritten as 'quoted' at $11,500. Now it must be untouched.
    const after = await getInvoice(client, id);
    assert.equal(after.status, 'paid');
    assert.equal(after.totalCents, 12000_00);
    assert.equal(after.approvedSumCents, 12000_00);
    assert.equal(after.changeOrders.length, 0);
    assert.equal(after.history.length, before.history.length);
  } finally {
    child.kill();
  }
});

test('(b) change-order on a PAID invoice is rejected and the clerk state is unchanged', async () => {
  const { child, base } = startServer();
  const client = makeClient(base);
  try {
    await waitForServer(child, base);
    const id = await createInvoice(client,
      [{ description: 'Tile', qty: 1, unitPriceCents: 12000_00 }], 12000_00);
    await driveToPaid(client, id);

    const before = await getInvoice(client, id);
    assert.equal(before.status, 'paid');

    const changed = await client.post('/api/change-order', {
      invoiceId: id,
      changeOrder: { description: 'Extra work', amountCents: 500_00 },
      approvedBy: 'Chris',
    });
    assert.equal(changed.status, 400, `change-order on a paid invoice must fail, got: ${JSON.stringify(changed.body)}`);
    assert.match(changed.body.error, /paid|frozen/);

    const after = await getInvoice(client, id);
    assert.equal(after.status, 'paid');
    assert.equal(after.totalCents, 12000_00);
    assert.equal(after.approvedSumCents, 12000_00);
    assert.equal(after.changeOrders.length, 0);
    assert.equal(after.history.length, before.history.length);
  } finally {
    child.kill();
  }
});

test('(c) correct on a FUNDED (approved, not yet released) invoice is rejected and the clerk state is unchanged', async () => {
  const { child, base } = startServer();
  const client = makeClient(base);
  try {
    await waitForServer(child, base);
    const id = await createInvoice(client,
      [{ description: 'Tile', qty: 1, unitPriceCents: 12000_00 }], 12000_00);
    await driveToFunded(client, id);

    const before = await getInvoice(client, id);
    assert.equal(before.status, 'approved');
    assert.equal(before.totalCents, 12000_00);

    const corrected = await client.post('/api/correct', {
      invoiceId: id,
      correctedTotalCents: 11500_00,
      correctedBy: 'Chris',
      note: 'repriced after funding',
    });
    assert.equal(corrected.status, 400, `correct on a funded invoice must fail, got: ${JSON.stringify(corrected.body)}`);
    assert.match(corrected.body.error, /Funded/);

    const after = await getInvoice(client, id);
    assert.equal(after.status, 'approved');
    assert.equal(after.totalCents, 12000_00);
    assert.equal(after.approvedBy, 'Chris');
    assert.equal(after.changeOrders.length, 0);
    assert.equal(after.history.length, before.history.length);
  } finally {
    child.kill();
  }
});

test('(d) change-order on a FUNDED (approved, not yet released) invoice is rejected', async () => {
  const { child, base } = startServer();
  const client = makeClient(base);
  try {
    await waitForServer(child, base);
    const id = await createInvoice(client,
      [{ description: 'Tile', qty: 1, unitPriceCents: 12000_00 }], 12000_00);
    await driveToFunded(client, id);

    const before = await getInvoice(client, id);
    assert.equal(before.status, 'approved');

    const changed = await client.post('/api/change-order', {
      invoiceId: id,
      changeOrder: { description: 'Extra work', amountCents: 500_00 },
      approvedBy: 'Chris',
    });
    assert.equal(changed.status, 400, `change-order on a funded invoice must fail, got: ${JSON.stringify(changed.body)}`);
    assert.match(changed.body.error, /already approved|frozen/);

    const after = await getInvoice(client, id);
    assert.equal(after.status, 'approved');
    assert.equal(after.approvedSumCents, 12000_00);
    assert.equal(after.changeOrders.length, 0);
    assert.equal(after.history.length, before.history.length);
  } finally {
    child.kill();
  }
});

test('(e) correct-before-approval succeeds and the corrected amount is what funds', async () => {
  const { child, base } = startServer();
  const client = makeClient(base);
  try {
    await waitForServer(child, base);
    // The demo's flagged invoice: $12,400 against a $12,000 approval.
    const id = await createInvoice(client);
    const checked = await client.post('/api/check', { invoiceId: id });
    assert.equal(checked.status, 200);
    assert.equal(checked.body.check.flagged, true);

    const corrected = await client.post('/api/correct', {
      invoiceId: id,
      correctedTotalCents: 11500_00,
      correctedBy: 'Chris',
      note: 'drain reroute re-quoted separately',
    });
    assert.equal(corrected.status, 200, `correct failed: ${JSON.stringify(corrected.body)}`);
    assert.equal(corrected.body.invoice.status, 'quoted');
    assert.equal(corrected.body.invoice.totalCents, 11500_00);
    assert.equal(corrected.body.check.flagged, false);

    const approved = await client.post('/api/approve', { invoiceId: id, approvedBy: 'Chris' });
    assert.equal(approved.status, 200, `approve failed: ${JSON.stringify(approved.body)}`);

    // Fund moves the CORRECTED total ($11,500), not $12,400 or $12,000:
    // homeowner started with $100,000 simulated test funds.
    const funded = await client.post('/api/fund', { invoiceId: id });
    assert.equal(funded.status, 200, `fund failed: ${JSON.stringify(funded.body)}`);
    assert.equal(funded.body.escrow.status, 'Funded');
    assert.equal(funded.body.escrow.amountCents, 11500_00);
    assert.equal(funded.body.escrow.approvedSumCents, 12000_00);
    assert.equal(funded.body.balances.homeowner, 100000_00 - 11500_00);
  } finally {
    child.kill();
  }
});

test('(f) change-order-before-approval succeeds and the invoice then funds at its total', async () => {
  const { child, base } = startServer();
  const client = makeClient(base);
  try {
    await waitForServer(child, base);
    // The demo's flagged invoice: $12,400 against a $12,000 approval.
    const id = await createInvoice(client);
    const checked = await client.post('/api/check', { invoiceId: id });
    assert.equal(checked.status, 200);
    assert.equal(checked.body.check.flagged, true);

    const changed = await client.post('/api/change-order', {
      invoiceId: id,
      changeOrder: { description: 'Drain reroute', amountCents: 500_00 },
      approvedBy: 'Chris',
    });
    assert.equal(changed.status, 200, `change-order failed: ${JSON.stringify(changed.body)}`);
    assert.equal(changed.body.invoice.status, 'quoted');
    assert.equal(changed.body.invoice.totalCents, 12400_00); // total unchanged — work already billed
    assert.equal(changed.body.approvedContractSumCents, 12500_00); // approved sum rises
    assert.equal(changed.body.check.flagged, false);

    const approved = await client.post('/api/approve', { invoiceId: id, approvedBy: 'Chris' });
    assert.equal(approved.status, 200, `approve failed: ${JSON.stringify(approved.body)}`);

    const funded = await client.post('/api/fund', { invoiceId: id });
    assert.equal(funded.status, 200, `fund failed: ${JSON.stringify(funded.body)}`);
    assert.equal(funded.body.escrow.status, 'Funded');
    assert.equal(funded.body.escrow.amountCents, 12400_00);
    assert.equal(funded.body.escrow.approvedSumCents, 12500_00);
    assert.equal(funded.body.balances.homeowner, 100000_00 - 12400_00);
  } finally {
    child.kill();
  }
});

// Clerk-level guards: a paid invoice is closed at the clerk layer too,
// and the rejection throws BEFORE any mutation.
test('clerk: correctInvoiceTotal on a PAID invoice throws and leaves the invoice untouched', () => {
  const inv = clerk.createInvoice({
    jobName: 'Bathroom remodel',
    client: 'homeowner',
    contractor: 'gulf-coast-crew',
    lineItems: [{ description: 'Tile', qty: 1, unitPriceCents: 12000_00 }],
    approvedSumCents: 12000_00,
  });
  clerk.checkAgainstApproved(inv);
  clerk.humanApprove(inv, { approvedBy: 'Chris' });
  clerk.markPaid(inv, 'test release');
  assert.equal(inv.status, 'paid');

  assert.throws(
    () => clerk.correctInvoiceTotal(inv, 11500_00, 'Chris', 'too late'),
    /status "paid"/,
  );
  assert.equal(inv.status, 'paid');
  assert.equal(inv.totalCents, 12000_00);
  assert.equal(inv.changeOrders.length, 0);
});

test('clerk: approveChangeOrder on a PAID invoice throws and leaves the invoice untouched', () => {
  const inv = clerk.createInvoice({
    jobName: 'Bathroom remodel',
    client: 'homeowner',
    contractor: 'gulf-coast-crew',
    lineItems: [{ description: 'Tile', qty: 1, unitPriceCents: 12000_00 }],
    approvedSumCents: 12000_00,
  });
  clerk.checkAgainstApproved(inv);
  clerk.humanApprove(inv, { approvedBy: 'Chris' });
  clerk.markPaid(inv, 'test release');
  assert.equal(inv.status, 'paid');

  assert.throws(
    () => clerk.approveChangeOrder(inv, { description: 'Extra work', amountCents: 100_00 }, 'Chris'),
    /already paid|frozen/,
  );
  assert.equal(inv.status, 'paid');
  assert.equal(inv.approvedSumCents, 12000_00);
  assert.equal(inv.changeOrders.length, 0);
});
