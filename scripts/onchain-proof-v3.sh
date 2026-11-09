#!/bin/bash
# On-chain proof for the FRESH contract account paid-in-full-v3.testnet.
# Two distinct accounts (client != contractor) + access-control denials
# with a third (stranger) account, plus the v3 additions:
#   - low-cap client_approve fails fast ('approved sum must be at least
#     the invoice amount'), state unchanged, retry with a correct cap works
#   - cancel from Created (unfunded, no funds move); stranger cancel rejected
# Run from the project root. Uses near-cli 4.0.13 + the testnet keypairs
# in ~/.near-credentials/testnet/ (0600, VM only, never printed).
# Full raw output is tee'd to scripts/onchain-proof-v3.log.
set -u
C=paid-in-full-v3.testnet
CLIENT=paid-in-full-v3.testnet
CONTRACTOR=crew.paid-in-full-v3.testnet
STRANGER=stranger.paid-in-full-v3.testnet
LOG=scripts/onchain-proof-v3.log
: > "$LOG"

view() { near view $C "$1" "$2" --networkId testnet 2>&1 | tee -a "$LOG" | grep -v 'update check' | grep -v 'sudo chown' | grep -v '^\s*$'; }

# call <label> <account> <method> <args-json> [amount]
# Runs the call, prints the tx hash, appends raw output to the log.
call() {
  local label="$1" acct="$2" method="$3" args="$4" amount="${5:-}"
  echo "--- $label ---" | tee -a "$LOG"
  local out
  if [ -n "$amount" ]; then
    out=$(near call $C "$method" "$args" --accountId "$acct" --amount "$amount" --networkId testnet 2>&1)
  else
    out=$(near call $C "$method" "$args" --accountId "$acct" --networkId testnet 2>&1)
  fi
  echo "$out" >> "$LOG"
  echo "$out" | grep -E 'Transaction Id|Error|rejected|failed' | head -5
  echo "$out" | grep -oE 'Transaction Id [A-Za-z0-9]+' | head -1
}

# neg <label> <account> <method> <args-json> [amount]
# Expect the call to be rejected; prints OK/FAIL.
neg() {
  local label="$1" acct="$2" method="$3" args="$4" amount="${5:-}"
  echo "--- NEGATIVE: $label (must fail) ---" | tee -a "$LOG"
  local out
  if [ -n "$amount" ]; then
    out=$(near call $C "$method" "$args" --accountId "$acct" --amount "$amount" --networkId testnet 2>&1 || true)
  else
    out=$(near call $C "$method" "$args" --accountId "$acct" --networkId testnet 2>&1 || true)
  fi
  echo "$out" >> "$LOG"
  echo "$out" | grep -oE 'Transaction Id [A-Za-z0-9]+' | head -1
  if echo "$out" | grep -qiE 'error|rejected|failed|panic'; then
    echo "NEGATIVE OK: $label rejected"
    echo "$out" | grep -iE 'error|panic|Smart contract panicked' | head -2
  else
    echo "NEGATIVE FAIL: $label SUCCEEDED (this must not happen)"
  fi
}

echo "=== 0. fresh account state (no v2 invoices) ==="
view invoice_ids '{}'

echo "=== 1. create inv-3001 (0.01 NEAR, client=$CLIENT, contractor=$CONTRACTOR) ==="
call "create inv-3001" $CLIENT create_invoice '{"invoice_id":"inv-3001","job":"Bathroom remodel — final invoice","contractor":"'$CONTRACTOR'","client":"'$CLIENT'","amount_yocto":"10000000000000000000000"}'
view get_invoice '{"invoice_id":"inv-3001"}'

neg "fund without client_approve" $CLIENT approve_and_fund '{"invoice_id":"inv-3001"}' 0.01
view get_invoice '{"invoice_id":"inv-3001"}'

neg "stranger client_approve" $STRANGER client_approve '{"invoice_id":"inv-3001","approved_sum_yocto":"10000000000000000000000"}'

