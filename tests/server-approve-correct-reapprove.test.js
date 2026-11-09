// Server-level test for the F1 approval seam (Rowan's v2 re-review):
// approve -> correct -> re-approve, driven end to end over HTTP against
// a real spawned server (not the unit-level clerk/ledger, which exercise
// the two layers separately and let this seam survive).
//
// Before the fix, the correction voided only the clerk approval: the
// ledger kept approved=true with the old cap, so re-approve returned
// 400 "escrow is already approved" while leaving the clerk approved,
// and /api/fund then succeeded on the stale ledger approval.
// After the fix, re-approve succeeds (200) and the fund moves the
// CORRECTED total under the CURRENT approval.
//
// Run from the project root:  npm test     (node --test tests/*.test.js)
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

const PORT = 3743;
const BASE = `http://localhost:${PORT}`;
const PROJECT_ROOT = path.join(__dirname, '..');

async function post(route, body) {
  const res = await fetch(`${BASE}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function waitForServer(child, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/invoices`);
      if (res.ok) return;
    } catch (e) {
      if (Date.now() > deadline) throw new Error(`server did not start in ${timeoutMs}ms: ${e.message}`);
      if (child.exitCode !== null) throw new Error(`server exited early with code ${child.exitCode}`);
    }
    if (Date.now() > deadline) throw new Error(`server did not answer in ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('server: approve -> correct -> re-approve succeeds and fund uses the corrected total', async () => {
  const child = spawn('node', ['app/server.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  try {
    await waitForServer(child);

    // Create an unflagged $12,000 invoice (total == approved sum).
    const created = await post('/api/invoices', {
      jobName: 'Bathroom remodel',
      client: 'homeowner',
      contractor: 'gulf-coast-crew',
      lineItems: [{ description: 'Tile', qty: 1, unitPriceCents: 12000_00 }],
      approvedSumCents: 12000_00,
    });
    assert.equal(created.status, 201, `create failed: ${JSON.stringify(created.body)}`);
    const id = created.body.id;

    const checked = await post('/api/check', { invoiceId: id });
    assert.equal(checked.status, 200);
    assert.equal(checked.body.check.flagged, false);

    const approved = await post('/api/approve', { invoiceId: id, approvedBy: 'Chris' });
    assert.equal(approved.status, 200, `first approve failed: ${JSON.stringify(approved.body)}`);
    assert.equal(approved.body.status, 'approved');

    // Correct down to $11,500: clerk approval is voided, and the ledger
    // approval must be voided with it — funding now must fail.
    const corrected = await post('/api/correct', {
      invoiceId: id,
      correctedTotalCents: 11500_00,
      correctedBy: 'Chris',
      note: 'repriced',
    });
    assert.equal(corrected.status, 200);
    assert.equal(corrected.body.invoice.status, 'quoted');
    assert.equal(corrected.body.invoice.totalCents, 11500_00);

    const fundBeforeReapprove = await post('/api/fund', { invoiceId: id });
    assert.equal(fundBeforeReapprove.status, 400, `fund on a voided approval must fail, got: ${JSON.stringify(fundBeforeReapprove.body)}`);

    const rechecked = await post('/api/check', { invoiceId: id });
    assert.equal(rechecked.status, 200);
    assert.equal(rechecked.body.check.flagged, false);

    // The F1 regression: before the fix this returned 400 "escrow is
    // already approved" (stale ledger approval) and left the clerk
    // approved by the failed call.
    const reapproved = await post('/api/approve', { invoiceId: id, approvedBy: 'Chris' });
    assert.equal(reapproved.status, 200, `re-approve failed: ${JSON.stringify(reapproved.body)}`);
    assert.equal(reapproved.body.status, 'approved');
    assert.equal(reapproved.body.totalCents, 11500_00);

    // Fund uses the CURRENT approval (cap = current approved sum
    // $12,000) and moves the CORRECTED total ($11,500), not $12,000:
    // homeowner started with $100,000 simulated test funds.
    const funded = await post('/api/fund', { invoiceId: id });
    assert.equal(funded.status, 200, `fund failed: ${JSON.stringify(funded.body)}`);
    assert.equal(funded.body.escrow.status, 'Funded');
    assert.equal(funded.body.escrow.amountCents, 11500_00);
    assert.equal(funded.body.escrow.approved, true);
    assert.equal(funded.body.escrow.approvedSumCents, 12000_00);
    assert.equal(funded.body.balances.homeowner, 100000_00 - 11500_00);
    assert.equal(funded.body.balances.crew, 0);
  } finally {
    child.kill();
  }
});
