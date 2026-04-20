"""
update_drs.py — Load DRS data from Fielding Bible CSV into drs table
CSV is scraped from fieldingbible.com/drs-leaderboard/players

Usage:
  python3 update_drs.py --year 2026 --file ~/Downloads/drs_2026.csv
"""

import sqlite3, csv, logging, argparse, unicodedata, re
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

DB_PATH = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"

def safe_int(v):
    try:
        s = str(v).strip().replace('-', '').replace(' ', '')
        if not s or s in ('', '-', '—'): return None
        # Handle negative values
        neg = str(v).strip().startswith('-')
        return -int(float(s)) if neg else int(float(s))
    except: return None

def safe_float(v):
    try:
        s = str(v).strip()
        if not s or s in ('', '-', '—'): return None
        return float(s)
    except: return None

def strip_accents(s):
    s = unicodedata.normalize("NFD", str(s))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()

def main(year, csv_path):
    if not csv_path.exists():
        log.error(f"File not found: {csv_path}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    # Read CSV
    rows = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)
    log.info(f"Read {len(rows)} rows from {csv_path.name}")

    # Delete existing rows for this season
    deleted = conn.execute("DELETE FROM drs WHERE season=?", (year,)).rowcount
    conn.commit()
    log.info(f"Deleted {deleted} existing rows for {year}")

    inserted = 0
    for row in rows:
        player = strip_accents(row.get('player', '').strip())
        if not player:
            continue

        # Map CSV columns to DB columns
        # total_drs -> total, gfp_dme -> gfpdm, sz -> strike_zone
        conn.execute("""
            INSERT INTO drs (player, season, g, inn, total, art, gfpdm, sb, of_arm, bunt, gdp, adj_er, strike_zone)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            player,
            year,
            safe_int(row.get('g')),
            safe_float(row.get('inn')),
            safe_int(row.get('total_drs')),
            safe_int(row.get('art')),
            safe_int(row.get('gfp_dme')),
            safe_int(row.get('sb')),
            safe_int(row.get('of_arm')),
            safe_int(row.get('bunts')),
            safe_int(row.get('gdp')),
            safe_int(row.get('adj_er')),
            safe_int(row.get('sz')),
        ))
        inserted += 1

    conn.commit()
    log.info(f"Inserted {inserted} rows for {year}")

    # Spot check
    log.info("\nTop 10 DRS:")
    for r in conn.execute("SELECT player, g, total FROM drs WHERE season=? ORDER BY total DESC LIMIT 10", (year,)).fetchall():
        log.info(f"  {r[0]}: {r[2]} DRS ({r[1]}g)")

    conn.close()
    log.info("Done.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now().year)
    parser.add_argument("--file", type=Path, default=Path.home()/"Downloads"/f"drs_{datetime.now().year}.csv")
    args = parser.parse_args()
    main(args.year, args.file)
