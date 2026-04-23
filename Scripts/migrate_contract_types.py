#!/usr/bin/env python3
"""
migrate_contract_types.py
Adds contract_type classification and extension-specific columns to
the contracts table, and creates a supporting contract_type_lookup table.

Run once after update_deferred_contracts.py, before loading CoWork CSV exports.

Usage:
    python3 migrate_contract_types.py [--db PATH]
"""

import sqlite3
import argparse
from pathlib import Path
from datetime import datetime

# ── Contract type definitions ─────────────────────────────────────────────────
#
# fa          — Free agent signing (already in contracts table)
# extension   — Contract extension signed before FA eligibility; same team
# international — NPB/KBO posting or Cuban defection; structurally like FA
#                 but bypasses the Rule 4 draft and domestic FA market
# arb         — Single-year arbitration award or negotiated arb deal
# pre_arb     — Single-year deal for player with < 3 years service
# trade       — Salary inherited via trade (not a new signing)
#
# Hierarchy for the economics model:
#   - fa + international → use full contracts/surplus analysis (market-priced)
#   - extension          → use extension-specific surplus analysis
#   - arb + pre_arb      → exclude from market rate derivation (not market-priced)
#   - trade              → track salary allocation only, not signing decision

COLUMN_MIGRATIONS = [
    # Core classification
    ("contract_type",           "TEXT DEFAULT 'fa'"),   # see types above
    ("ml_service_at_signing",   "TEXT"),                # e.g. '2.103' — years.days format

    # Extension-specific: years purchased by service-time bucket
    # Sum of these three = total contract years for extensions
    ("pre_arb_years",           "INTEGER"),             # years of pre-arb control purchased
    ("arb_years",               "INTEGER"),             # years of arbitration years purchased
    ("fa_years",                "INTEGER"),             # years of FA years purchased

    # Extension timing — signing year may differ from term_start
    # e.g. player signs in 2022 but extension starts in 2024 after existing deal
    ("extension_signed_year",   "INTEGER"),             # calendar year deal was signed
    ("extends_existing",        "INTEGER DEFAULT 0"),   # 1 if tacked onto existing contract

    # International signing specifics
    ("source_league",           "TEXT"),                # NPB, KBO, Cuba, Intl-Amateur, Mexico
    ("posting_fee",             "REAL"),                # posting fee paid to foreign team (if any)
]


def add_columns(conn):
    existing = {row[1] for row in conn.execute("PRAGMA table_info(contracts)")}
    added = []
    for col, typ in COLUMN_MIGRATIONS:
        if col not in existing:
            conn.execute(f"ALTER TABLE contracts ADD COLUMN {col} {typ}")
            added.append(col)
    conn.commit()
    return added


