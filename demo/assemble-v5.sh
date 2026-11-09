#!/usr/bin/env bash
# Paid in Full — v5 ASSEMBLY.
#
# Inputs (all 1920x1080, 25 fps):
#   raw-take-v5-part1/*.webm        browser part 1 (intro + desk + quote + wallet film)
#   raw-take-v5-terminal-inv-3007.mp4  terminal take (live near-cli calls), trimmed to 60 s
#   raw-take-v5-terminal2-inv-3007.mp4 supplementary terminal clip (final state + hashes)
#   raw-take-v5-part2/*.webm       browser part 2 (section-5 refresh + outro)
# Narration (Ellis's voice, Contented Barrel) is placed at the logged
# event times from timeline-v5-part1.json / timeline-v5-part2.json, then
# two-pass loudnorm to -16 LUFS / -1.5 dBTP, as v4 did.
# Output: paid-in-full-demo.mp4 (v4 is preserved as paid-in-full-demo-v4.mp4).
set -e
DEMO="/home/hatch/workspace/500-goal/paid-in-full/paid-in-full/demo"
cd "$DEMO"

P1=$(ls raw-take-v5-part1/*.webm)
P2=$(ls raw-take-v5-part2/*.webm)
TERM="raw-take-v5-terminal-inv-3007.mp4"
TERM2="raw-take-v5-terminal2-inv-3007.mp4"
TERM_TRIM=60   # terminal take froze at ~63 s (release outcome printout lagged); cut the frozen tail

echo "== transcode inputs to uniform H.264 =="
ffmpeg -v error -y -i "$P1" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 25 v5-p1.mp4
ffmpeg -v error -y -ss 0 -t $TERM_TRIM -i "$TERM" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 25 v5-term.mp4
ffmpeg -v error -y -i "$TERM2" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 25 v5-term2.mp4
ffmpeg -v error -y -i "$P2" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 25 v5-p2.mp4

D1=$(ffprobe -v error -show_entries format=duration -of csv=p=0 v5-p1.mp4)
DT=$(ffprobe -v error -show_entries format=duration -of csv=p=0 v5-term.mp4)
DT2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 v5-term2.mp4)
D2=$(ffprobe -v error -show_entries format=duration -of csv=p=0 v5-p2.mp4)
echo "durations: part1=$D1 term=$DT term2=$DT2 part2=$D2"

echo "== concat =="
printf "file 'v5-p1.mp4'\nfile 'v5-term.mp4'\nfile 'v5-term2.mp4'\nfile 'v5-p2.mp4'\n" > v5-concat.txt
ffmpeg -v error -y -f concat -safe 0 -i v5-concat.txt -c copy v5-raw.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 v5-raw.mp4

# Narration placements in milliseconds (integers for adelay), from the part
# timelines. part 1: desk_load 8.013, wallet_film 104.652.
# part 2: outro_load 8.186.
read SEG0 SEG1 SEG2B SEG3 SEG4 SEG5 SEG6 SEG7A SEG8 SEG7B <<< $(python3 -c "
d1, dt, dt2 = $D1, $DT, $DT2
base = 8.013
vals = [0, base,
  base+10.752, base+10.752+11.712, base+10.752+11.712+11.208,
  base+10.752+11.712+11.208+10.428, base+10.752+11.712+11.208+10.428+11.208,
  base+10.752+11.712+11.208+10.428+11.208+23.448,
  104.652, d1+dt+dt2+8.186]
print(' '.join(str(round(v*1000)) for v in vals))
")
echo "placements (ms): seg0=$SEG0 seg1=$SEG1 seg2b=$SEG2B seg3=$SEG3 seg4=$SEG4 seg5=$SEG5 seg6=$SEG6 seg7a=$SEG7A seg8=$SEG8 seg7b=$SEG7B"

echo "== mix narration =="
ffmpeg -v error -y -i v5-raw.mp4 \
  -i audio/seg0.mp3 -i audio/seg1.mp3 -i audio/seg2b.mp3 -i audio/seg3.mp3 \
  -i audio/seg4.mp3 -i audio/seg5.mp3 -i audio/seg6.mp3 -i audio/seg7a.mp3 \
  -i audio/seg8.mp3 -i audio/seg7b.mp3 \
  -filter_complex "[1:a]adelay=${SEG0}|${SEG0}[a1];[2:a]adelay=${SEG1}|${SEG1}[a2];[3:a]adelay=${SEG2B}|${SEG2B}[a3];[4:a]adelay=${SEG3}|${SEG3}[a4];[5:a]adelay=${SEG4}|${SEG4}[a5];[6:a]adelay=${SEG5}|${SEG5}[a6];[7:a]adelay=${SEG6}|${SEG6}[a7];[8:a]adelay=${SEG7A}|${SEG7A}[a8];[9:a]adelay=${SEG8}|${SEG8}[a9];[10:a]adelay=${SEG7B}|${SEG7B}[a10];[a1][a2][a3][a4][a5][a6][a7][a8][a9][a10]amix=inputs=10:normalize=0[aout]" \
  -map 0:v -map "[aout]" -c:v libx264 -preset medium -crf 18 -c:a aac -b:a 144k \
  -video_track_timescale 25 v5-mix.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 v5-mix.mp4

echo "== loudnorm pass 1 (measure) =="
ffmpeg -i v5-mix.mp4 -vn -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | tee v5-loudnorm-pass1.log | tail -12
python3 - <<'EOF'
import json, re
log = open('v5-loudnorm-pass1.log').read()
m = re.search(r'\{[^}]*"input_i"[^}]*\}', log, re.S)
vals = json.loads(m.group(0))
print("measured:", {k: vals[k] for k in ("input_i","input_tp","input_lra","input_thresh","target_offset")})
with open('v5-loudnorm-measured.json','w') as f:
    json.dump(vals, f)
EOF

echo "== loudnorm pass 2 (apply) =="
python3 - <<'EOF'
import json, subprocess
v = json.load(open('v5-loudnorm-measured.json'))
cmd = ["ffmpeg","-v","error","-y","-i","v5-mix.mp4","-map","0:v","-map","0:a",
 "-c:v","copy",
 "-af", f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={v['input_i']}:measured_TP={v['input_tp']}:measured_LRA={v['input_lra']}:measured_thresh={v['input_thresh']}:offset={v['target_offset']}:linear=true",
 "-c:a","aac","-b:a","144k","paid-in-full-demo.mp4"]
print(" ".join(cmd))
subprocess.run(cmd, check=True)
EOF
echo "== final =="
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration,size -of default=nw=1 paid-in-full-demo.mp4
md5sum paid-in-full-demo.mp4
