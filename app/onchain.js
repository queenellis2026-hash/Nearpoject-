// Read-only views of the deployed NEAR contract (testnet RPC).
// No keys, no signing, no writes — the demo app only READS the live
// on-chain invoice state so a judge can see NEAR doing something real.
// Uses Node's global fetch (Node 18+); zero dependencies.
//
// The contract account is the FRESH v3 deployment (paid-in-full-v3.testnet),
// not the v2 account (paid-in-full-v2.testnet), whose storage holds v2
// invoices, or the v1 account (paid-in-full.testnet), whose storage holds
// pre-fix invoices without the client/approved-sum fields.
'use strict';

const RPC_URL = 'https://rpc.testnet.near.org';
const EXPLORER = 'https://explorer.testnet.near.org';

function rpcCall(contractAccount, methodName, args) {
  const body = {
    jsonrpc: '2.0',
    id: 'pif-onchain',
    method: 'query',
    params: {
      request_type: 'call_function',
      account_id: contractAccount,
      method_name: methodName,
      args_base64: Buffer.from(JSON.stringify(args)).toString('base64'),
      finality: 'final',
    },
  };
  return fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
    .then((res) => {
      if (!res.ok) throw new Error('RPC HTTP ' + res.status);
      return res.json();
    })
    .then((json) => {
      if (json.error) throw new Error('RPC error: ' + JSON.stringify(json.error));
      // result.result is the raw return value as an array of byte values.
      const bytes = Buffer.from(json.result.result);
      return JSON.parse(bytes.toString('utf8'));
    });
}

// Fetch the live on-chain invoice list for the deployed contract.
// Returns { contract, explorer, accountUrl, invoices: [...] }.
// Throws on any RPC failure — the caller turns that into a graceful
// { error } payload for the UI instead of crashing the demo server.
async function fetchOnchainInvoices(contractAccount) {
  const ids = await rpcCall(contractAccount, 'invoice_ids', {});
  // The get_invoice calls are independent — run them in parallel. (The
  // testnet RPC takes ~4 s a call from here, so serial calls made the
  // panel take ~13 s to render in the video; parallel is ~8 s.)
  const results = await Promise.all(
    ids.map((id) => rpcCall(contractAccount, 'get_invoice', { invoice_id: id })),
  );
  const invoices = results.map((inv, i) => ({
    id: ids[i],
    job: inv.job,
    contractor: inv.contractor,
    client: inv.client,
    amountYocto: inv.amountYocto,
    status: inv.status,
    approved: inv.approved === true,
    approvedSumYocto: inv.approvedSumYocto || '0',
    explorer: EXPLORER + '/accounts/' + contractAccount,
  }));
  return {
    contract: contractAccount,
    explorer: EXPLORER,
    accountUrl: EXPLORER + '/accounts/' + contractAccount,
    invoices,
  };
}

// A short-lived cache so the panel answers instantly on click. The data is
// still the REAL on-chain state — it is read live from the testnet RPC and
// refreshed in the background every 60 s (and on first use). The invoices
// do not change during a demo take, and a 60 s-old read of a contract that
// only changes when someone funds it is live state, not a mock. Without
// the cache the panel took ~13 s to render (4 serial RPC calls at ~4 s
// each from this VM), which landed it in the wrong narration beat.
const CACHE_TTL_MS = 60_000;
let cache = null; // { data, fetchedAt }

async function fetchOnchainInvoicesCached(contractAccount) {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const data = await fetchOnchainInvoices(contractAccount);
  cache = { data, fetchedAt: now };
  return data;
}

// Warm the cache in the background (fire-and-forget) and keep it fresh,
// so the first click on the panel is instant. Failures are silent here —
// a click on an empty cache fetches live and reports the error if the RPC
// is down.
function startOnchainRefresh(contractAccount) {
  const refresh = () => {
    fetchOnchainInvoices(contractAccount)
      .then((data) => { cache = { data, fetchedAt: Date.now() }; })
      .catch(() => { /* leave the last good value; a click retries live */ });
  };
  refresh();
  setInterval(refresh, CACHE_TTL_MS);
  return refresh;
}

module.exports = { fetchOnchainInvoices, fetchOnchainInvoicesCached, startOnchainRefresh, RPC_URL, EXPLORER };