echo "=== 4. client_approve inv-3001 with 0.01 cap (as client) ==="
call "client_approve inv-3001 (0.01 cap)" $CLIENT client_approve '{"invoice_id":"inv-3001","approved_sum_yocto":"10000000000000000000000"}'
view get_invoice '{"invoice_id":"inv-3001"}'

neg "stranger approve_and_fund" $STRANGER approve_and_fund '{"invoice_id":"inv-3001"}' 0.01
neg "client funds with WRONG amount 0.02" $CLIENT approve_and_fund '{"invoice_id":"inv-3001"}' 0.02

echo "=== 7. approve_and_fund inv-3001 with exactly 0.01 NEAR (as client) ==="
call "fund inv-3001 (0.01)" $CLIENT approve_and_fund '{"invoice_id":"inv-3001"}' 0.01
view get_invoice '{"invoice_id":"inv-3001"}'

neg "stranger release" $STRANGER release '{"invoice_id":"inv-3001"}'
neg "fund twice" $CLIENT approve_and_fund '{"invoice_id":"inv-3001"}' 0.01

echo "=== 10. release inv-3001 (as client) — funds go to contractor $CONTRACTOR ==="
call "release inv-3001" $CLIENT release '{"invoice_id":"inv-3001"}'
view get_invoice '{"invoice_id":"inv-3001"}'

neg "release twice" $CLIENT release '{"invoice_id":"inv-3001"}'
neg "cancel after release" $CLIENT cancel '{"invoice_id":"inv-3001"}'

echo "=== 12. NEW (v3): low-cap approve fails fast — inv-3002 (0.0124 NEAR) ==="
call "create inv-3002" $CLIENT create_invoice '{"invoice_id":"inv-3002","job":"Over the approved sum","contractor":"'$CONTRACTOR'","client":"'$CLIENT'","amount_yocto":"12400000000000000000000"}'
neg "client_approve inv-3002 with 0.01 cap (below amount)" $CLIENT client_approve '{"invoice_id":"inv-3002","approved_sum_yocto":"10000000000000000000000"}'
echo "--- state after rejected low-cap approve (must be unchanged: Created, approved false, cap 0) ---"
view get_invoice '{"invoice_id":"inv-3002"}'
echo "=== 12b. retry client_approve inv-3002 with correct 0.0124 cap ==="
call "client_approve inv-3002 (0.0124 cap)" $CLIENT client_approve '{"invoice_id":"inv-3002","approved_sum_yocto":"12400000000000000000000"}'
view get_invoice '{"invoice_id":"inv-3002"}'
echo "=== 12c. fund inv-3002 exactly (0.0124) ==="
call "fund inv-3002 (0.0124)" $CLIENT approve_and_fund '{"invoice_id":"inv-3002"}' 0.0124
view get_invoice '{"invoice_id":"inv-3002"}'

echo "=== 13. NEW (v3): cancel from Created — inv-3003 ==="
call "create inv-3003" $CLIENT create_invoice '{"invoice_id":"inv-3003","job":"Cancelled before funding","contractor":"'$CONTRACTOR'","client":"'$CLIENT'","amount_yocto":"10000000000000000000000"}'
echo "--- balances before cancel (no funds should move) ---"
near state $CLIENT --networkId testnet 2>&1 | grep -E 'formattedAmount' | tee -a "$LOG"
near state $CONTRACTOR --networkId testnet 2>&1 | grep -E 'formattedAmount' | tee -a "$LOG"
neg "stranger cancel from Created" $STRANGER cancel '{"invoice_id":"inv-3003"}'
call "client cancel inv-3003 from Created" $CLIENT cancel '{"invoice_id":"inv-3003"}'
view get_invoice '{"invoice_id":"inv-3003"}'
echo "--- balances after cancel (must match before, apart from gas) ---"
near state $CLIENT --networkId testnet 2>&1 | grep -E 'formattedAmount' | tee -a "$LOG"
near state $CONTRACTOR --networkId testnet 2>&1 | grep -E 'formattedAmount' | tee -a "$LOG"

echo "=== 14. invoice_ids (fresh account: only the v3 invoices) ==="
view invoice_ids '{}'
echo "=== PROOF DONE ==="
