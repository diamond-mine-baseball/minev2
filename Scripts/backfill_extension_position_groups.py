#!/usr/bin/env python3
"""
backfill_extension_position_groups.py
Derives position_group for extension and international rows in the contracts
table that were inserted by load_player_salaries and may have NULL position_group.

Run once after load_player_salaries.py.
"""

import sqlite3, argparse
from pathlib import Path

POS_MAP = {
    'sp':'SP','rhp-s':'SP','lhp-s':'SP',
    'rp':'RP','lhp':'RP','rhp':'RP','rhp-r':'RP','lhp-r':'RP','lhp-c':'RP',
    'c':'C','1b':'1B','2b':'2B','3b':'3B','ss':'SS',
    'lf':'OF','cf':'OF','rf':'OF','of':'OF',
    'dh':'DH','util':'UTIL',
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=str(
        Path.home() / 'Desktop/DiamondMinev2/diamondmine.db'))
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)

    # Ensure position_group column exists
    existing = {row[1] for row in conn.execute("PRAGMA table_info(contracts)")}
    if 'position_group' not in existing:
        conn.execute("ALTER TABLE contracts ADD COLUMN position_group TEXT")
        conn.commit()
        print("Added position_group column")

    # Remove duplicate extension rows — keep earliest signing_class per (name, new_team, contract_type)
    deleted = conn.execute("""
        DELETE FROM contracts
        WHERE contract_type IN ('extension','international')
          AND is_mlb = 1
          AND rowid NOT IN (
              SELECT MIN(rowid)
              FROM contracts
              WHERE contract_type IN ('extension','international') AND is_mlb = 1
              GROUP BY name, new_team, contract_type
          )
    """).rowcount
    conn.commit()
    print(f"Removed {deleted} duplicate extension/intl rows")

    # Backfill position_group from position
    updated = 0
    for pos_raw, pg in POS_MAP.items():
        n = conn.execute("""
            UPDATE contracts
            SET position_group = ?
            WHERE contract_type IN ('extension','international')
              AND is_mlb = 1
              AND LOWER(TRIM(position)) = ?
              AND (position_group IS NULL OR position_group = '')
        """, (pg, pos_raw)).rowcount
        updated += n
    conn.commit()
    print(f"Set position_group on {updated} rows")

    # Summary
    for row in conn.execute("""
        SELECT position_group, COUNT(*) n
        FROM contracts
        WHERE contract_type IN ('extension','international') AND is_mlb=1
        GROUP BY position_group ORDER BY n DESC
    """):
        print(f"  {row[0] or 'NULL':<8} {row[1]}")

    conn.close()

if __name__ == '__main__':
    main()
