#!/usr/bin/env python3
"""
load_contracts.py
Loads Cot's Baseball Contracts free agent data (1991–2026) into diamondmine.db.

Usage:
    python3 load_contracts.py [--db PATH] [--xlsx PATH]

Defaults:
    --db   ~/Desktop/DiamondMinev2/diamondmine.db
    --xlsx ~/Downloads/MLB-Free_Agency_1991-2026_xls.xlsx
"""

import sqlite3
import pandas as pd
import re
import argparse
from pathlib import Path
from datetime import datetime

# ── Column indices (consistent across all year sheets) ────────────────────────
COL_NAME    = 0
COL_POS     = 1
COL_AGE     = 2
COL_QUAL    = 3   # qualifier + offer type combined ("Type A", "rejected", etc.)
COL_OLD     = 4   # old team
COL_NEW     = 5   # new team
COL_YEARS   = 6
COL_GUAR    = 7   # total guaranteed value
COL_TERM    = 8   # e.g. "2024-33"
COL_OPTION  = 9
COL_OPTOUT  = 10
COL_AAV     = 11
COL_AGENT   = 12

PLAYER_RE = re.compile(r'^[A-Z][a-z].*?,\s')  # matches "LastName, FirstName"


def normalize_name(raw):
    """'Ohtani, Shohei' → 'Shohei Ohtani'"""
    parts = str(raw).split(',', 1)
    if len(parts) == 2:
        return f"{parts[1].strip()} {parts[0].strip()}"
    return raw.strip()


def parse_term(term_str):
    """'2024-33' → (2024, 2033)"""
    if pd.isna(term_str):
        return None, None
    m = re.match(r'(\d{4})-(\d{2,4})', str(term_str))
    if not m:
        return None, None
    start = int(m.group(1))
    end_raw = m.group(2)
    if len(end_raw) == 2:
        end = int(str(start)[:2] + end_raw)
    else:
        end = int(end_raw)
    return start, end


def safe_int(val):
    try:
        return int(val) if pd.notna(val) else None
    except (ValueError, TypeError):
        return None


def safe_float(val):
    try:
        return float(val) if pd.notna(val) else None
    except (ValueError, TypeError):
        return None


def safe_str(val):
    s = str(val).strip() if pd.notna(val) else None
    return None if s in ('nan', '', 'None') else s


def load_year(df, year):
    """Extract player rows from a single year sheet."""
    rows = []
    for _, row in df.iterrows():
        raw_name = row[COL_NAME]
        if not PLAYER_RE.match(str(raw_name)):
            continue

        name = normalize_name(raw_name)
        term_start, term_end = parse_term(row[COL_TERM])

        guarantee = safe_float(row[COL_GUAR])
        aav = safe_float(row[COL_AAV])
        years = safe_int(row[COL_YEARS])
        age = safe_int(row[COL_AGE])

        # Infer MLB vs MiLB: MiLB contracts typically have no AAV or very low guarantee
        # Cot's doesn't flag this explicitly but guarantee=None is a strong MiLB signal
        is_mlb = 1 if guarantee is not None else 0

        rows.append({
            'name':         name,
            'signing_class': year,
            'position':     safe_str(row[COL_POS]),
            'age':          age,
            'qualifier':    safe_str(row[COL_QUAL]),
            'old_team':     safe_str(row[COL_OLD]),
            'new_team':     safe_str(row[COL_NEW]),
            'years':        years,
            'guarantee':    guarantee,
            'aav':          aav,
            'term':         safe_str(row[COL_TERM]),
            'term_start':   term_start,
            'term_end':     term_end,
            'option':       safe_str(row[COL_OPTION]),
            'opt_out':      1 if safe_str(row[COL_OPTOUT]) in ('Y', 'y', 'Yes', 'yes') else 0,
            'agent':        safe_str(row[COL_AGENT]),
            'is_mlb':       is_mlb,
        })
    return rows


