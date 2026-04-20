#!/bin/bash
set -e
YEAR=$(date +%Y)
TAG="db-$(date +%Y-%m-%d)"
DIR="$HOME/Desktop/DiamondMinev2"
export RAILWAY_TOKEN=6ff0ec00-ddfc-45df-9043-18f2cb1c370d
echo "Updating stats for $YEAR..."
python3 ~/Desktop/DiamondMinev2/Scripts/update_statcast_2026.py
python3 "$DIR/Scripts/load_data.py" --step bref --year $YEAR
python3 "$DIR/Scripts/load_data.py" --step mlb --year $YEAR
python3 "$DIR/Scripts/load_data.py" --step statcast --year $YEAR
gh release delete "$TAG" --repo diamond-mine-baseball/minev2 --yes 2>/dev/null || true
python3 "$DIR/Scripts/update_statcast_2026.py" --year $YEAR
python3 "$DIR/Scripts/compute_sdi.py"
gh release create "$TAG" "$DIR/diamondmine.db" --repo diamond-mine-baseball/minev2 --title "Database $TAG" --notes "Daily refresh"
railway link --project bc8088e7-4cab-47db-b987-ca7e0661a0be
railway variables set DB_DOWNLOAD_URL="https://github.com/diamond-mine-baseball/minev2/releases/download/$TAG/diamondmine.db" --service minev2 --project bc8088e7-4cab-47db-b987-ca7e0661a0be
railway redeploy --service minev2 --project bc8088e7-4cab-47db-b987-ca7e0661a0be
echo "Done! dmbapp.us updated."