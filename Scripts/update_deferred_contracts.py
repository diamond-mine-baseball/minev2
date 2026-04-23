#!/usr/bin/env python3
"""
update_deferred_contracts.py
Adds CBT-adjusted AAV (accounting for salary deferrals) to the contracts table.

Per CBA Article XXIII E(6), deferred compensation is included in CBT salary
at present value, discounted at the Imputed Loan Interest Rate (≈ IRS mid-term AFR).

Simplified formula (per user request — equal payment assumption):
    N = avg_payment_year - avg_contract_year
    CBT_AAV = (non_deferred + total_deferred / (1+r)^N) / contract_years

Source: Spotrac MLB Contracts w/ Deferred Money (April 2026), verified Apr 22, 2026

Usage:
    python3 update_deferred_contracts.py [--db PATH]
"""

import sqlite3
import unicodedata
import argparse
from pathlib import Path
from datetime import datetime

# IRS mid-term AFR by signing year (approximate annual average)
AFR = {
    2011: 0.020, 2012: 0.018, 2013: 0.020, 2014: 0.020,
    2015: 0.022, 2016: 0.016, 2017: 0.018, 2018: 0.026,
    2019: 0.025, 2020: 0.004, 2021: 0.007, 2022: 0.018,
    2023: 0.040, 2024: 0.045, 2025: 0.045, 2026: 0.045,
}

def cbt_aav(total, deferred, yrs, c_start, d_start, d_yrs, r):
    """
    Calculate CBT AAV using average-lag NPV formula.
    N = avg_payment_year - avg_contract_year
    """
    c_end = c_start + yrs - 1
    d_end = d_start + d_yrs - 1
    avg_c = (c_start + c_end) / 2
    avg_d = (d_start + d_end) / 2
    N = avg_d - avg_c
    non_def = total - deferred
    return round((non_def + deferred / (1 + r) ** N) / yrs, 0)

# ── Full Spotrac deferred contract list (32 total, 31 excl. Stanton) ──────────
# Columns: name, cots_team, signing_class, total, deferred, contract_yrs,
#          contract_start, deferral_start, deferral_yrs,
#          verified_cbt_aav (None = calculate), in_fa_table, notes

