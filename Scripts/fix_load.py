"""
DiamondMinev2 — Fix Script
===========================
Fixes two issues from the initial load:

1. Duplicate batting/pitching rows where team='' (MLB API combined-season rows)
   → Merges mlbam_id from empty-team rows into team-specific BRef rows, then deletes dupes

2. Low fielding counts (~200/year instead of ~2000+)
   → Re-fetches with playerPool=ALL and proper pagination

Usage:
    python3 fix_load.py
    python3 fix_load.py --step dupes       # only fix duplicates
    python3 fix_load.py --step fielding    # only fix fielding
"""

import sqlite3
import requests
import time
import logging
import argparse
from pathlib import Path
from datetime import datetime

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

DB_PATH      = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"
MLB_API      = "https://statsapi.mlb.com/api/v1"
START_YEAR   = 2015
CURRENT_YEAR = datetime.now().year
TODAY        = datetime.now().strftime("%Y-%m-%d")

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
})

def safe_int(v):
    try:
        return int(float(v)) if v is not None and str(v).strip() not in ("", "nan") else None
    except: return None

def safe_float(v):
    try:
        return float(v) if v is not None and str(v).strip() not in ("", "nan") else None
    except: return None


# ── Fix 1: Deduplicate empty-team rows ────────────────────────────────────────

def fix_duplicates(conn):
    log.info("Fix 1: Removing empty-team duplicate rows...")

    for table in ("batting", "pitching"):
        # Find all (name, season) pairs that have both a team='' row and a real team row
        dupes = conn.execute(f"""
            SELECT name, season
            FROM {table}
            WHERE team = ''
            AND EXISTS (
                SELECT 1 FROM {table} b2
                WHERE b2.name = {table}.name
                  AND b2.season = {table}.season
                  AND b2.team != ''
            )
        """).fetchall()

        log.info(f"  {table}: {len(dupes)} empty-team rows to merge + delete")

        merged = deleted = 0
        for name, season in dupes:
            # Get the empty-team row (has mlbam_id from MLB API)
            if table == "batting":
                empty_row = conn.execute("""
                    SELECT id, mlbam_id, r, doubles, triples, cs, ibb, hbp, sf
                    FROM batting WHERE name=? AND season=? AND team=''
                """, (name, season)).fetchone()
            else:
                empty_row = conn.execute("""
                    SELECT id, mlbam_id, r, ibb, hbp, wp, tbf
                    FROM pitching WHERE name=? AND season=? AND team=''
                """, (name, season)).fetchone()

            if not empty_row:
                continue

            empty_id = empty_row[0]
            mlbam_id = empty_row[1]

            # Get all real-team rows for this player-season
            real_rows = conn.execute(f"""
                SELECT id FROM {table}
                WHERE name=? AND season=? AND team != ''
            """, (name, season)).fetchall()

            # Copy mlbam_id and extended stats to real team rows
            for (real_id,) in real_rows:
                if table == "batting":
                    conn.execute("""
                        UPDATE batting SET
                          mlbam_id = COALESCE(mlbam_id, ?),
                          r        = COALESCE(r, ?),
                          doubles  = COALESCE(doubles, ?),
                          triples  = COALESCE(triples, ?),
                          cs       = COALESCE(cs, ?),
                          ibb      = COALESCE(ibb, ?),
                          hbp      = COALESCE(hbp, ?),
                          sf       = COALESCE(sf, ?)
                        WHERE id=?
                    """, (mlbam_id, empty_row[2], empty_row[3], empty_row[4],
                          empty_row[5], empty_row[6], empty_row[7], empty_row[8],
                          real_id))
                else:
                    conn.execute("""
                        UPDATE pitching SET
                          mlbam_id = COALESCE(mlbam_id, ?),
                          r        = COALESCE(r, ?),
                          ibb      = COALESCE(ibb, ?),
                          hbp      = COALESCE(hbp, ?),
                          wp       = COALESCE(wp, ?),
                          tbf      = COALESCE(tbf, ?)
                        WHERE id=?
                    """, (mlbam_id, empty_row[2], empty_row[3], empty_row[4],
                          empty_row[5], empty_row[6], real_id))
                merged += 1

            # Delete the empty-team row
            conn.execute(f"DELETE FROM {table} WHERE id=?", (empty_id,))
            deleted += 1

        conn.commit()
        log.info(f"  {table}: {merged} rows updated with mlbam_id, {deleted} empty-team rows deleted")

    # Verify
    for table in ("batting", "pitching"):
        remaining = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE team=''"
        ).fetchone()[0]
        log.info(f"  {table}: {remaining} empty-team rows remaining (should be 0 or near 0)")


# ── Fix 2: Re-fetch fielding with playerPool=ALL ───────────────────────────────