def create_lookup_table(conn):
    """
    contract_type_lookup: human-readable descriptions and analysis rules
    for each contract type. Used by the API and frontend.
    """
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS contract_type_lookup (
            contract_type       TEXT PRIMARY KEY,
            label               TEXT NOT NULL,
            description         TEXT,
            include_in_market_rate INTEGER DEFAULT 0,  -- use for $/WAR derivation?
            include_in_surplus  INTEGER DEFAULT 0,     -- compute surplus?
            sort_order          INTEGER
        );

        INSERT OR IGNORE INTO contract_type_lookup VALUES
            ('fa',            'Free Agent',
             'Open-market free agent signing after 6+ years MLB service.',
             1, 1, 1),
            ('international', 'International Signing',
             'NPB/KBO posting or other international signing. Economically similar to FA.',
             1, 1, 2),
            ('extension',     'Extension',
             'Extension signed before free agency. Team buys out pre-arb, arb, or FA years.',
             0, 1, 3),
            ('arb',           'Arbitration',
             'Single-year arbitration award or negotiated arb settlement.',
             0, 0, 4),
            ('pre_arb',       'Pre-Arbitration',
             'Single-year deal for player with fewer than 3 years MLB service.',
             0, 0, 5),
            ('trade',         'Trade Acquisition',
             'Salary inherited via trade — not a new signing decision.',
             0, 0, 6);
    """)
    conn.commit()


def classify_existing_contracts(conn):
    """
    Best-effort auto-classification of existing rows in `contracts`.
    All existing rows are FA signings by definition (sourced from Cot's FA sheets).
    Mark them explicitly so the column is populated.
    """
    updated = conn.execute("""
        UPDATE contracts
        SET contract_type = 'fa'
        WHERE contract_type IS NULL OR contract_type = 'fa'
    """).rowcount
    conn.commit()
    return updated


def create_extension_view(conn):
    """
    Convenience view: extensions with derived service-time bucket breakdown
    and their contribution to team payroll context.
    """
    conn.executescript("""
        DROP VIEW IF EXISTS extensions_view;

        CREATE VIEW extensions_view AS
        SELECT
            c.id,
            c.name,
            c.extension_signed_year          AS signed_year,
            c.term_start,
            c.term_end,
            c.new_team                       AS team,
            c.position,
            c.position_group,
            c.age_at_signing,
            c.ml_service_at_signing,
            c.years,
            c.pre_arb_years,
            c.arb_years,
            c.fa_years,
            c.aav,
            c.cbt_aav,
            c.guarantee,
            c.agent,
            c.has_deferral,
            c.contract_status,
            c.extends_existing,
            -- Derived: what % of contract is FA years (measures how much FA leverage player had)
            CASE WHEN c.years > 0
                 THEN ROUND(CAST(COALESCE(c.fa_years, 0) AS REAL) / c.years * 100, 1)
                 ELSE NULL END                AS pct_fa_years,
            -- CBT context
            ct.threshold                      AS cbt_threshold,
            ROUND(COALESCE(c.cbt_aav, c.aav) / ct.threshold * 100, 2) AS pct_of_cbt,
            tp.opening_day_payroll,
            ROUND(COALESCE(c.cbt_aav, c.aav) / tp.opening_day_payroll * 100, 2) AS pct_of_payroll
        FROM contracts c
        LEFT JOIN cbt_thresholds ct ON c.term_start = ct.season
        LEFT JOIN team_payrolls  tp ON c.new_team = tp.team
                                    AND c.term_start = tp.season
        WHERE c.contract_type = 'extension'
          AND c.is_mlb = 1;
    """)
    conn.commit()


def print_summary(conn):
    print("\n── contract_type distribution in contracts table ──────────────────")
    for row in conn.execute("""
        SELECT COALESCE(contract_type, 'NULL') as ct, COUNT(*) as n
        FROM contracts
        GROUP BY ct ORDER BY n DESC
    """):
        print(f"  {row[0]:<16} {row[1]:>6} rows")

    print("\n── contract_type_lookup ───────────────────────────────────────────")
    for row in conn.execute("""
        SELECT contract_type, label, include_in_market_rate, include_in_surplus
        FROM contract_type_lookup ORDER BY sort_order
    """):
        mr  = '✓ market rate' if row[2] else '—'
        sur = '✓ surplus'     if row[3] else '—'
        print(f"  {row[0]:<16} {row[1]:<22} {mr:<14} {sur}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=str(
        Path.home() / 'Desktop/DiamondMinev2/diamondmine.db'))
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")

    conn = sqlite3.connect(db_path)

    print("Adding columns to contracts table...")
    added = add_columns(conn)
    if added:
        print(f"  Added: {', '.join(added)}")
    else:
        print("  All columns already present")

    print("\nCreating contract_type_lookup table...")
    create_lookup_table(conn)
    print("  Done")

    print("\nClassifying existing FA contracts...")
    n = classify_existing_contracts(conn)
    print(f"  {n} rows marked as contract_type = 'fa'")

    print("\nCreating extensions_view...")
    create_extension_view(conn)
    print("  Done")

    print_summary(conn)

    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('migrate_contract_types', 'contracts', ?, ?,
                'Added contract_type, ml_service_at_signing, pre/arb/fa_years, extension fields')
    """, (datetime.now().isoformat(), n))
    conn.commit()
    conn.close()

    print("""
── Next steps ──────────────────────────────────────────────────────
  1. CoWork: export all team payroll CSVs to Data/payroll_exports/
  2. Run: load_player_salaries.py   → imports CSVs + classifies rows
  3. Run: compute_economics.py      → rebuilds market rates + valuations
     (extensions excluded from market rate; included in surplus analysis)
""")


if __name__ == '__main__':
    main()
