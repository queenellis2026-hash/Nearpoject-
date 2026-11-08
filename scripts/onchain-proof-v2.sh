#!/bin/bash
# On-chain proof for the FRESH contract account paid-in-full-v2.testnet.
# Two distinct accounts (client != contractor) + access-control denials
# with a third (stranger) account. Rowan's v2 checklist.
# Run from the project root. Uses near-cli 4.0.13 + the testnet keypairs
# in ~/.near-credentials/testnet/ (0600, VM only, never printed).
set -e
C=paid-in-full-v2.testnet
CLIENT=paid-in-full-v2.testnet
CONTRACTOR=v2.paid-in-full.testnet
STRANGER=stranger.paid-in-full-v2.testnet
N=--networkId\ testnet

view() { near view $C "$1" "$2" --networkId testnet 2>&1 | grep -v 'update check' | grep -v 'sudo chown' | grep -v '^\s*$'; }

echo "=== 0. fresh account state (no v1 invoices) ==="
view invoice_ids '{}'

echo "=== 1. create inv-2001 (0.01 NEAR, client=$CLIENT, contractor=$CONTRACTOR) ==="
near call $C create_invoice "{\"invoice_id\":\"inv-2001\",\"job\":\"Bathroom remodel — final invoice\",\"contractor\":\"$CONTRACTOR\",\"client\":\"$CLIENT\",\"amount_yocto\":\"10000000000000000000000\"}" --accountId $CLIENT --networkId testnet 2>&1 | grep -E 'Transaction|Receipt:|Log|Error' | head -4
view get_invoice '{"invoice_id":"inv-2001"}'

echo "=== 2. NEGATIVE: fund without client_approve (must fail) ==="
near call $C approve_and_fund '{"invoice_id":"inv-2001"}' --accountId $CLIENT --amount 0.01 --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-1 OK: fund without approval rejected" || echo "NEGATIVE-1 FAIL: fund without approval SUCCEEDED"
view get_invoice '{"invoice_id":"inv-2001"}'

echo "=== 3. NEGATIVE: stranger client_approve (must fail) ==="
near call $C client_approve '{"invoice_id":"inv-2001","approved_sum_yocto":"10000000000000000000000"}' --accountId $STRANGER --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-2 OK: stranger approve rejected" || echo "NEGATIVE-2 FAIL: stranger approve SUCCEEDED"

echo "=== 4. client_approve inv-2001 with 0.01 cap (as client) ==="
near call $C client_approve '{"invoice_id":"inv-2001","approved_sum_yocto":"10000000000000000000000"}' --accountId $CLIENT --networkId testnet 2>&1 | grep -E 'Transaction|Receipt:|Log|Error' | head -4
view get_invoice '{"invoice_id":"inv-2001"}'

echo "=== 5. NEGATIVE: stranger approve_and_fund (must fail) ==="
near call $C approve_and_fund '{"invoice_id":"inv-2001"}' --accountId $STRANGER --amount 0.01 --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-3 OK: stranger fund rejected" || echo "NEGATIVE-3 FAIL: stranger fund SUCCEEDED"

echo "=== 6. NEGATIVE: client funds with WRONG amount 0.02 (must fail, exact deposit) ==="
near call $C approve_and_fund '{"invoice_id":"inv-2001"}' --accountId $CLIENT --amount 0.02 --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-4 OK: wrong-amount fund rejected" || echo "NEGATIVE-4 FAIL: wrong-amount fund SUCCEEDED"

echo "=== 7. approve_and_fund inv-2001 with exactly 0.01 NEAR (as client) ==="
near call $C approve_and_fund '{"invoice_id":"inv-2001"}' --accountId $CLIENT --amount 0.01 --networkId testnet 2>&1 | grep -E 'Transaction|Receipt:|Log|Error' | head -4
view get_invoice '{"invoice_id":"inv-2001"}'

echo "=== 8. NEGATIVE: stranger release (must fail) ==="
near call $C release '{"invoice_id":"inv-2001"}' --accountId $STRANGER --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-5 OK: stranger release rejected" || echo "NEGATIVE-5 FAIL: stranger release SUCCEEDED"

echo "=== 9. NEGATIVE: fund twice (must fail) ==="
near call $C approve_and_fund '{"invoice_id":"inv-2001"}' --accountId $CLIENT --amount 0.01 --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-6 OK: double-fund rejected" || echo "NEGATIVE-6 FAIL: double-fund SUCCEEDED"

echo "=== 10. release inv-2001 (as client) — funds go to contractor $CONTRACTOR ==="
near call $C release '{"invoice_id":"inv-2001"}' --accountId $CLIENT --networkId testnet 2>&1 | grep -E 'Transaction|Receipt:|Log|Error' | head -5
view get_invoice '{"invoice_id":"inv-2001"}'

echo "=== 11. NEGATIVE: release twice (must fail) ==="
near call $C release '{"invoice_id":"inv-2001"}' --accountId $CLIENT --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-7 OK: double-release rejected" || echo "NEGATIVE-7 FAIL: double-release SUCCEEDED"

echo "=== 12. CAP: create inv-2002 at 0.0124 NEAR, approve with 0.01 cap, fund must fail ==="
near call $C create_invoice '{"invoice_id":"inv-2002","job":"Over the approved sum","contractor":"'$CONTRACTOR'","client":"'$CLIENT'","amount_yocto":"12400000000000000000000"}' --accountId $CLIENT --networkId testnet 2>&1 | grep -E 'Transaction|Error' | head -3
near call $C client_approve '{"invoice_id":"inv-2002","approved_sum_yocto":"10000000000000000000000"}' --accountId $CLIENT --networkId testnet 2>&1 | grep -E 'Transaction|Error' | head -3
near call $C approve_and_fund '{"invoice_id":"inv-2002"}' --accountId $CLIENT --amount 0.0124 --networkId testnet 2>&1 | grep -qiE 'error|rejected|failed' && echo "NEGATIVE-8 OK: fund over the cap rejected" || echo "NEGATIVE-8 FAIL: fund over the cap SUCCEEDED"
view get_invoice '{"invoice_id":"inv-2002"}'

echo "=== 13. invoice_ids (fresh account: only the v2 invoices) ==="
view invoice_ids '{}'
echo "=== PROOF DONE ==="