CONTRACTS = [
    # ── DODGERS ──────────────────────────────────────────────────────────────
    {
        'name': 'Shohei Ohtani', 'team': 'LAN', 'signing_class': 2024,
        'total': 700_000_000, 'deferred': 680_000_000,
        'yrs': 10, 'c_start': 2024, 'd_start': 2034, 'd_yrs': 10,
        'verified_cbt_aav': 46_081_476, 'in_fa_table': True,
        'notes': '$2M/yr cash; $68M/yr deferred 2034-2043',
        'source': 'MLB.com / Spotrac',
    },
    {
        'name': 'Mookie Betts', 'team': 'LAN', 'signing_class': 2021,
        'total': 365_000_000, 'deferred': 120_000_000,
        'yrs': 12, 'c_start': 2021, 'd_start': 2033, 'd_yrs': 12,
        'verified_cbt_aav': 25_554_824, 'in_fa_table': False,
        'notes': 'Extension — not in FA contracts table',
        'source': 'Spotrac / MLBTradeRumors',
    },
    {
        'name': 'Freddie Freeman', 'team': 'LAN', 'signing_class': 2022,
        'total': 162_000_000, 'deferred': 57_000_000,
        'yrs': 6, 'c_start': 2022, 'd_start': 2028, 'd_yrs': 13,
        'verified_cbt_aav': 24_700_000, 'in_fa_table': True,
        'notes': '$4M/yr July 1, 2028-2040',
        'source': 'Spotrac',
    },
    {
        'name': 'Blake Snell', 'team': 'LAN', 'signing_class': 2025,
        'total': 182_000_000, 'deferred': 66_000_000,
        'yrs': 5, 'c_start': 2025, 'd_start': 2035, 'd_yrs': 12,
        'verified_cbt_aav': 31_735_498, 'in_fa_table': True,
        'notes': '$5.5M/yr July 1, 2035-2046',
        'source': 'MLBPA / MLBTradeRumors',
    },
    {
        'name': 'Kyle Tucker', 'team': 'LAN', 'signing_class': 2026,
        'total': 240_000_000, 'deferred': 30_000_000,
        'yrs': 4, 'c_start': 2026, 'd_start': 2036, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$3M/yr deferred 2036-2045',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Will Smith', 'team': 'LAN', 'signing_class': 2024,
        'total': 140_000_000, 'deferred': 50_000_000,
        'yrs': 10, 'c_start': 2024, 'd_start': 2034, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension — not in FA contracts table',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Tommy Edman', 'team': 'LAN', 'signing_class': 2025,
        'total': 74_000_000, 'deferred': 25_000_000,
        'yrs': 5, 'c_start': 2025, 'd_start': 2035, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension — not in FA contracts table',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Teoscar Hernandez', 'team': 'LAN', 'signing_class': 2025,
        'total': 66_000_000, 'deferred': 23_500_000,
        'yrs': 3, 'c_start': 2025, 'd_start': 2030, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$2.35M/yr July 1, 2030-2039',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Tanner Scott', 'team': 'LAN', 'signing_class': 2025,
        'total': 72_000_000, 'deferred': 21_000_000,
        'yrs': 4, 'c_start': 2025, 'd_start': 2030, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$2.1M/yr deferred 2030-2039',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Edwin Diaz', 'team': 'LAN', 'signing_class': 2026,
        'total': 69_000_000, 'deferred': 13_500_000,
        'yrs': 3, 'c_start': 2026, 'd_start': 2036, 'd_yrs': 12,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': 'LAD contract 2026-2028; $1.125M/yr deferred 2036-2047',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── CUBS ─────────────────────────────────────────────────────────────────
    {
        'name': 'Alex Bregman', 'team': 'CHN', 'signing_class': 2026,
        'total': 175_000_000, 'deferred': 70_000_000,
        'yrs': 5, 'c_start': 2026, 'd_start': 2034, 'd_yrs': 8,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$8.75M/yr deferred 2034-2041; CHC not BOS',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Nico Hoerner', 'team': 'CHN', 'signing_class': 2027,
        'total': 141_000_000, 'deferred': 10_000_000,
        'yrs': 6, 'c_start': 2027, 'd_start': 2029, 'd_yrs': 4,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension — probably not in FA contracts table',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── RED SOX ───────────────────────────────────────────────────────────────
    {
        'name': 'Rafael Devers', 'team': 'BOS', 'signing_class': 2023,
        'total': 313_500_000, 'deferred': 75_000_000,
        'yrs': 10, 'c_start': 2023, 'd_start': 2034, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension — not in FA contracts table; saves ~$2.2M/yr CBT',
        'source': 'Spotrac',
    },

    # ── GUARDIANS ────────────────────────────────────────────────────────────
    {
        'name': 'Jose Ramirez', 'team': 'CLE', 'signing_class': 2026,
        'total': 175_000_000, 'deferred': 70_000_000,
        'yrs': 7, 'c_start': 2026, 'd_start': 2036, 'd_yrs': 16,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension — 2036-2051 deferral window',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── DIAMONDBACKS ─────────────────────────────────────────────────────────
    {
        'name': 'Corbin Burnes', 'team': 'ARI', 'signing_class': 2025,
        'total': 210_000_000, 'deferred': 64_000_000,
        'yrs': 6, 'c_start': 2025, 'd_start': 2031, 'd_yrs': 6,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$10.67M/yr deferred 2031-2036',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Zac Gallen', 'team': 'ARI', 'signing_class': 2026,
        'total': 22_025_000, 'deferred': 14_025_000,
        'yrs': 1, 'c_start': 2026, 'd_start': 2032, 'd_yrs': 3,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '63.7% deferred; $4.7M/yr 2032-2034',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── BLUE JAYS ────────────────────────────────────────────────────────────
    {
        'name': 'Dylan Cease', 'team': 'TOR', 'signing_class': 2026,
        'total': 210_000_000, 'deferred': 64_000_000,
        'yrs': 7, 'c_start': 2026, 'd_start': 2033, 'd_yrs': 14,
        'verified_cbt_aav': 26_370_000, 'in_fa_table': True,
        'notes': '$4.57M/yr deferred 2033-2046',
        'source': 'MLBTradeRumors (verified)',
    },
    {
        'name': 'Anthony Santander', 'team': 'TOR', 'signing_class': 2025,
        'total': 92_500_000, 'deferred': 61_750_000,
        'yrs': 5, 'c_start': 2025, 'd_start': 2035, 'd_yrs': 12,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '66.8% deferred — biggest deferral % in dataset',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── DODGERS (Freeman already above) / METS ───────────────────────────────
    {
        'name': 'Francisco Lindor', 'team': 'NYN', 'signing_class': 2022,
        'total': 341_000_000, 'deferred': 50_000_000,
        'yrs': 10, 'c_start': 2022, 'd_start': 2032, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension — not in FA contracts table',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Sean Manaea', 'team': 'NYN', 'signing_class': 2025,
        'total': 75_000_000, 'deferred': 23_250_000,
        'yrs': 3, 'c_start': 2025, 'd_start': 2035, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$2.325M/yr deferred 2035-2044',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Devin Williams', 'team': 'NYN', 'signing_class': 2026,
        'total': 51_000_000, 'deferred': 15_000_000,
        'yrs': 3, 'c_start': 2026, 'd_start': 2036, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$1.5M/yr deferred 2036-2045',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── ROCKIES / CARDINALS ───────────────────────────────────────────────────
    {
        'name': 'Nolan Arenado', 'team': 'COL', 'signing_class': 2019,
        'total': 260_000_000, 'deferred': 20_000_000,
        'yrs': 8, 'c_start': 2019, 'd_start': 2022, 'd_yrs': 20,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension with COL; traded to STL mid-contract; not in FA table',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── BREWERS ───────────────────────────────────────────────────────────────
    {
        'name': 'Christian Yelich', 'team': 'MIL', 'signing_class': 2020,
        'total': 188_500_000, 'deferred': 28_000_000,
        'yrs': 7, 'c_start': 2020, 'd_start': 2031, 'd_yrs': 12,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension — not in FA contracts table; saves ~$3M/yr CBT',
        'source': 'Spotrac',
    },

    # ── PHILLIES ──────────────────────────────────────────────────────────────
    {
        'name': 'Cristopher Sanchez', 'team': 'PHI', 'signing_class': 2027,
        'total': 104_000_000, 'deferred': 20_000_000,
        'yrs': 6, 'c_start': 2027, 'd_start': 2035, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension starting 2027 — probably not in FA contracts table',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── TIGERS ────────────────────────────────────────────────────────────────
    {
        'name': 'Framber Valdez', 'team': 'DET', 'signing_class': 2026,
        'total': 115_000_000, 'deferred': 20_000_000,
        'yrs': 3, 'c_start': 2026, 'd_start': 2030, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$2M/yr deferred 2030-2039',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Justin Verlander', 'team': 'DET', 'signing_class': 2026,
        'total': 13_000_000, 'deferred': 11_000_000,
        'yrs': 1, 'c_start': 2026, 'd_start': 2030, 'd_yrs': 10,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '84.6% deferred; $1.1M/yr 2030-2039',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── ROYALS ────────────────────────────────────────────────────────────────
    {
        'name': 'Salvador Perez', 'team': 'KCA', 'signing_class': 2026,
        'total': 25_000_000, 'deferred': 12_000_000,
        'yrs': 2, 'c_start': 2026, 'd_start': 2030, 'd_yrs': 5,
        'verified_cbt_aav': None, 'in_fa_table': False,
        'notes': 'Extension with KC — probably not in FA contracts table',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── ORIOLES ───────────────────────────────────────────────────────────────
    {
        'name': 'Mark Trumbo', 'team': 'BAL', 'signing_class': 2017,
        'total': 37_500_000, 'deferred': 4_500_000,
        'yrs': 3, 'c_start': 2017, 'd_start': 2020, 'd_yrs': 3,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$1.5M/yr deferred 2020-2022; minimal CBT savings',
        'source': 'Spotrac (estimated CBT AAV)',
    },
    {
        'name': 'Andrew Cashner', 'team': 'BAL', 'signing_class': 2018,
        'total': 16_000_000, 'deferred': 3_000_000,
        'yrs': 2, 'c_start': 2018, 'd_start': 2020, 'd_yrs': 3,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$1M/yr deferred 2020-2022; minimal CBT savings',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── BREWERS (historical) ──────────────────────────────────────────────────
    {
        'name': 'Aramis Ramirez', 'team': 'MIL', 'signing_class': 2012,
        'total': 36_000_000, 'deferred': 6_000_000,
        'yrs': 3, 'c_start': 2012, 'd_start': 2018, 'd_yrs': 2,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '$3M/yr deferred 2018-2019',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── NATIONALS ─────────────────────────────────────────────────────────────
    {
        'name': 'Jon Lester', 'team': 'WAS', 'signing_class': 2021,
        'total': 5_000_000, 'deferred': 3_000_000,
        'yrs': 1, 'c_start': 2021, 'd_start': 2023, 'd_yrs': 1,
        'verified_cbt_aav': None, 'in_fa_table': True,
        'notes': '60% deferred; minimal CBT savings at near-zero rate',
        'source': 'Spotrac (estimated CBT AAV)',
    },

    # ── HISTORICAL VERIFIED ───────────────────────────────────────────────────
    {
        'name': 'Max Scherzer', 'team': 'WAS', 'signing_class': 2015,
        'total': 210_000_000, 'deferred': 105_000_000,
        'yrs': 7, 'c_start': 2015, 'd_start': 2022, 'd_yrs': 7,
        'verified_cbt_aav': 28_689_376, 'in_fa_table': True,
        'notes': '50% deferred; not on Spotrac active list (complete contract)',
        'source': 'Spotrac (verified historical)',
    },
]


def strip_accents(s):
    return unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode().lower().strip()


def find_contract(conn, name, signing_class, team):
    """Find contract row by name (accent-insensitive) + signing_class + team."""
    rows = conn.execute("""
        SELECT rowid, name, aav, guarantee FROM contracts
        WHERE signing_class = ? AND new_team = ? AND is_mlb = 1
    """, (signing_class, team)).fetchall()
    target = strip_accents(name)
    for r in rows:
        if strip_accents(r[1]) == target:
            return r
    return None


def add_columns(conn):
    for col, typ in [
        ('has_deferral', 'INTEGER DEFAULT 0'),
        ('deferred_amount', 'REAL'),
        ('cbt_aav', 'REAL'),
        ('cbt_aav_verified', 'INTEGER DEFAULT 0'),
        ('cbt_aav_source', 'TEXT'),
        ('deferral_notes', 'TEXT'),
    ]:
        try:
            conn.execute(f"ALTER TABLE contracts ADD COLUMN {col} {typ}")
        except Exception:
            pass
    for col, typ in [
        ('has_deferral', 'INTEGER DEFAULT 0'),
        ('cbt_aav', 'REAL'),
        ('effective_aav', 'REAL'),
    ]:
        try:
            conn.execute(f"ALTER TABLE contract_valuations ADD COLUMN {col} {typ}")
        except Exception:
            pass
    conn.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default=str(Path.home() / 'Desktop/DiamondMinev2/diamondmine.db'))
    args = parser.parse_args()

    conn = sqlite3.connect(Path(args.db))
    add_columns(conn)

    print(f"Processing {len(CONTRACTS)} deferred contracts...\n")
    found = not_found = skipped = 0

    for c in CONTRACTS:
        r = AFR.get(c['signing_class'], 0.045)

        if c['verified_cbt_aav'] is not None:
            computed = c['verified_cbt_aav']
            verified = 1
        else:
            computed = cbt_aav(
                c['total'], c['deferred'], c['yrs'],
                c['c_start'], c['d_start'], c['d_yrs'], r
            )
            verified = 0

        if not c['in_fa_table']:
            skipped += 1
            face_aav = c['total'] / c['yrs']
            savings = face_aav - computed
            v = '✓' if verified else '~'
            print(f"  {v} SKIP (extension) {c['name']} {c['signing_class']} {c['team']}")
            print(f"    Face ${face_aav/1e6:.2f}M → CBT ${computed/1e6:.2f}M  (saves ${savings/1e6:.2f}M/yr)")
            continue

        row = find_contract(conn, c['name'], c['signing_class'], c['team'])
        if not row:
            not_found += 1
            print(f"  ✗ NOT FOUND: {c['name']} {c['signing_class']} {c['team']}")
            continue

        rowid, db_name, face_aav, guarantee = row
        savings = (face_aav or 0) - computed
        v = '✓' if verified else '~'
        print(f"  {v} UPDATED: {db_name} ({c['signing_class']}, {c['team']})")
        print(f"    Face ${face_aav/1e6:.2f}M → CBT ${computed/1e6:.2f}M  (saves ${savings/1e6:.2f}M/yr)")

        conn.execute("""
            UPDATE contracts SET
                has_deferral     = 1,
                deferred_amount  = ?,
                cbt_aav          = ?,
                cbt_aav_verified = ?,
                cbt_aav_source   = ?,
                deferral_notes   = ?
            WHERE rowid = ?
        """, (c['deferred'], computed, verified, c['source'], c['notes'], rowid))
        found += 1

    conn.commit()
    print(f"\nUpdated: {found}  |  Not in FA table (skipped): {skipped}  |  Not found: {not_found}")

    # Propagate to contract_valuations
    conn.execute("""
        UPDATE contract_valuations SET
            has_deferral = 1,
            cbt_aav = (
                SELECT c.cbt_aav FROM contracts c
                WHERE c.name = contract_valuations.name
                  AND c.signing_class = contract_valuations.signing_class
                  AND c.new_team = contract_valuations.new_team
                  AND c.cbt_aav IS NOT NULL
            ),
            effective_aav = COALESCE((
                SELECT c.cbt_aav FROM contracts c
                WHERE c.name = contract_valuations.name
                  AND c.signing_class = contract_valuations.signing_class
                  AND c.new_team = contract_valuations.new_team
                  AND c.cbt_aav IS NOT NULL
            ), contract_valuations.aav)
        WHERE EXISTS (
            SELECT 1 FROM contracts c
            WHERE c.name = contract_valuations.name
              AND c.signing_class = contract_valuations.signing_class
              AND c.new_team = contract_valuations.new_team
              AND c.has_deferral = 1
        )
    """)
    conn.commit()

    print("\n── Deferred contracts now in DB ──────────────────────────────────────────")
    print(f"  {'Player':<25} {'Cls':>4} {'Team':>4} {'Face':>9} {'CBT':>9} {'Δ':>9} {'V':>2}")
    print(f"  {'-'*68}")
    for row in conn.execute("""
        SELECT name, signing_class, new_team, aav, cbt_aav, cbt_aav_verified
        FROM contracts WHERE has_deferral=1 ORDER BY cbt_aav DESC
    """):
        n, cls, t, face, cbt, ver = row
        d = (face-cbt) if face and cbt else 0
        print(f"  {n:<25} {cls:>4} {t:>4} ${face/1e6:>7.1f}M ${cbt/1e6:>7.1f}M -${d/1e6:>6.1f}M {'✓' if ver else '~':>2}")

    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('update_deferred_contracts', 'contracts', ?, ?, 'CBT-adjusted AAV from Spotrac April 2026')
    """, (datetime.now().isoformat(), found))
    conn.commit()
    conn.close()
    print("\nDone. Run compute_economics.py next to refresh contract_valuations with CBT AAVs.")

if __name__ == '__main__':
    main()
