#!/usr/bin/env bash
# Deploy the Paid in Full escrow contract to NEAR TESTNET.
#
# Prerequisites (the TEAM does these, by hand — never an agent on their
# behalf, and NEVER mainnet from this repo):
#   1. Create a TESTNET account, e.g. at https://testnet.mynearwallet.com
#      (testnet NEAR is free from the faucet).
#   2. Install near-cli-rs:  cargo install near-cli-rs
#      (or use the wallet + near CLI of your choice)
#   3. Log in:               near login   (select testnet)
#
# Usage:
#   CONTRACT_ACCOUNT=yourname.testnet bash scripts/deploy-testnet.sh
set -euo pipefail
: "${CONTRACT_ACCOUNT:?Set CONTRACT_ACCOUNT to YOUR testnet account, e.g. yourname.testnet}"
case "$CONTRACT_ACCOUNT" in
  *.testnet) ;;
  *) echo "Refusing: CONTRACT_ACCOUNT must be a .testnet account. Mainnet deploys are out of scope for this repo."; exit 1 ;;
esac
cd "$(dirname "$0")/.."
npm run build
near contract deploy "$CONTRACT_ACCOUNT" use-file build/paid-in-full.wasm with-init-call init json-args '{}' prepaid-gas '100 TeraGas' attached-deposit '0 NEAR' sign-as "$CONTRACT_ACCOUNT" sign-with-keychain network-config testnet sign-with-legacy-keychain send
echo "Deployed to $CONTRACT_ACCOUNT (testnet)."
echo "Try it:"
echo "  near contract call-function as-transaction $CONTRACT_ACCOUNT create_invoice json-args '{\"invoice_id\":\"inv-0001\",\"job\":\"Bathroom remodel\",\"contractor\":\"crew.testnet\",\"amount_yocto\":\"1000000000000000000000000\"}' prepaid-gas '100 TeraGas' attached-deposit '0 NEAR' sign-as crew.testnet sign-with-keychain network-config testnet sign-with-legacy-keychain send"
