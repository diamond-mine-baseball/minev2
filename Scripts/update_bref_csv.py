"""
update_bref_csv.py — Update DB from browser-downloaded BRef CSVs
Run after downloading bref_batting_YEAR.csv and bref_pitching_YEAR.csv

Usage:
  python3 update_bref_csv.py --year 2026
"""

import sqlite3, argparse, unicodedata, re, logging
from pathlib import Path
from datetime import datetime
import pandas as pd

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

DB_PATH      = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"
DOWNLOADS    = Path.home() / "Downloads"
TODAY        = datetime.now().strftime("%Y-%m-%d")

def safe_float(v):
    try: return float(v) if v is not None and str(v).strip() not in ("", "nan", "---") else None
    except: return None

def safe_int(v):
    try: return int(float(v)) if v is not None and str(v).strip() not in ("", "nan", "---") else None
    except: return None

def update_batting(conn, year):
    csv_path = DOWNLOADS / f"bref_batting_{year}.csv"
    if not csv_path.exists():
        log.error(f"File not found: {csv_path}")
        log.error("Download it first: go to baseball-reference.com/leagues/majors/{year}-standard-batting.shtml")
        return

    df = pd.read_csv(csv_path)
    log.info(f"Batting: {len(df)} rows from {csv_path.name}")
    log.info(f"Columns: {list(df.columns[:10])}")

    updated = inserted = 0
    for _, row in df.iterrows():
        name = str(row.get("name_display", "")).strip()
        team = str(row.get("team_name_abbr", "")).strip()
        if not name or team in ("", "TOT", "nan"):
            continue

        # Check if row exists
        existing = conn.execute(
            "SELECT 1 FROM batting WHERE LOWER(name)=LOWER(?) AND season=? AND team=?",
            (name, year, team)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE batting SET
                    bwar    = COALESCE(?, bwar),
                    opsplus = COALESCE(?, opsplus),
                    obp     = COALESCE(?, obp),
                    slg     = COALESCE(?, slg),
                    ops     = COALESCE(?, ops),
                    avg     = COALESCE(?, avg),
                    doubles = COALESCE(?, doubles),
                    triples = COALESCE(?, triples),
                    as_of   = ?
                WHERE LOWER(name)=LOWER(?) AND season=? AND team=?
            """, (
                safe_float(row.get("b_war")),
                safe_int(row.get("b_onbase_plus_slugging_plus")),
                safe_float(row.get("b_onbase_perc")),
                safe_float(row.get("b_slugging_perc")),
                safe_float(row.get("b_onbase_plus_slugging")),
                safe_float(row.get("b_batting_avg")),
                safe_int(row.get("b_doubles")),
                safe_int(row.get("b_triples")),
                TODAY, name, year, team
            ))
            updated += 1
        else:
            conn.execute("""
                INSERT OR IGNORE INTO batting
                    (name, season, team, age, g, pa, ab, h, hr, rbi, bb, so, sb,
                     avg, obp, slg, ops, bwar, opsplus, doubles, triples, as_of)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                name, year, team,
                safe_int(row.get("age")),
                safe_int(row.get("b_games")),
                safe_int(row.get("b_pa")),
                safe_int(row.get("b_ab")),
                safe_int(row.get("b_h")),
                safe_int(row.get("b_hr")),
                safe_int(row.get("b_rbi")),
                safe_int(row.get("b_bb")),
                safe_int(row.get("b_so")),
                safe_int(row.get("b_sb")),
                safe_float(row.get("b_batting_avg")),
                safe_float(row.get("b_onbase_perc")),
                safe_float(row.get("b_slugging_perc")),
                safe_float(row.get("b_onbase_plus_slugging")),
                safe_float(row.get("b_war")),
                safe_int(row.get("b_onbase_plus_slugging_plus")),
                safe_int(row.get("b_doubles")),
                safe_int(row.get("b_triples")),
                TODAY
            ))
            inserted += 1

    conn.commit()
    log.info(f"  Updated: {updated}, Inserted: {inserted}")

def update_pitching(conn, year):
    csv_path = DOWNLOADS / f"bref_pitching_{year}.csv"
    if not csv_path.exists():
        log.error(f"File not found: {csv_path}")
        return

    df = pd.read_csv(csv_path)
    log.info(f"Pitching: {len(df)} rows from {csv_path.name}")

    updated = inserted = 0
    for _, row in df.iterrows():
        name = str(row.get("name_display", "")).strip()
        team = str(row.get("team_name_abbr", "")).strip()
        if not name or team in ("", "TOT", "nan"):
            continue

        existing = conn.execute(
            "SELECT 1 FROM pitching WHERE LOWER(name)=LOWER(?) AND season=? AND team=?",
            (name, year, team)
        ).fetchone()

        if existing:
            conn.execute("""
                UPDATE pitching SET
                    bwar    = COALESCE(?, bwar),
                    eraplus = COALESCE(?, eraplus),
                    as_of   = ?
                WHERE LOWER(name)=LOWER(?) AND season=? AND team=?
            """, (
                safe_float(row.get("p_war")),
                safe_int(row.get("earned_run_avg_plus")),
                TODAY, name, year, team
            ))
            updated += 1
        else:
            conn.execute("""
                INSERT OR IGNORE INTO pitching
                    (name, season, team, age, g, gs, w, l, sv, ip, h, er, bb, so,
                     era, whip, bwar, eraplus, as_of)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                name, year, team,
                safe_int(row.get("age")),
                safe_int(row.get("p_g")),
                safe_int(row.get("p_gs")),
                safe_int(row.get("p_w")),
                safe_int(row.get("p_l")),
                safe_int(row.get("p_sv")),
                safe_float(row.get("p_ip")),
                safe_int(row.get("p_h")),
                safe_int(row.get("p_er")),
                safe_int(row.get("p_bb")),
                safe_int(row.get("p_so")),
                safe_float(row.get("p_earned_run_avg")),
                safe_float(row.get("p_whip")),
                safe_float(row.get("p_war")),
                safe_int(row.get("earned_run_avg_plus")),
                TODAY
            ))
            inserted += 1

    conn.commit()
    log.info(f"  Updated: {updated}, Inserted: {inserted}")

    # Spot check
    row = conn.execute("""
        SELECT name, bwar, eraplus FROM pitching
        WHERE season=? AND bwar IS NOT NULL
        ORDER BY bwar DESC LIMIT 5
    """, (year,)).fetchall()
    log.info("Top 5 pitchers by bWAR:")
    for r in row:
        log.info(f"  {r[0]}: bWAR={r[1]}, ERA+={r[2]}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now().year)
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    try:
        update_batting(conn, args.year)
        update_pitching(conn, args.year)

        # Spot check batting
        rows = conn.execute("""
            SELECT name, bwar, opsplus FROM batting
            WHERE season=? AND bwar IS NOT NULL
            ORDER BY bwar DESC LIMIT 5
        """, (args.year,)).fetchall()
        log.info(f"Top 5 batters by bWAR ({args.year}):")
        for r in rows:
            log.info(f"  {r[0]}: bWAR={r[1]}, OPS+={r[2]}")

        log.info("Done.")
    finally:
        conn.close()
