"""
Stage 1: Load Baseball CSVs into SQLite Database (No Statcast)
===============================================================
Loads batting, pitching, and fielding CSVs only.
Safe to re-run anytime -- refreshes current season data automatically.

Usage:
    python load_to_db_no_statcast.py

Requirements:
    pip3 install pandas
    (sqlite3 is built into Python -- no install needed)
"""

import sqlite3
import pandas as pd
from pathlib import Path
from datetime import datetime
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# -------------------------------------------------
# CONFIGURATION -- edit these if needed
# -------------------------------------------------

CSV_DIR      = Path.home() / "Downloads" / "baseball_output_2015_present"
DB_PATH      = Path.home() / "Downloads" / "baseball.db"
CURRENT_YEAR = datetime.now().year
END_YEAR     = CURRENT_YEAR

CSV_TO_TABLE = {
    f"batting_2015_{END_YEAR}.csv"  : "batting",
    f"pitching_2015_{END_YEAR}.csv" : "pitching",
    f"fielding_2015_{END_YEAR}.csv" : "fielding",
}

# -------------------------------------------------

def clean_column_names(df):
    df.columns = (
        df.columns.str.strip()
                  .str.lower()
                  .str.replace(" ", "_")
                  .str.replace("/", "_")
                  .str.replace("%", "pct")
                  .str.replace("+", "plus")
    )
    return df


def load_csv_to_table(conn, csv_path, table_name):
    if not csv_path.exists():
        log.warning(f"  File not found, skipping: {csv_path.name}")
        return

    log.info(f"Loading {csv_path.name} -> table '{table_name}'...")
    df = pd.read_csv(csv_path, low_memory=False)
    df = clean_column_names(df)

    cursor = conn.cursor()
    cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table_name,)
    )
    table_exists = cursor.fetchone() is not None

    if table_exists:
        cursor.execute(f"DELETE FROM {table_name} WHERE season = ?", (CURRENT_YEAR,))
        deleted = cursor.rowcount
        log.info(f"  Removed {deleted} existing {CURRENT_YEAR} rows for refresh")

        current_season_df = df[df["season"] == CURRENT_YEAR]
        historical_df = df[df["season"] != CURRENT_YEAR]

        existing_years = pd.read_sql(
            f"SELECT DISTINCT season FROM {table_name}", conn
        )["season"].tolist()
        new_historical = historical_df[~historical_df["season"].isin(existing_years)]

        combined = pd.concat([new_historical, current_season_df], ignore_index=True)
        if not combined.empty:
            combined.to_sql(table_name, conn, if_exists="append", index=False)
            log.info(f"  Inserted {len(combined)} new rows")
        else:
            log.info(f"  No new rows to insert")
    else:
        df.to_sql(table_name, conn, if_exists="replace", index=False)
        log.info(f"  Created table with {len(df)} rows")

    try:
        conn.execute(f"CREATE INDEX IF NOT EXISTS idx_{table_name}_season ON {table_name}(season)")
    except Exception:
        pass

    name_col = next((c for c in df.columns if c in ["name", "player_name", "playername"]), None)
    if name_col:
        try:
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{table_name}_name ON {table_name}({name_col})"
            )
        except Exception:
            pass

    conn.commit()
    log.info(f"  Done: '{table_name}' is ready")


def print_summary(conn):
    print("\n" + "=" * 45)
    print("  Database Summary")
    print("=" * 45)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    for table in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        total = cursor.fetchone()[0]
        cursor.execute(f"SELECT MIN(season), MAX(season) FROM {table}")
        min_yr, max_yr = cursor.fetchone()
        print(f"  {table:<12} {total:>8} rows   ({min_yr}-{max_yr})")
    print("=" * 45)
    print(f"  Database saved to: {DB_PATH.resolve()}")
    print("=" * 45 + "\n")


def main():
    log.info(f"Looking for CSVs in: {CSV_DIR}")
    log.info(f"Connecting to database: {DB_PATH}")

    if not CSV_DIR.exists():
        print(f"\nERROR: Could not find folder: {CSV_DIR}")
        print("Please check the CSV_DIR path in the CONFIGURATION section.")
        return

    conn = sqlite3.connect(DB_PATH)

    for csv_filename, table_name in CSV_TO_TABLE.items():
        csv_path = CSV_DIR / csv_filename
        try:
            load_csv_to_table(conn, csv_path, table_name)
        except Exception as e:
            log.error(f"Failed to load {csv_filename}: {e}")
        print()

    print_summary(conn)
    conn.close()


if __name__ == "__main__":
    main()
