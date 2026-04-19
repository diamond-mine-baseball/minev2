"""
fix_accents.py — Merge accented name rows into plain ASCII rows
e.g. "José Soriano" rows get merged into "Jose Soriano" rows

Run locally, then re-upload DB.
"""
import sqlite3, unicodedata, re, logging
from pathlib import Path
from collections import defaultdict

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

DB_PATH = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"

def strip_accents(s):
    s = unicodedata.normalize("NFD", str(s))
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA journal_mode=WAL")

for table in ("batting", "pitching"):
    log.info(f"\n--- {table} ---")

    # Find all distinct names
    names = [r[0] for r in conn.execute(f"SELECT DISTINCT name FROM {table}").fetchall()]

    # Group by normalized (accent-stripped) name
    groups = defaultdict(list)
    for name in names:
        groups[strip_accents(name)].append(name)

    dupes = {k: v for k, v in groups.items() if len(v) > 1}
    log.info(f"Found {len(dupes)} duplicate name groups")

    merged = 0
    for norm_name, variants in dupes.items():
        # Plain ASCII name = canonical (no accents)
        plain = next((n for n in variants if n == strip_accents(n)), None)
        accented = [n for n in variants if n != plain]

        if not plain:
            # All accented — pick the most common one
            counts = [(conn.execute(f"SELECT COUNT(*) FROM {table} WHERE name=?", (n,)).fetchone()[0], n) for n in variants]
            plain = max(counts)[1]
            accented = [n for n in variants if n != plain]

        for acc in accented:
            # Check if rows for (accented, season, team) already exist as (plain, season, team)
            rows = conn.execute(f"SELECT season, team FROM {table} WHERE name=?", (acc,)).fetchall()
            for season, team in rows:
                exists = conn.execute(
                    f"SELECT 1 FROM {table} WHERE name=? AND season=? AND team=?",
                    (plain, season, team)
                ).fetchone()
                if exists:
                    # Plain row exists — just delete the accented duplicate
                    conn.execute(f"DELETE FROM {table} WHERE name=? AND season=? AND team=?", (acc, season, team))
                else:
                    # Rename accented row to plain
                    conn.execute(f"UPDATE {table} SET name=? WHERE name=? AND season=? AND team=?", (plain, acc, season, team))
            merged += len(rows)
            log.info(f"  Merged '{acc}' → '{plain}' ({len(rows)} rows)")

    # Also fix player table
    for norm_name, variants in dupes.items():
        plain = next((n for n in variants if n == strip_accents(n)), variants[0])
        for acc in [n for n in variants if n != plain]:
            conn.execute("UPDATE player SET name=? WHERE name=?", (plain, acc))

    log.info(f"  Total rows merged: {merged}")

conn.commit()
conn.close()
log.info("\nDone. Run fix_all_headshots.py afterwards to fix any headshot mismatches.")
