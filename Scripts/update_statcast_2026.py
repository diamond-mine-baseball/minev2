"""
update_statcast_2026.py — Pull aggregated Statcast stats from Baseball Savant
Expected stats leaderboard: xwOBA, EV, barrel%, hard_hit% per player/season.
Much faster than processing pitch-by-pitch CSV.

Usage:
  python3 update_statcast_2026.py
  python3 update_statcast_2026.py --year 2025
"""

import sqlite3, requests, logging, argparse, time
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

DB_PATH = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"
TODAY   = datetime.now().strftime("%Y-%m-%d")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def fetch_savant(year, player_type="batter"):
    """Fetch expected stats leaderboard from Baseball Savant."""
    url = (
        f"https://baseballsavant.mlb.com/leaderboard/expected_statistics"
        f"?type={player_type}&year={year}&position=&team=&min=1&csv=true"
    )
    log.info(f"  Fetching {player_type} Savant data for {year}...")
    time.sleep(2)
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()

    lines = r.text.strip().split("\n")
    if not lines:
        return []

    headers = [h.strip().strip('"') for h in lines[0].split(",")]
    rows = []
    for line in lines[1:]:
        vals = [v.strip().strip('"') for v in line.split(",")]
        if len(vals) == len(headers):
            rows.append(dict(zip(headers, vals)))
    log.info(f"  {len(rows)} rows fetched")
    return rows

def safe_float(v):
    try:
        f = float(v)
        return None if f != f else f
    except: return None

def safe_int(v):
    try: return int(float(v))
    except: return None

def update_batting_statcast(conn, year):
    rows = fetch_savant(year, "batter")

    updated = inserted_new = 0
    for row in rows:
        # Savant uses player_id (mlbam_id) and last_name, first_name
        mlbam_id = safe_int(row.get("player_id") or row.get("batter"))
        last  = (row.get("last_name") or "").strip()
        first = (row.get("first_name") or "").strip()
        name  = f"{first} {last}".strip() if first else last

        xwoba        = safe_float(row.get("est_woba") or row.get("xwoba"))
        xba          = safe_float(row.get("est_ba") or row.get("xba"))
        xslg         = safe_float(row.get("est_slg") or row.get("xslg"))
        ev           = safe_float(row.get("exit_velocity_avg") or row.get("launch_speed"))
        barrel_pct   = safe_float(row.get("barrel_batted_rate") or row.get("barrel_rate"))
        hard_hit_pct = safe_float(row.get("hard_hit_percent") or row.get("hard_hit_rate"))
        pa           = safe_int(row.get("pa") or row.get("attempts"))

        if not name and not mlbam_id:
            continue

        # Try to update by mlbam_id first, then by name
        affected = 0
        if mlbam_id:
            conn.execute("""
                UPDATE batting SET
                    xwoba=COALESCE(?,xwoba), ev=COALESCE(?,ev),
                    barrel_pct=COALESCE(?,barrel_pct),
                    hard_hit_pct=COALESCE(?,hard_hit_pct),
                    as_of=?
                WHERE mlbam_id=? AND season=?
            """, (xwoba, ev, barrel_pct, hard_hit_pct, TODAY, mlbam_id, year))
            affected = conn.execute("SELECT changes()").fetchone()[0]

        if affected == 0 and name:
            conn.execute("""
                UPDATE batting SET
                    xwoba=COALESCE(?,xwoba), ev=COALESCE(?,ev),
                    barrel_pct=COALESCE(?,barrel_pct),
                    hard_hit_pct=COALESCE(?,hard_hit_pct),
                    as_of=?
                WHERE LOWER(name)=LOWER(?) AND season=?
            """, (xwoba, ev, barrel_pct, hard_hit_pct, TODAY, name, year))
            affected = conn.execute("SELECT changes()").fetchone()[0]

        if affected > 0:
            updated += 1

    conn.commit()
    log.info(f"  Updated {updated} batting rows with Statcast data")

def update_pitching_statcast(conn, year):
    rows = fetch_savant(year, "pitcher")

    updated = 0
    for row in rows:
        mlbam_id = safe_int(row.get("player_id") or row.get("pitcher"))
        last  = (row.get("last_name") or "").strip()
        first = (row.get("first_name") or "").strip()
        name  = f"{first} {last}".strip() if first else last

        xera  = safe_float(row.get("xera") or row.get("est_era"))
        ev    = safe_float(row.get("exit_velocity_avg") or row.get("launch_speed"))
        hard_hit_pct = safe_float(row.get("hard_hit_percent"))
        barrel_pct   = safe_float(row.get("barrel_batted_rate"))

        if not name and not mlbam_id:
            continue

        affected = 0
        if mlbam_id:
            conn.execute("""
                UPDATE pitching SET
                    xera=COALESCE(?,xera),
                    hard_hit_pct=COALESCE(?,hard_hit_pct),
                    barrel_pct=COALESCE(?,barrel_pct),
                    as_of=?
                WHERE mlbam_id=? AND season=?
            """, (xera, hard_hit_pct, barrel_pct, TODAY, mlbam_id, year))
            affected = conn.execute("SELECT changes()").fetchone()[0]

        if affected == 0 and name:
            conn.execute("""
                UPDATE pitching SET
                    xera=COALESCE(?,xera),
                    hard_hit_pct=COALESCE(?,hard_hit_pct),
                    barrel_pct=COALESCE(?,barrel_pct),
                    as_of=?
                WHERE LOWER(name)=LOWER(?) AND season=?
            """, (xera, hard_hit_pct, barrel_pct, TODAY, name, year))
            affected = conn.execute("SELECT changes()").fetchone()[0]

        if affected > 0:
            updated += 1

    conn.commit()
    log.info(f"  Updated {updated} pitching rows with Statcast data")

def spot_check(conn, year):
    log.info(f"\nSpot check {year} Statcast coverage:")
    for name in ("Francisco Lindor", "Jordan Walker", "Yordan Alvarez", "Aaron Judge"):
        r = conn.execute("""
            SELECT name, xwoba, ev, barrel_pct, hard_hit_pct
            FROM batting WHERE LOWER(name)=LOWER(?) AND season=?
        """, (name, year)).fetchone()
        if r:
            log.info(f"  {r[0]}: xwOBA={r[1]}, EV={r[2]}, Barrel%={r[3]}, HH%={r[4]}")
        else:
            log.info(f"  {name}: not found")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now().year)
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        log.info(f"Updating Statcast stats for {args.year}...")
        update_batting_statcast(conn, args.year)
        update_pitching_statcast(conn, args.year)
        spot_check(conn, args.year)
        log.info("Done.")
    finally:
        conn.close()
