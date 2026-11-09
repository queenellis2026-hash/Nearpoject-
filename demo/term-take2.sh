#!/usr/bin/env bash
# Paid in Full — v5 TERMINAL TAKE, part 2 (supplementary, same xterm style).
#
# The main terminal take's release call was submitted on camera, but
# near-cli hung awaiting the outcome printout past the end of the take
# (the transaction itself landed — see the indexer below). This short
# follow-up clip shows, live: the final invoice state (Released) and the
# four transaction hashes with their method names, read live from the
# NearBlocks testnet indexer (newest first: release, fund, approve,
# create). No new invoice is created here; nothing is re-run.
set -u
DEMO="/home/hatch/workspace/500-goal/paid-in-full/paid-in-full/demo"
ID="${1:-inv-3007}"
C="paid-in-full-v3.testnet"
OUT="$DEMO/raw-take-v5-terminal2-$ID.mp4"
LOG="$DEMO/term-take2-$ID.log"
: > "$LOG"

export DISPLAY=:99
export NO_UPDATE_NOTIFIER=1

xterm -fa Monospace -fs 20 -bg black -fg green -geometry 1920x1080+0+0 \
  -T "Paid in Full — live on-chain" \
  -e env NO_UPDATE_NOTIFIER=1 bash --noprofile --norc &
XTERM_PID=$!
sleep 1.5
xdotool search --name "Paid in Full" windowfocus 2>/dev/null || true
sleep 0.5

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

type_cmd 'echo "Paid in Full - the release, confirmed on-chain"' 2
type_cmd "near view $C get_invoice '{\"invoice_id\":\"$ID\"}' --networkId testnet" 8
type_cmd "curl -s \"https://api-testnet.nearblocks.io/v3/accounts/$C/txns?limit=4\" | python3 -c \"import json,sys; [print(t['actions'][0]['method'], t['transaction_hash']) for t in json.load(sys.stdin)['data']]\"" 7
mark "final state on screen"
sleep 6
mark "end"

kill -INT $FF_PID 2>/dev/null
sleep 1
kill $XTERM_PID 2>/dev/null
wait $FF_PID 2>/dev/null
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT" | tee -a "$LOG"
echo "TAKE: $OUT" | tee -a "$LOG"
