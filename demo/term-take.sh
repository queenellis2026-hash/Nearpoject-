#!/usr/bin/env bash
# Paid in Full — v5 TERMINAL TAKE (live signed near-cli calls on camera).
#
# Records a real xterm session on Xvfb :99 with ffmpeg x11grab while the
# four signed calls for a FRESH invoice run for real against the deployed
# v3 contract (paid-in-full-v3.testnet) with the team's testnet keypair
# (~/.near-credentials/testnet/, via near-cli — the key is never printed).
#   create -> client_approve (cap 0.01) -> approve_and_fund (exactly 0.01)
#   -> release, then a view showing the Released state.
# Each call prints its transaction hash on screen.
#
# One-shot: the invoice id can only be created once on-chain. If this
# take fails partway, re-run with the NEXT id (inv-3008, ...) — do not
# re-run with the same id. Usage: ./term-take.sh [inv-3007]
set -u
DEMO="/home/hatch/workspace/500-goal/paid-in-full/paid-in-full/demo"
ID="${1:-inv-3007}"
C="paid-in-full-v3.testnet"
CLIENT="paid-in-full-v3.testnet"
CREW="crew.paid-in-full-v3.testnet"
OUT="$DEMO/raw-take-v5-terminal-$ID.mp4"
LOG="$DEMO/term-take-$ID.log"
: > "$LOG"

export DISPLAY=:99
export NO_UPDATE_NOTIFIER=1   # keeps near-cli's update box off screen

# --- launch the terminal (maximized, green on black, readable type) ---
xterm -fa Monospace -fs 20 -bg black -fg green -geometry 1920x1080+0+0 \
  -T "Paid in Full — live on-chain" \
  -e env PS1='\$ ' NO_UPDATE_NOTIFIER=1 bash --noprofile --norc &
XTERM_PID=$!
sleep 1.5
WID=$(xdotool search --name "Paid in Full" | head -1)
echo "xterm window: $WID" | tee -a "$LOG"
xdotool search --name "Paid in Full" windowfocus 2>/dev/null || true
sleep 0.5

# --- start the screen capture ---
ffmpeg -v error -y -f x11grab -video_size 1920x1080 -framerate 25 -i :99 \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p "$OUT" &
FF_PID=$!
sleep 1.5
T0=$(date +%s)
mark() { echo "[$(( $(date +%s) - T0 ))s] $1" | tee -a "$LOG"; }

type_cmd() {
  local cmd="$1" wait_s="${2:-6}"
  mark "typing: ${cmd:0:60}..."
  xdotool type --delay 30 -- "$cmd"
  xdotool key Return
  sleep "$wait_s"
}

type_cmd 'echo "Paid in Full - live on-chain proof (NEAR testnet)"' 2
mark "start"
type_cmd "near view $C invoice_ids '{}' --networkId testnet" 8
type_cmd "near call $C create_invoice '{\"invoice_id\":\"$ID\",\"job\":\"Weekley bathroom remodel - live testnet invoice\",\"contractor\":\"$CREW\",\"client\":\"$CLIENT\",\"amount_yocto\":\"10000000000000000000000\"}' --accountId $CLIENT --networkId testnet" 9
type_cmd "near call $C client_approve '{\"invoice_id\":\"$ID\",\"approved_sum_yocto\":\"10000000000000000000000\"}' --accountId $CLIENT --networkId testnet" 9
type_cmd "near call $C approve_and_fund '{\"invoice_id\":\"$ID\"}' --accountId $CLIENT --amount 0.01 --networkId testnet" 9
type_cmd "near call $C release '{\"invoice_id\":\"$ID\"}' --accountId $CLIENT --networkId testnet" 9
type_cmd "near view $C get_invoice '{\"invoice_id\":\"$ID\"}' --networkId testnet" 8
mark "final state on screen"
sleep 5
mark "end"

# --- stop the capture, then the terminal ---
kill -INT $FF_PID 2>/dev/null
sleep 1
kill $XTERM_PID 2>/dev/null
wait $FF_PID 2>/dev/null
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT" | tee -a "$LOG"
echo "TAKE: $OUT" | tee -a "$LOG"
