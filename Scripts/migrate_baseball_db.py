"""
migrate_baseball_db.py
Migrates valuable data from baseball.db → diamondmine.db

What gets migrated:
  1. position → player table
  2. projections_2026_batting/pitching → projections_batting/pitching
  3. fantasy_points → fantasy_points
  4. Advanced fielding (OAA, UZR, RZR) → new columns on fielding table
  5. FanGraphs batting extras (wRC+, wOBA, BABIP, ISO, fWAR) → new columns on batting

Usage:
  python3 migrate_baseball_db.py
  python3 migrate_baseball_db.py --dry-run   # shows what would happen without writing
"""

import sqlite3, logging, argparse, unicodedata, re
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

SRC  = Path.home() / "Desktop" / "baseball.db"
DEST = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"

def normalize(s):
    if not s: return ""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 .]", "", s.lower()).strip()

def migrate(dry_run=False):
    src  = sqlite3.connect(SRC);  src.row_factory  = sqlite3.Row
    dest = sqlite3.connect(DEST); dest.row_factory = sqlite3.Row
    dest.execute("PRAGMA journal_mode=WAL")

    # ── 1. Position → player table ──────────────────────────────────────────
    log.info("Step 1/5 — Migrating position data to player table...")

    # Add position column if missing
    existing = [c[1] for c in dest.execute("PRAGMA table_info(player)").fetchall()]
    if "position" not in existing:
        if not dry_run:
            dest.execute("ALTER TABLE player ADD COLUMN position TEXT")
            dest.commit()
        log.info("  Added position column to player table")

    src_players = src.execute("""
        SELECT name, position, first_season, last_season FROM player
        WHERE position IS NOT NULL AND position != ''
    """).fetchall()

    updated = skipped = 0
    for row in src_players:
        name_key = normalize(row["name"])
        # Try to match by name
        match = dest.execute("""
            SELECT mlbam_id, name FROM player
            WHERE LOWER(REPLACE(name, '.', '')) = LOWER(REPLACE(?, '.', ''))
            OR LOWER(name) = LOWER(?)
        """, (row["name"], row["name"])).fetchone()

        if match and not dry_run:
            dest.execute("UPDATE player SET position=? WHERE mlbam_id=?",
                        (row["position"], match["mlbam_id"]))
            updated += 1
        elif not match:
            skipped += 1

    if not dry_run: dest.commit()
    log.info(f"  Position: {updated} updated, {skipped} no match")

    # ── 2. Projections ───────────────────────────────────────────────────────
    log.info("Step 2/5 — Migrating 2026 projections...")

    bat_proj = src.execute("SELECT * FROM projections_2026_batting").fetchall()
    pit_proj = src.execute("SELECT * FROM projections_2026_pitching").fetchall()

    if not dry_run:
        dest.execute("DELETE FROM projections_batting WHERE season=2026")
        dest.execute("DELETE FROM projections_pitching WHERE season=2026")

        for row in bat_proj:
            dest.execute("""
                INSERT OR IGNORE INTO projections_batting
                (name, season, source, team, pos, is_dh, g, pa, hr, rbi, r, sb, avg, obp, slg, ops)
                VALUES (?,2026,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """, (
                row["name"], row["source"], row["team"],
                row["proj_position"], row["is_dh"],
                row["g"], row["pa"], row["hr"], row["rbi"],
                row["r"], row["sb"], row["avg"],
                None, None, None,  # obp/slg/ops not in source
            ))

        for row in pit_proj:
            dest.execute("""
                INSERT OR IGNORE INTO projections_pitching
                (name, season, source, team, w, sv, ip, era, whip, k_9, bb_9)
                VALUES (?,2026,?,?,?,?,?,?,?,?,?)
            """, (
                row["name"], row["source"], row["team"],
                row["w"], row["sv"], row["ip"],
                row["era"], None, None, None,
            ))

        dest.commit()
    log.info(f"  Batting projections: {len(bat_proj)} rows")
    log.info(f"  Pitching projections: {len(pit_proj)} rows")

    # ── 3. Fantasy points ────────────────────────────────────────────────────
    log.info("Step 3/5 — Migrating fantasy points...")

    fp_count = src.execute("SELECT COUNT(*) FROM fantasy_points").fetchone()[0]

    # Need to map idfg → name/mlbam_id for dest
    # dest fantasy_points has (name, mlbam_id, season, player_type, league_name, total_points, points_per_game)
    # src has (idfg, player_name, season, position, team, g, bat_points, pit_points, total_points, fp_per_game)
    if not dry_run:
        dest.execute("DELETE FROM fantasy_points WHERE season >= 2015")
        rows = src.execute("""
            SELECT player_name, season, position, total_points, fp_per_game
            FROM fantasy_points
            WHERE season >= 2015
        """).fetchall()
        inserted = 0
        for row in rows:
            player_type = 'pitcher' if row['position'] in ('SP','RP','P') else 'batter'
            dest.execute("""
                INSERT OR IGNORE INTO fantasy_points
                (name, season, player_type, total_points, points_per_game)
                VALUES (?,?,?,?,?)
            """, (row['player_name'], row['season'], player_type,
                  row['total_points'], row['fp_per_game']))
            inserted += 1
        dest.commit()
        log.info(f"  Fantasy points: {inserted} rows inserted")
    else:
        log.info(f"  Fantasy points: {fp_count} rows would be migrated")

    # ── 4. Advanced fielding (OAA, UZR) → add columns to fielding ──────────
    log.info("Step 4/5 — Adding advanced fielding columns (OAA, UZR, RZR, ARM)...")

    fielding_cols = [c[1] for c in dest.execute("PRAGMA table_info(fielding)").fetchall()]
    new_cols = [
        ("oaa",     "REAL"),
        ("uzr",     "REAL"),
        ("uzr_150", "REAL"),
        ("rzr",     "REAL"),
        ("arm",     "REAL"),
        ("dpr",     "REAL"),
        ("rngr",    "REAL"),
    ]
    for col, typ in new_cols:
        if col not in fielding_cols:
            if not dry_run:
                dest.execute(f"ALTER TABLE fielding ADD COLUMN {col} {typ}")
            log.info(f"  Added fielding.{col}")
    if not dry_run: dest.commit()

    # Now populate from baseball.db fielding
    src_fielding = src.execute("""
        SELECT name, season, pos, oaa, uzr, uzr_150, rzr, arm, dpr, rngr
        FROM fielding
        WHERE oaa IS NOT NULL OR uzr IS NOT NULL
    """).fetchall()

    updated = 0
    for row in src_fielding:
        if not dry_run:
            res = dest.execute("""
                UPDATE fielding SET
                    oaa=COALESCE(?,oaa), uzr=COALESCE(?,uzr),
                    uzr_150=COALESCE(?,uzr_150), rzr=COALESCE(?,rzr),
                    arm=COALESCE(?,arm), dpr=COALESCE(?,dpr), rngr=COALESCE(?,rngr)
                WHERE LOWER(name)=LOWER(?) AND season=? AND pos=?
            """, (row["oaa"], row["uzr"], row["uzr_150"], row["rzr"],
                  row["arm"], row["dpr"], row["rngr"],
                  row["name"], row["season"], row["pos"]))
            updated += res.rowcount
    if not dry_run: dest.commit()
    log.info(f"  Advanced fielding: {updated} rows updated")

    # ── 5. FanGraphs batting extras (wRC+, wOBA, BABIP, ISO, fWAR) ─────────
    log.info("Step 5/5 — Adding FanGraphs batting columns (wRC+, wOBA, BABIP, fWAR)...")

    bat_cols = [c[1] for c in dest.execute("PRAGMA table_info(batting)").fetchall()]
    fg_cols = [
        ("wrcplus",  "INTEGER"),
        ("woba",     "REAL"),
        ("babip",    "REAL"),
        ("iso",      "REAL"),
        ("fwar",     "REAL"),
        ("spd",      "REAL"),  # speed score
    ]
    for col, typ in fg_cols:
        if col not in bat_cols:
            if not dry_run:
                dest.execute(f"ALTER TABLE batting ADD COLUMN {col} {typ}")
            log.info(f"  Added batting.{col}")
    if not dry_run: dest.commit()

    src_batting = src.execute("""
        SELECT name, season, team, wrcplus, woba, babip, iso, fwar, spd
        FROM batting
        WHERE wrcplus IS NOT NULL OR woba IS NOT NULL
    """).fetchall()

    updated = 0
    for row in src_batting:
        if not dry_run:
            res = dest.execute("""
                UPDATE batting SET
                    wrcplus=COALESCE(?,wrcplus), woba=COALESCE(?,woba),
                    babip=COALESCE(?,babip), iso=COALESCE(?,iso),
                    fwar=COALESCE(?,fwar), spd=COALESCE(?,spd)
                WHERE LOWER(name)=LOWER(?) AND season=?
            """, (row["wrcplus"], row["woba"], row["babip"], row["iso"],
                  row["fwar"], row["spd"], row["name"], row["season"]))
            updated += res.rowcount
    if not dry_run: dest.commit()
    log.info(f"  FanGraphs batting extras: {updated} rows updated")

    # ── Summary ──────────────────────────────────────────────────────────────
    log.info("\n" + "="*50)
    log.info("MIGRATION COMPLETE" if not dry_run else "DRY RUN COMPLETE — no changes made")
    log.info("="*50)

    if not dry_run:
        new_size = DEST.stat().st_size / 1024 / 1024
        log.info(f"diamondmine.db size: {new_size:.1f} MB")

    src.close()
    dest.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not SRC.exists():
        log.error(f"baseball.db not found at {SRC}")
        exit(1)

    migrate(dry_run=args.dry_run)
