// wallet.js — LIVE wallet write path for the Paid in Full demo (section 6).
//
// This is the ONLY client code that signs transactions. Everything in
// sections 1–4 stays a local simulation; section 5 stays read-only. This
// module lets a judge connect a real NEAR testnet wallet (MyNearWallet)
// and run the real contract methods — create_invoice, client_approve,
// approve_and_fund, release, cancel — against the deployed contract
// paid-in-full-v3.testnet, with signed transactions.
//
// AMOUNT HONESTY: the desk invoice in sections 1–4 is $12,000 USD and is
// SIMULATED. The live wallet invoice uses a small testnet amount — 0.01
// NEAR by default — and the UI labels it plainly as such. The $12,000
// sim invoice is never presented as having moved on-chain.
//
// DESIGN (kept simple, per Chris's rule — one small module, plain
// functions, no bundler, server stays zero-dependency):
//   - near-api-js 5.1.1 is loaded from the esm.sh CDN with a DYNAMIC
//     import, lazily, only when the user clicks Connect. No build step,
//     no bundler, no dependency added to the demo server.
//   - WalletConnection (near-api-js) + MyNearWallet testnet redirect —
//     NOT Wallet Selector: the Selector needs @near-wallet-selector/core
//     + modal-ui + wallet modules (several packages, CSS, a modal state
//     machine) for one demo section. WalletConnection is one import, one
//     redirect, and its requestSignIn + functionCall API is exactly the
//     five calls this section needs.
//   - The pure call builders (buildCreateInvoice, buildClientApprove,
//     buildApproveAndFund, buildRelease, buildCancel) have NO dependency
//     on near-api-js at all, so they are unit-testable in plain Node and
//     so the Node proof drives the EXACT same call shapes the UI makes.
//   - Reads after each write go straight to the testnet RPC with plain
//     fetch (same shape as app/onchain.js) — no wallet needed to read.
//
// The module has no static imports, so Node can import it for tests
// (the CDN import only runs inside loadNearApi, in a browser).
'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONTRACT_ID = 'paid-in-full-v3.testnet';
const NETWORK_ID = 'testnet';
const NODE_URL = 'https://rpc.testnet.near.org';
const WALLET_URL = 'https://testnet.mynearwallet.com'; // MyNearWallet, testnet
const EXPLORER = 'https://explorer.testnet.near.org';
const NEAR_API_CDN = 'https://esm.sh/near-api-js@5.1.1';
// 100 TGas per call — the contract calls are light; 100 TGas is ample.
const GAS = 100_000_000_000_000n;
// The five contract methods the wallet may sign for (requestSignIn scope).
const METHOD_NAMES = ['create_invoice', 'client_approve', 'approve_and_fund', 'release', 'cancel'];
// Small testnet demo amount — NOT the $12,000 simulated invoice.
const DEFAULT_AMOUNT_NEAR = '0.01';
const DEFAULT_CONTRACTOR = 'crew.paid-in-full-v3.testnet';
const DEFAULT_JOB = 'Weekley bathroom remodel — live testnet invoice';

