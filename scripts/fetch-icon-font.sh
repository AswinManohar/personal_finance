#!/usr/bin/env bash
# Regenerate the bundled Material Symbols subset.
#
# The full variable font is 3.8MB for ~2500 icons; this app uses ~34. Google's
# CSS API subsets by icon name server-side, which fonttools cannot do cleanly
# for a ligature font (the glyphs are reached through GSUB, not codepoints, so
# keeping the 27 characters an icon name is spelled with would keep the whole
# font).
#
# Run this whenever ICONS changes, then commit the .woff2. The built app makes
# no request to Google — this is a one-off, checked-in artifact.
set -euo pipefail
cd "$(dirname "$0")/.."

# Every Material Symbol the app renders, plus a few common spares so adding one
# does not silently ship a missing glyph (which renders as its literal name).
ICONS="account_balance,account_balance_wallet,add,apps,arrow_back,autorenew,calculate,calendar_month,candlestick_chart,check,check_circle,close,cloud,cloud_off,credit_card,database,delete,diamond,document_scanner,donut_small,edit,error,flag,history,home_work,info,key,lightbulb,local_fire_department,more_vert,payments,person,photo_camera,pie_chart,receipt_long,refresh,savings,search,settings,shield,sync,task_alt,timeline,trending_down,trending_up,upload_file,verified,warning"

AXES="opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
CSS_URL="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:${AXES}&icon_names=${ICONS}"

echo "Requesting subset for $(echo "$ICONS" | tr ',' '\n' | wc -l) icons…"
CSS=$(curl -fsS -H "User-Agent: $UA" "$CSS_URL")
# A subsetted font is served from /l/font?kit=… with no file extension, so match
# what is inside url(…) rather than looking for a .woff2 suffix.
FONT_URL=$(echo "$CSS" | grep -oE "url\(https://[^)]+\)" | head -1 | sed -e 's/^url(//' -e 's/)$//')
[ -n "$FONT_URL" ] || { echo "No font URL in the CSS response" >&2; exit 1; }

mkdir -p styles/fonts
curl -fsS -o styles/fonts/material-symbols-outlined-subset.woff2 "$FONT_URL"
echo "Wrote styles/fonts/material-symbols-outlined-subset.woff2 ($(du -h styles/fonts/material-symbols-outlined-subset.woff2 | cut -f1))"
