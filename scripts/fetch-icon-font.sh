#!/usr/bin/env bash
# Regenerate the bundled Material Symbols subset.
#
# The full variable font is 3.8MB for ~2500 icons; this app uses ~34. Google's
# CSS API subsets by icon name server-side, which fonttools cannot do cleanly
# for a ligature font (the glyphs are reached through GSUB, not codepoints, so
# keeping the 27 characters an icon name is spelled with would keep the whole
# font).
#
# Run this whenever ICONS changes, then commit the .woff2 and icons.json. The
# built app makes no request to Google — these are one-off, checked-in artifacts.
set -euo pipefail
cd "$(dirname "$0")/.."

# Every Material Symbol the app renders. Keeping this in step with the code by
# hand failed twice, so it is no longer trusted on its own: the run writes
# icons.json beside the font as a receipt, and tests/frontend/iconSubset.test.ts
# fails when a name a component renders is missing from it, or when the
# committed font is not the one the receipt was written for. Add the icon here,
# re-run, commit both files.
ICONS="account_balance,account_balance_wallet,add,apps,arrow_back,autorenew,bolt,calculate,calendar_month,candlestick_chart,category,check,check_circle,chevron_right,close,cloud,cloud_off,credit_card,database,delete,diamond,directions_bus,document_scanner,donut_small,edit,error,expand_more,fitness_center,flag,history,home,home_work,info,key,lightbulb,local_fire_department,more_vert,movie,music_note,notifications_active,payments,person,photo_camera,pie_chart,receipt_long,refresh,savings,search,settings,shield,shopping_cart,smart_display,smartphone,subscriptions,sync,task_alt,timeline,trending_down,trending_up,upload_file,verified,warning,wifi"

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
FONT=styles/fonts/material-symbols-outlined-subset.woff2
curl -fsS -o "$FONT" "$FONT_URL"
echo "Wrote $FONT ($(du -h "$FONT" | cut -f1))"

# The receipt: what was asked for, and the font that came back. Written only
# after a successful download, so a font that was never regenerated — or never
# committed — is detectable from the test suite.
python3 scripts/write-icon-receipt.py "$ICONS" "$FONT"