// Same account-id rule as the contract (contract/src/contract.ts):
// 2–64 chars, lowercase letters, digits, '.', '_' or '-'.
const ACCOUNT_ID_RE = /^[a-z0-9._-]{2,64}$/;
function assertAccountId(id, role) {
  if (typeof id !== 'string' || !ACCOUNT_ID_RE.test(id)) {
    throw new Error(`${role} must be a valid NEAR account id, got: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// Pure amount helpers (string in, string out — yoctoNEAR exceeds JS numbers)
// ---------------------------------------------------------------------------

// '0.01' -> '10000000000000000000000'. Rejects zero, negatives, junk, and
// more than 24 decimal places. Written by hand (not parseNearAmount) so
// the builders stay dependency-free and unit-testable in plain Node.
function nearToYocto(nearStr) {
  const s = String(nearStr).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`not a NEAR amount: ${nearStr}`);
  const [whole, frac = ''] = s.split('.');
  if (frac.length > 24) throw new Error(`NEAR amount has more than 24 decimal places: ${nearStr}`);
  const yocto = BigInt(whole) * 10n ** 24n + BigInt(frac.padEnd(24, '0'));
  if (yocto <= 0n) throw new Error(`amount must be positive, got: ${nearStr}`);
  return yocto.toString();
}

function yoctoToNear(yoctoStr) {
  const y = BigInt(yoctoStr);
  if (y < 0n) throw new Error(`negative yocto amount: ${yoctoStr}`);
  const whole = y / 10n ** 24n;
  const frac = (y % 10n ** 24n).toString().padStart(24, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

// ---------------------------------------------------------------------------
// Pure call builders — the EXACT call shapes the UI sends, and the exact
// shapes the Node proof drives. Each returns { methodName, args, gas,
// attachedDeposit } (gas is a BigInt; attachedDeposit a yocto string).
// ---------------------------------------------------------------------------

function buildCreateInvoice({ invoiceId, job, contractor, client, amountNear }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw new Error('an invoice id is required');
  if (!job || typeof job !== 'string') throw new Error('a job description is required');
  assertAccountId(contractor, 'contractor');
  assertAccountId(client, 'client');
  const amountYocto = nearToYocto(amountNear);
  return {
    methodName: 'create_invoice',
    args: { invoice_id: invoiceId, job, contractor, client, amount_yocto: amountYocto },
    gas: GAS,
    attachedDeposit: '0',
  };
}

// The cap-setting IS the approval (contract rule): the client approves
// AND states the sum they approve up to, in one call. The builder fails
// fast client-side if the cap is below the amount — the same check the
// contract enforces on-chain ('approved sum must be at least the invoice
// amount'), so a bad cap never reaches the chain.
function buildClientApprove({ invoiceId, capNear, amountNear }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw new Error('an invoice id is required');
  const capYocto = nearToYocto(capNear);
  const amountYocto = nearToYocto(amountNear);
  if (BigInt(capYocto) < BigInt(amountYocto)) {
    throw new Error(`approved sum (${capNear} NEAR) must be at least the invoice amount (${amountNear} NEAR)`);
  }
  return {
    methodName: 'client_approve',
    args: { invoice_id: invoiceId, approved_sum_yocto: capYocto },
    gas: GAS,
    attachedDeposit: '0',
  };
}

// The deposit must equal the invoice amount EXACTLY (contract rule) —
// the builder sets it from the same amount, so the UI cannot attach a
// wrong deposit by accident.
function buildApproveAndFund({ invoiceId, amountNear }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw new Error('an invoice id is required');
  const amountYocto = nearToYocto(amountNear);
  return {
    methodName: 'approve_and_fund',
    args: { invoice_id: invoiceId },
    gas: GAS,
    attachedDeposit: amountYocto,
  };
}

function buildRelease({ invoiceId }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw new Error('an invoice id is required');
  return { methodName: 'release', args: { invoice_id: invoiceId }, gas: GAS, attachedDeposit: '0' };
}

function buildCancel({ invoiceId }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw new Error('an invoice id is required');
  return { methodName: 'cancel', args: { invoice_id: invoiceId }, gas: GAS, attachedDeposit: '0' };
}

// ---------------------------------------------------------------------------
// Wallet plumbing (browser only; near-api-js loaded lazily from the CDN)
// ---------------------------------------------------------------------------

let nearApiPromise = null;
function loadNearApi() {
  // Dynamic import: the library is fetched only when the user clicks
  // Connect, and Node can import this module without the CDN.
  if (!nearApiPromise) nearApiPromise = import(/* webpackIgnore: true */ NEAR_API_CDN);
  return nearApiPromise;
}

let walletPromise = null;
async function getWallet() {
  if (!walletPromise) {
    walletPromise = (async () => {
      const { connect, keyStores, WalletConnection } = await loadNearApi();
      const near = await connect({
        networkId: NETWORK_ID,
        nodeUrl: NODE_URL,
        walletUrl: WALLET_URL,
        deps: { keyStore: new keyStores.BrowserLocalStorageKeyStore() },
      });
      return new WalletConnection(near, 'paid-in-full');
    })();
  }
  return walletPromise;
}

async function connectWallet() {
  const wallet = await getWallet();
  // Redirects to MyNearWallet (testnet). The wallet asks the user to
  // approve a function-call access key limited to the five methods above
  // on this contract only — no full-access key, no other contract.
  // successUrl defaults to this page, so the user comes back here.
  await wallet.requestSignIn({ contractId: CONTRACT_ID, methodNames: METHOD_NAMES });
}

async function disconnectWallet() {
  const wallet = await getWallet();
  wallet.signOut();
}

async function signedInAccountId() {
  try {
    const wallet = await getWallet();
    return wallet.isSignedIn() ? wallet.getAccountId() : null;
  } catch (e) {
    return null; // CDN unreachable etc. — the section reports it, never throws on load.
  }
}

// Sends one built call as a signed transaction from the connected wallet.
// Returns the transaction hash.
async function callContract(call) {
  const wallet = await getWallet();
  if (!wallet.isSignedIn()) throw new Error('connect a testnet wallet first');
  const account = wallet.account();
  const out = await account.functionCall({
    contractId: CONTRACT_ID,
    methodName: call.methodName,
    args: call.args,
    gas: call.gas,
    attachedDeposit: BigInt(call.attachedDeposit),
  });
  return out.transaction.hash;
}

// Base64 / byte helpers that work in BOTH the browser and Node — the
// module runs in both (browser UI + Node unit tests + Node proof).
function utf8ToBase64(str) {
  if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function bytesToUtf8(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// Read-only view of one invoice, straight from the testnet RPC with plain
// fetch (same shape as app/onchain.js) — no wallet, no signing.
async function viewInvoiceLive(invoiceId) {
  const body = {
    jsonrpc: '2.0',
    id: 'pif-wallet-view',
    method: 'query',
    params: {
      request_type: 'call_function',
      account_id: CONTRACT_ID,
      method_name: 'get_invoice',
      args_base64: utf8ToBase64(JSON.stringify({ invoice_id: invoiceId })),
      finality: 'final',
    },
  };
  const res = await fetch(NODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`testnet RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
  return JSON.parse(bytesToUtf8(json.result.result));
}

// Suggests the next fresh invoice id (max existing + 1) from the server's
// live on-chain panel, so the demo never collides with an existing id.
// Falls back to 'inv-3004' if the panel is unreachable.
async function suggestNextInvoiceId() {
  try {
    const res = await fetch('/api/onchain');
    const data = await res.json();
    const ids = (data.invoices || []).map((inv) => inv.id);
    let max = 3003;
    for (const id of ids) {
      const m = /^inv-(\d+)$/.exec(id);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `inv-${max + 1}`;
  } catch (e) {
    return 'inv-3004';
  }
}

// ---------------------------------------------------------------------------
// Section 6 UI wiring (browser only — guarded so Node can import the module)
// ---------------------------------------------------------------------------

function initWalletUI() {
  const $ = (id) => document.getElementById(id);
  if (!$('walletConnect')) return; // section 6 not on this page
  const out = (html) => { $('walletOut').innerHTML = html; };
  const showError = (e) => { out(`<p class="flag">Live wallet error: ${e.message}</p>`); };
  const txLink = (hash, label) =>
    `<p>Transaction: <a href="${EXPLORER}/transactions/${hash}" target="_blank" rel="noopener"><code>${hash}</code></a>${label ? ` — ${label}` : ''}</p>`;

  async function renderAccount() {
    const accountId = await signedInAccountId();
    if (accountId) {
      $('walletAccount').innerHTML =
        `<p class="ok">Connected as <b>${accountId}</b> (testnet). ` +
        `This account becomes the recorded <b>client</b> on any invoice it creates — ` +
        `only the recorded client can approve, fund, release or cancel it.</p>`;
      $('walletConnect').textContent = 'Connected — switch wallet';
      $('walletDisconnect').style.display = '';
    } else {
      $('walletAccount').innerHTML = '<p>No wallet connected. Connect a NEAR testnet wallet to sign real transactions.</p>';
      $('walletConnect').textContent = 'Connect testnet wallet';
      $('walletDisconnect').style.display = 'none';
    }
    return accountId;
  }

  async function refreshLive() {
    const id = $('liveInvoiceId').value.trim();
    if (!id) { out('<p class="flag">Enter an invoice id first.</p>'); return; }
    out('<p>Reading live on-chain state…</p>');
    try {
      const inv = await viewInvoiceLive(id);
      out(
        '<table><tr><th>Invoice</th><th>Status</th><th>Approved</th><th>Cap</th><th>Amount</th><th>Client</th><th>Contractor</th></tr>' +
        `<tr><td>${inv.invoice_id || id}</td><td><span class="status">${inv.status}</span></td>` +
        `<td>${inv.approved ? 'yes' : 'no'}</td><td>${yoctoToNear(inv.approvedSumYocto)} NEAR</td>` +
        `<td>${yoctoToNear(inv.amountYocto)} NEAR</td><td>${inv.client}</td><td>${inv.contractor}</td></tr></table>` +
        `<p class="explorer">Read live from the testnet RPC — the real contract, not the simulation.</p>`,
      );
    } catch (e) { showError(e); }
  }

  // Runs one built call, then reads the invoice back live and shows both
  // the transaction hash and the new on-chain state. The success label
  // comes from the READ-BACK invoice — labelFor is a function taking the
  // read-back invoice and returning the label — never from the Amount
  // field. The field is what the user asked to move; the read-back is what
  // actually moved, and the two can differ if the field was edited between
  // steps. labelFor may also be a plain string when the label makes no
  // amount claim (e.g. cancel). If the read-back fails, no amount is
  // claimed at all.
  async function runLive(call, labelFor) {
    out(`<p>Signing <code>${call.methodName}</code> in your wallet…</p>`);
    try {
      const hash = await callContract(call);
      const id = $('liveInvoiceId').value.trim();
      let stateHtml = '';
      let label;
      try {
        const inv = await viewInvoiceLive(id);
        stateHtml = `<p>On-chain state after this transaction: <span class="status">${inv.status}</span>` +
          ` — approved: ${inv.approved ? 'yes' : 'no'}, cap ${yoctoToNear(inv.approvedSumYocto)} NEAR, ` +
          `amount ${yoctoToNear(inv.amountYocto)} NEAR.</p>`;
        label = typeof labelFor === 'function' ? labelFor(inv) : labelFor;
      } catch (e) {
        stateHtml = `<p>Transaction landed, but the live read-back failed: ${e.message}</p>`;
        label = 'Transaction landed — amount not confirmed (live read-back failed).';
      }
      out(`<p class="ok">${label}</p>` + txLink(hash) + stateHtml);
    } catch (e) { showError(e); }
  }

  $('walletConnect').addEventListener('click', async () => {
    try { await connectWallet(); } catch (e) { showError(e); }
  });
  $('walletDisconnect').addEventListener('click', async () => {
    try { await disconnectWallet(); await renderAccount(); } catch (e) { showError(e); }
  });
  $('liveRefresh').addEventListener('click', refreshLive);

  $('liveCreate').addEventListener('click', async () => {
    const accountId = await signedInAccountId();
    if (!accountId) { out('<p class="flag">Connect a testnet wallet first — the connected account becomes the invoice client.</p>'); return; }
    try {
      const call = buildCreateInvoice({
        invoiceId: $('liveInvoiceId').value.trim(),
        job: $('liveJob').value,
        contractor: $('liveContractor').value.trim(),
        client: accountId,
        amountNear: $('liveAmount').value,
      });
      await runLive(call, (inv) => `Live invoice ${inv.invoice_id} created on-chain for ${yoctoToNear(inv.amountYocto)} NEAR (small testnet amount). Client: ${inv.client}.`);
    } catch (e) { showError(e); }
  });

  $('liveApprove').addEventListener('click', async () => {
    try {
      const call = buildClientApprove({
        invoiceId: $('liveInvoiceId').value.trim(),
        capNear: $('liveAmount').value,
        amountNear: $('liveAmount').value,
      });
      await runLive(call, (inv) => `Approved on-chain up to ${yoctoToNear(inv.approvedSumYocto)} NEAR.`);
    } catch (e) { showError(e); }
  });

  $('liveFund').addEventListener('click', async () => {
    try {
      const call = buildApproveAndFund({
        invoiceId: $('liveInvoiceId').value.trim(),
        amountNear: $('liveAmount').value,
      });
      await runLive(call, (inv) => `Funded on-chain with exactly ${yoctoToNear(inv.amountYocto)} NEAR (deposit = invoice amount, to the yocto).`);
    } catch (e) { showError(e); }
  });

  $('liveRelease').addEventListener('click', async () => {
    try {
      await runLive(buildRelease({ invoiceId: $('liveInvoiceId').value.trim() }),
        (inv) => `Released on-chain — ${yoctoToNear(inv.amountYocto)} NEAR moved to the contractor.`);
    } catch (e) { showError(e); }
  });

  $('liveCancel').addEventListener('click', async () => {
    try {
      await runLive(buildCancel({ invoiceId: $('liveInvoiceId').value.trim() }),
        'Cancelled on-chain (from Created: no funds moved; from Funded: refunded in full to the client).');
    } catch (e) { showError(e); }
  });

  // On load: show the account (after a wallet redirect back) and suggest
  // a fresh invoice id so the demo never collides with an existing one.
  renderAccount();
  suggestNextInvoiceId().then((id) => { if (!$('liveInvoiceId').value) $('liveInvoiceId').value = id; });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWalletUI);
  } else {
    initWalletUI();
  }
}

// Node / test imports (the browser loads this file as a module script).
export {
  CONTRACT_ID,
  METHOD_NAMES,
  DEFAULT_AMOUNT_NEAR,
  DEFAULT_CONTRACTOR,
  DEFAULT_JOB,
  GAS,
  nearToYocto,
  yoctoToNear,
  utf8ToBase64,
  bytesToUtf8,
  buildCreateInvoice,
  buildClientApprove,
  buildApproveAndFund,
  buildRelease,
  buildCancel,
  viewInvoiceLive,
  callContract,
  connectWallet,
  disconnectWallet,
  signedInAccountId,
};