def create_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contracts (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL,
            signing_class   INTEGER NOT NULL,   -- FA class year (e.g. 2024 = 2023-24 offseason)
            position        TEXT,
            age             INTEGER,
            qualifier       TEXT,               -- Type A / Type B / rejected / etc.
            old_team        TEXT,
            new_team        TEXT,
            years           INTEGER,
            guarantee       REAL,               -- total guaranteed value ($)
            aav             REAL,               -- annual average value ($)
            term            TEXT,               -- raw string e.g. "2024-33"
            term_start      INTEGER,
            term_end        INTEGER,
            option          TEXT,               -- club / player / vesting / mutual
            opt_out         INTEGER DEFAULT 0,  -- 1 if opt-out clause exists
            agent           TEXT,
            is_mlb          INTEGER DEFAULT 1,  -- 1=MLB, 0=MiLB
            UNIQUE(name, signing_class, new_team)
        )
    """)
    conn.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db',   default=str(Path.home() / 'Desktop/DiamondMinev2/diamondmine.db'))
    parser.add_argument('--xlsx', default=str(Path.home() / 'Downloads/MLB-Free_Agency_1991-2026_xls.xlsx'))
    args = parser.parse_args()

    xlsx_path = Path(args.xlsx)
    db_path   = Path(args.db)

    if not xlsx_path.exists():
        raise FileNotFoundError(f"XLSX not found: {xlsx_path}")
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")

    print(f"Reading: {xlsx_path}")
    xl = pd.ExcelFile(xlsx_path)

    years = [s for s in xl.sheet_names if re.match(r'^\d{4}$', s)]
    print(f"Found {len(years)} year sheets: {years[0]}–{years[-1]}")

    conn = sqlite3.connect(db_path)
    create_table(conn)

    # Clear existing data for clean reload
    conn.execute("DELETE FROM contracts")
    conn.commit()

    all_rows = []
    for yr_str in years:
        yr = int(yr_str)
        df = pd.read_excel(xl, sheet_name=yr_str, header=None)
        rows = load_year(df, yr)
        all_rows.extend(rows)
        print(f"  {yr_str}: {len(rows)} players")

    print(f"\nInserting {len(all_rows)} total rows...")
    conn.executemany("""
        INSERT OR IGNORE INTO contracts
            (name, signing_class, position, age, qualifier, old_team, new_team,
             years, guarantee, aav, term, term_start, term_end, option, opt_out, agent, is_mlb)
        VALUES
            (:name, :signing_class, :position, :age, :qualifier, :old_team, :new_team,
             :years, :guarantee, :aav, :term, :term_start, :term_end, :option, :opt_out, :agent, :is_mlb)
    """, all_rows)
    conn.commit()

    # Verify
    total = conn.execute("SELECT COUNT(*) FROM contracts").fetchone()[0]
    mlb   = conn.execute("SELECT COUNT(*) FROM contracts WHERE is_mlb=1").fetchone()[0]
    milb  = conn.execute("SELECT COUNT(*) FROM contracts WHERE is_mlb=0").fetchone()[0]

    print(f"\n✓ contracts table: {total} rows ({mlb} MLB, {milb} MiLB)")

    # Spot-check
    print("\nSpot-check (top 5 by guarantee):")
    for row in conn.execute("""
        SELECT name, signing_class, new_team, years, guarantee, aav
        FROM contracts WHERE is_mlb=1
        ORDER BY guarantee DESC LIMIT 5
    """):
        print(f"  {row[0]} ({row[1]}) → {row[2]} | {row[3]}yr / ${row[4]/1e6:.1f}M | AAV ${row[5]/1e6:.1f}M")

    # Update data_freshness
    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('Cots/BP', 'contracts', ?, ?, 'Free agent signings 1991–2026')
    """, (datetime.now().isoformat(), total))
    conn.commit()

    conn.close()
    print("\nDone.")


if __name__ == '__main__':
    main()