def fetch_fielding_full(year):
    """Fetch ALL fielding stats with playerPool=ALL and pagination."""
    all_rows = []
    offset = 0
    limit  = 500

    while True:
        url = (
            f"{MLB_API}/stats"
            f"?stats=season&group=fielding&season={year}"
            f"&sportId=1&playerPool=ALL"
            f"&limit={limit}&offset={offset}"
        )
        try:
            r = SESSION.get(url, timeout=30)
            r.raise_for_status()
            data   = r.json()
            splits = data.get("stats", [{}])[0].get("splits", [])

            if not splits:
                break

            for s in splits:
                p   = s.get("player", {})
                t   = s.get("team", {})
                st  = s.get("stat", {})
                pos = s.get("position", {})
                all_rows.append({
                    "name":     p.get("fullName"),
                    "mlbam_id": p.get("id"),
                    "team":     t.get("abbreviation", ""),
                    "season":   year,
                    "pos":      pos.get("abbreviation", ""),
                    "g":        st.get("gamesPlayed"),
                    "gs":       st.get("gamesStarted"),
                    "inn":      safe_float(st.get("innings")),
                    "tc":       st.get("chances"),
                    "po":       st.get("putOuts"),
                    "a":        st.get("assists"),
                    "e":        st.get("errors"),
                    "dp":       st.get("doublePlays"),
                    "fld_pct":  safe_float(st.get("fielding")),
                })

            # Check if there are more pages
            total = data.get("stats", [{}])[0].get("totalSplits", 0)
            offset += limit
            if offset >= total or len(splits) < limit:
                break

        except Exception as e:
            log.error(f"  Fielding fetch error {year} offset={offset}: {e}")
            break

    return all_rows


def fix_fielding(conn, year_filter=None):
    log.info("Fix 2: Re-fetching fielding with playerPool=ALL...")

    years = [year_filter] if year_filter else list(range(START_YEAR, CURRENT_YEAR + 1))
    total = 0

    for year in years:
        # Clear existing fielding for this year
        conn.execute("DELETE FROM fielding WHERE season=?", (year,))
        conn.commit()

        rows = fetch_fielding_full(year)
        inserted = 0

        for row in rows:
            if not row["name"] or not row["pos"]:
                continue
            try:
                conn.execute("""
                    INSERT INTO fielding
                      (name, season, team, pos, mlbam_id, g, gs, inn,
                       tc, po, a, e, dp, fld_pct, as_of)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(name, season, team, pos) DO UPDATE SET
                      mlbam_id=excluded.mlbam_id, g=excluded.g, gs=excluded.gs,
                      inn=excluded.inn, tc=excluded.tc, po=excluded.po,
                      a=excluded.a, e=excluded.e, dp=excluded.dp,
                      fld_pct=excluded.fld_pct, as_of=excluded.as_of
                """, (
                    row["name"], year, row["team"], row["pos"], row["mlbam_id"],
                    safe_int(row["g"]), safe_int(row["gs"]), row["inn"],
                    safe_int(row["tc"]), safe_int(row["po"]), safe_int(row["a"]),
                    safe_int(row["e"]), safe_int(row["dp"]), row["fld_pct"], TODAY,
                ))
                inserted += 1
            except Exception as e:
                pass

        conn.commit()
        total += inserted
        log.info(f"  {year}: {inserted} fielding rows (was ~{200})")
        time.sleep(0.3)

    # Update freshness
    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('mlb_stats_api', 'fielding', ?, ?, 'refetched with playerPool=ALL')
    """, (TODAY, total))
    conn.commit()
    log.info(f"  Total fielding rows: {total}")


# ── Summary ────────────────────────────────────────────────────────────────────

def print_summary(conn):
    log.info("\n" + "="*50)
    for table in ("batting", "pitching", "fielding"):
        n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        log.info(f"  {table:<15} {n:>8,} rows")

    log.info("\nFielding by season (sample):")
    for r in conn.execute(
        "SELECT season, COUNT(*) FROM fielding GROUP BY season ORDER BY season"
    ).fetchall():
        log.info(f"  {r[0]}: {r[1]:,}")

    log.info("\nSpot check — no empty-team rows:")
    for table in ("batting", "pitching"):
        n = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE team=''").fetchone()[0]
        log.info(f"  {table} empty-team rows: {n}")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--step", choices=["dupes", "fielding", "all"], default="all")
    parser.add_argument("--year", type=int, default=None)
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    if args.step in ("dupes", "all"):
        fix_duplicates(conn)

    if args.step in ("fielding", "all"):
        fix_fielding(conn, args.year)

    print_summary(conn)
    conn.close()
    log.info("Done.")


if __name__ == "__main__":
    main()
