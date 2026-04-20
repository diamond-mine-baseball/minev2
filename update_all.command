#!/bin/bash
export RAILWAY_TOKEN=b3c22025-3ee6-4c2f-adc5-bc89d42f75b9
# DiamondMine — Master Update Script
# Runs all data updates, recomputes SDI, uploads DB, redeploys Railway
# Usage: double-click, or pass --drs to also reload DRS from CSV

set -e

YEAR=$(date +%Y)
TAG="db-$(date +%Y-%m-%d)"
DIR="$HOME/Desktop/DiamondMinev2"
SCRIPTS="$DIR/Scripts"

echo "╔══════════════════════════════════════════╗"
echo "║   DiamondMine Update — $(date +%Y-%m-%d)       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: BRef standard stats (requires browser CSV download first) ─────────
if [ -f "$HOME/Downloads/bref_batting_${YEAR}.csv" ] && [ -f "$HOME/Downloads/bref_pitching_${YEAR}.csv" ]; then
    echo "▶ Step 1/6 — Importing BRef CSVs..."
    python3 "$SCRIPTS/update_bref_csv.py" --year $YEAR
else
    echo "⚠ Step 1/6 — BRef CSVs not found in Downloads, skipping."
    echo "  To update BRef: visit baseball-reference.com and download:"
    echo "  • /leagues/majors/${YEAR}-standard-batting.shtml"
    echo "  • /leagues/majors/${YEAR}-standard-pitching.shtml"
fi

# ── Step 2: MLB Stats API ─────────────────────────────────────────────────────
echo ""
echo "▶ Step 2/6 — MLB Stats API (${YEAR})..."
python3 "$SCRIPTS/load_data.py" --step mlb --year $YEAR

# ── Step 3: Statcast from Baseball Savant ────────────────────────────────────
echo ""
echo "▶ Step 3/6 — Statcast / Baseball Savant (${YEAR})..."
python3 "$SCRIPTS/update_statcast_2026.py" --year $YEAR

# ── Step 4: DRS from Fielding Bible (scrape + load) ──────────────────────────
if [[ "$*" == *"--drs"* ]]; then
    echo ""
    echo "▶ Step 4/6 — DRS from Fielding Bible..."
    
    # Open browser and scrape all 31 pages
    open "https://www.fieldingbible.com/drs-leaderboard/players"
    echo "  Waiting 5 seconds for page to load..."
    sleep 5
    
    # Inject scraper via osascript (runs JS in Chrome)
    osascript << 'APPLESCRIPT'
tell application "Google Chrome"
    set drsScript to "async function scrapeAll() { var all = []; function extract() { return Array.from(document.querySelectorAll('table tbody tr')).map(tr => { var cells = Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim()); return { name:cells[1], g:cells[2], inn:cells[3], total_drs:cells[4], art:cells[5], gfp_dme:cells[6], bunts:cells[7], gdp:cells[8], of_arm:cells[9], sb:cells[10], sz:cells[11], adj_er:cells[12] }; }).filter(r=>r.name); } function getBtn(n) { return Array.from(document.querySelectorAll('button,a')).find(el=>el.textContent.trim()===String(n)); } all = all.concat(extract()); for (var p = 2; p <= 31; p++) { var btn = getBtn(p); if (!btn) break; btn.click(); await new Promise(r=>setTimeout(r,900)); all = all.concat(extract()); } window._allDRS = all; var csv = 'season,player,g,inn,total_drs,art,gfp_dme,bunts,gdp,of_arm,sb,sz,adj_er\n'; all.forEach(function(row) { var vals = ['" & (do shell script "date +%Y") & "', row.name, row.g, row.inn, row.total_drs, row.art, row.gfp_dme, row.bunts, row.gdp, row.of_arm, row.sb, row.sz, row.adj_er].map(function(v) { return '\"' + String(v||'').replace(/\"/g,'\"\"') + '\"'; }); csv += vals.join(',') + '\n'; }); var blob = new Blob([csv], {type:'text/csv'}); var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'drs_" & (do shell script "date +%Y") & ".csv'; a.click(); } scrapeAll();"
    execute front window's active tab javascript drsScript
end tell
APPLESCRIPT

else
    echo ""
    echo "ℹ Step 4/6 — DRS skipped (pass --drs to include)"
    echo "  To update DRS: run ./update_all.command --drs"
fi

# ── Step 5: Recompute SDI ─────────────────────────────────────────────────────
echo ""
echo "▶ Step 5/6 — Recomputing SDI..."
python3 "$SCRIPTS/compute_sdi.py"

# ── Step 6/6 — Upload DB and trigger redeploy ─────────────────────────────────
echo ""
echo "▶ Step 6/6 — Uploading database..."

gh release delete "$TAG" --repo diamond-mine-baseball/minev2 --yes 2>/dev/null || true
gh release create "$TAG" "$DIR/diamondmine.db" \
    --repo diamond-mine-baseball/minev2 \
    --title "Database $TAG" \
    --notes "Daily update"

# Update the DB URL in railway.toml and push to trigger auto-redeploy
cd "$DIR"
sed -i '' "s|DB_DOWNLOAD_URL=.*|DB_DOWNLOAD_URL=https://github.com/diamond-mine-baseball/minev2/releases/download/$TAG/diamondmine.db|g" railway.toml 2>/dev/null || true
git add -A
git commit -m "Daily update $TAG" --allow-empty
git push

echo ""
echo "Done! Railway will redeploy automatically from the git push."
read -p "Press Enter to close..."
