#!/usr/bin/env python3
"""
compute_economics.py
Builds DiamondMine's contract economics model:
  1. Name matching layer (accent/hyphen/suffix normalization + fuzzy fallback)
  2. market_rates table  — implied $/WAR per FA class year
  3. contract_valuations table — realized & expected surplus per contract

Usage:
    python3 compute_economics.py [--db PATH] [--min-war FLOAT] [--verbose]

Defaults:
    --db      ~/Desktop/DiamondMinev2/diamondmine.db
    --min-war 0.5   minimum WAR/season to include in market rate derivation
"""

import sqlite3
import unicodedata
import re
import argparse
import json
from pathlib import Path
from datetime import datetime

try:
    from rapidfuzz import process, fuzz
    HAS_FUZZY = True
except ImportError:
    HAS_FUZZY = False
    print("tip: pip3 install rapidfuzz for better name matching on edge cases")

# ── Aging curve (WAR delta per year, relative to current level) ───────────────
# Based on Tango/MGL empirical research. Applied cumulatively from age at signing.
# Positive = still improving, negative = declining.
AGING_DELTA = {
    22: +0.5, 23: +0.4, 24: +0.3, 25: +0.2, 26: +0.1,
    27:  0.0,
    28: -0.2, 29: -0.3, 30: -0.4, 31: -0.5, 32: -0.6,
    33: -0.7, 34: -0.8, 35: -0.9, 36: -1.1, 37: -1.2,
    38: -1.4, 39: -1.6, 40: -1.8,
}

def aging_delta(age):
    if age <= 22: return +0.5
    if age >= 40: return -1.8
    return AGING_DELTA.get(age, -0.5)

def project_war_over_contract(baseline_war, age_at_signing, years):
    """
    Given a player's recent WAR baseline and age at signing,
    project expected WAR for each year of the contract.
    Returns list of projected WAR per season.
    """
    projected = []
    current = baseline_war
    for yr in range(years):
        age = age_at_signing + yr
        projected.append(max(current, 0.0))  # floor at 0
        current += aging_delta(age + 1)
    return projected

# ── Position bucketing ────────────────────────────────────────────────────────
FIELD_MAP = {
    'c': 'C', '1b': '1B', '2b': '2B', '3b': '3B',
    'ss': 'SS', 'of': 'OF', 'cf': 'OF', 'rf': 'OF', 'lf': 'OF', 'dh': 'DH',
}
UTIL_POSITIONS = {'inf', 'inf-of', 'of-inf'}

def resolve_pitcher_role(conn, canonical_name, term_start):
    """SP if majority of appearances in signing year were starts, else RP."""
    row = conn.execute("""
        SELECT g, gs FROM pitching
        WHERE name = ? AND season = ?
          AND team NOT IN ('TOT','2TM','3TM','4TM')
        ORDER BY ip DESC LIMIT 1
    """, (canonical_name, term_start)).fetchone()
    if not row or not row[0]:
        return 'RP'
    g, gs = row
    return 'SP' if ((gs or 0) / g) >= 0.5 else 'RP'

def position_group(pos, conn=None, canonical_name=None, term_start=None):
    """
    Returns one of: SP, RP, C, 1B, 2B, 3B, SS, OF, DH, UTIL, UNK
    Handles compound positions (takes primary/first token),
    pitcher role suffixes (-s=SP, -r/-c=RP, bare=query pitching table).
    """
    if not pos:
        return 'UNK'
    p = str(pos).lower().strip()

    if p in UTIL_POSITIONS:
        return 'UTIL'

    # Pitcher detection — check first token
    primary = p.split('-')[0]
    if primary in ('rhp', 'lhp'):
        if p.endswith('-s'):
            return 'SP'
        if any(p.endswith(s) for s in ('-r', '-c')):
            return 'RP'
        # Ambiguous bare rhp/lhp — query pitching table
        if conn and canonical_name and term_start:
            return resolve_pitcher_role(conn, canonical_name, term_start)
        return 'RP'  # safe fallback

    return FIELD_MAP.get(primary, 'UTIL')

def get_role(pos):
    """Simplified batter/pitcher for WAR table routing."""
    if not pos:
        return 'unknown'
    p = str(pos).lower().strip()
    primary = p.split('-')[0]
    if primary in ('rhp', 'lhp'):
        return 'pitcher'
    return 'batter'

# ── Name normalization ────────────────────────────────────────────────────────
def strip_accents(s):
    """'José Ábreu' → 'Jose Abreu'"""
    nfkd = unicodedata.normalize('NFKD', str(s))
    return nfkd.encode('ASCII', 'ignore').decode('ASCII').strip()

def normalize_for_match(name):
    """Produce a canonical key for fuzzy/exact matching."""
    s = strip_accents(name).lower()
    s = re.sub(r'\s+', ' ', s)
    # Remove suffixes
    s = re.sub(r'\b(jr\.?|sr\.?|ii|iii|iv)\b', '', s).strip()
    return s

def hyphen_variants(name):
    """Return name with and without hyphens: 'Hyun-Jin' → ['Hyun-Jin', 'Hyun Jin']"""
    norm = normalize_for_match(name)
    return list({norm, norm.replace('-', ' '), norm.replace('-', '')})

def build_name_map(conn):
    """
    Build a dict: normalized_key → canonical_name for all names in batting + pitching.
    Used to resolve contract names → DB names.
    """
    name_map = {}
    for row in conn.execute("SELECT DISTINCT name FROM batting UNION SELECT DISTINCT name FROM pitching"):
        canonical = row[0]
        for variant in hyphen_variants(canonical):
            name_map[variant] = canonical
    return name_map

def resolve_name(contract_name, name_map, fuzzy_keys=None):
    """
    Try to match a contract name to a DB canonical name.
    1. Exact normalized match
    2. Hyphen variants
    3. Fuzzy match (if rapidfuzz available)
    Returns (canonical_name, match_type) or (None, 'unmatched')
    """
    for variant in hyphen_variants(contract_name):
        if variant in name_map:
            return name_map[variant], 'exact'

    if HAS_FUZZY and fuzzy_keys:
        norm = normalize_for_match(contract_name)
        result = process.extractOne(norm, fuzzy_keys, scorer=fuzz.token_sort_ratio, score_cutoff=88)
        if result:
            return name_map.get(result[0], result[0]), 'fuzzy'

    return None, 'unmatched'

# ── WAR lookup ────────────────────────────────────────────────────────────────
def _best_war_from_table(conn, table, canonical_name, season_start, season_end):
    """Returns {season: bwar} from a single table, preferring aggregate rows."""
    rows = conn.execute(f"""
        SELECT season, team, bwar
        FROM {table}
        WHERE name = ?
          AND season >= ? AND season <= ?
          AND bwar IS NOT NULL
        ORDER BY season, team
    """, (canonical_name, season_start, season_end)).fetchall()
    season_war = {}
    for season, team, bwar in rows:
        if season not in season_war:
            season_war[season] = bwar
        elif team.upper() in ('TOT', '2TM', '3TM', '4TM'):
            season_war[season] = bwar
    return season_war


def get_war_by_season(conn, canonical_name, role, term_start, term_end):
    """
    Returns {season: bwar} summed across batting + pitching tables.
    Handles two-way players (Ohtani) — normal players get zero from the secondary table.
    """
    bat_war = _best_war_from_table(conn, 'batting',  canonical_name, term_start, term_end)
    pit_war = _best_war_from_table(conn, 'pitching', canonical_name, term_start, term_end)
    all_seasons = set(bat_war) | set(pit_war)
    return {s: round(bat_war.get(s, 0) + pit_war.get(s, 0), 2) for s in all_seasons}

def get_baseline_war(conn, canonical_name, role, term_start, lookback=3):
    """
    PA/IP-weighted average WAR over the lookback seasons before signing.
    Sums batting + pitching WAR for two-way players.
    """
    season_data = {}
    for table, weight_col in [('batting', 'pa'), ('pitching', 'ip')]:
        rows = conn.execute(f"""
            SELECT season, bwar, {weight_col}
            FROM {table}
            WHERE name = ?
              AND season >= ? AND season < ?
              AND bwar IS NOT NULL
              AND {weight_col} IS NOT NULL AND {weight_col} > 0
              AND team NOT IN ('TOT','2TM','3TM','4TM')
            ORDER BY season DESC
            LIMIT ?
        """, (canonical_name, term_start - lookback, term_start, lookback * 3)).fetchall()
        for season, bwar, weight in rows:
            if season not in season_data:
                season_data[season] = {'war': 0, 'weight': 0}
            season_data[season]['war'] += bwar
            season_data[season]['weight'] += weight

    if not season_data:
        return None

    recent = sorted(season_data.keys(), reverse=True)[:lookback]
    total_war = sum(season_data[s]['war'] * season_data[s]['weight'] for s in recent)
    total_weight = sum(season_data[s]['weight'] for s in recent)
    return round(total_war / total_weight, 3) if total_weight > 0 else None

# ── Market rate derivation ────────────────────────────────────────────────────
def derive_market_rates(conn, name_map, fuzzy_keys, min_war_per_season=0.5, verbose=False):
    """
    Derive implied $/WAR per FA class year using completed contracts.
    Method: pool-level ratio to avoid division instability on small contracts.
      rate = Σ(AAV × seasons_with_data) / Σ(total_WAR_delivered)
    Only uses contracts where term_end <= previous season and WAR > threshold.
    """
    current_year = datetime.now().year
    contracts = conn.execute("""
        SELECT name, signing_class, position, new_team, aav, 
            COALESCE(cbt_aav, aav) as effective_aav, guarantee, years, term_start, term_end, age,
            COALESCE(has_deferral, 0) as has_deferral, cbt_aav
        FROM contracts
        WHERE is_mlb = 1
          AND aav IS NOT NULL AND aav > 0
          AND term_start IS NOT NULL
          AND term_end <= ?
          AND years >= 1
        ORDER BY signing_class, name
    """, (current_year - 1,)).fetchall()

    # Group by class year: accumulate total_aav_dollars and total_war
    class_buckets = {}  # class_year → {total_salary, total_war, n, n_matched}

    for row in contracts:
        name, cls, pos, team, face_aav, aav, guar, yrs, t_start, t_end, age, has_deferral, cbt_aav_val = row
        role = get_role(pos)
        canonical, match_type = resolve_name(name, name_map, fuzzy_keys)

        if cls not in class_buckets:
            class_buckets[cls] = {
                'total_salary': 0, 'total_war': 0,
                'n': 0, 'n_matched': 0, 'n_positive_war': 0
            }
        class_buckets[cls]['n'] += 1

        if not canonical:
            if verbose:
                print(f"  UNMATCHED: {name} ({cls})")
            continue

        war_by_season = get_war_by_season(conn, canonical, role, t_start, t_end)
        if not war_by_season:
            continue

        seasons_with_data = len(war_by_season)
        total_war = sum(war_by_season.values())
        war_per_season = total_war / seasons_with_data if seasons_with_data else 0

        if war_per_season < min_war_per_season:
            continue  # exclude replacement-level signings from market rate

        total_salary_paid = aav * seasons_with_data
        class_buckets[cls]['total_salary'] += total_salary_paid
        class_buckets[cls]['total_war'] += total_war
        class_buckets[cls]['n_matched'] += 1
        class_buckets[cls]['n_positive_war'] += 1

    # Compute rate per class
    rates = {}
    for cls, b in sorted(class_buckets.items()):
        if b['total_war'] > 0:
            rate = b['total_salary'] / b['total_war']
            rates[cls] = {
                'season': cls,
                'dollars_per_war': round(rate),
                'sample_size': b['n_positive_war'],
                'total_contracts': b['n'],
                'match_rate': round(b['n_matched'] / b['n'] * 100, 1) if b['n'] else 0,
            }

    return rates

# ── Contract valuation ────────────────────────────────────────────────────────
def compute_valuations(conn, name_map, fuzzy_keys, market_rates, verbose=False):
    """
    For every MLB contract, compute:
      - Realized WAR delivered
      - Baseline WAR at signing
      - Expected WAR via aging curve
      - Surplus (realized and expected) vs market rate at signing
    """
    current_year = datetime.now().year

    contracts = conn.execute("""
        SELECT name, signing_class, position, new_team,
               aav, COALESCE(cbt_aav, aav) as effective_aav,
               guarantee, years, term_start, term_end, age,
               COALESCE(has_deferral, 0) as has_deferral,
               cbt_aav
        FROM contracts
        WHERE is_mlb = 1
          AND aav IS NOT NULL AND aav > 0
          AND term_start IS NOT NULL
    """).fetchall()

    valuations = []
    for row in contracts:
        name, cls, pos, team, face_aav, aav, guar, yrs, t_start, t_end, age, has_deferral, cbt_aav_val = row
        role = get_role(pos)
        canonical, match_type = resolve_name(name, name_map, fuzzy_keys)
        pos_group = position_group(pos, conn, canonical, t_start)

        # Contract status
        if t_end is None:
            status = 'unknown'
        elif t_end < current_year:
            status = 'complete'
        elif t_start > current_year:
            status = 'future'
        else:
            status = 'active'

        # Realized WAR
        realized_war_by_season = {}
        total_realized_war = None
        seasons_played = 0
        if canonical:
            realized_war_by_season = get_war_by_season(conn, canonical, role, t_start,
                                                        min(t_end or current_year, current_year))
            if realized_war_by_season:
                seasons_played = len(realized_war_by_season)
                total_realized_war = round(sum(realized_war_by_season.values()), 2)

        # Baseline WAR (pre-contract trailing average)
        baseline_war = None
        if canonical and age:
            baseline_war = get_baseline_war(conn, canonical, role, t_start)

        # Expected WAR via aging curve
        expected_war_total = None
        expected_war_by_season = None
        if baseline_war is not None and age and yrs:
            projected = project_war_over_contract(baseline_war, age, yrs)
            expected_war_total = round(sum(projected), 2)
            expected_war_by_season = round(sum(projected) / yrs, 3) if yrs else None

        # Market rate at signing — use that class year's rate, or nearest available
        market_rate = None
        if cls in market_rates:
            market_rate = market_rates[cls]['dollars_per_war']
        else:
            # Fall back to nearest year with a rate
            available = sorted(market_rates.keys())
            if available:
                nearest = min(available, key=lambda y: abs(y - cls))
                market_rate = market_rates[nearest]['dollars_per_war']

        # Surplus calculations
        realized_market_value = None
        realized_surplus = None
        if total_realized_war is not None and market_rate and seasons_played > 0:
            salary_paid = face_aav * seasons_played  # actual cash paid
            realized_market_value = round(total_realized_war * market_rate, 0)
            realized_surplus = round(realized_market_value - salary_paid, 0)

        expected_market_value = None
        expected_surplus = None
        if expected_war_total is not None and market_rate and guar:
            expected_market_value = round(expected_war_total * market_rate, 0)
            expected_surplus = round(expected_market_value - guar, 0)

        valuations.append({
            'name':                   name,
            'canonical_name':         canonical,
            'match_type':             match_type,
            'signing_class':          cls,
            'position':               pos,
            'position_group':         pos_group,
            'role':                   role,
            'new_team':               team,
            'age_at_signing':         age,
            'has_deferral':           has_deferral,
            'cbt_aav':               cbt_aav_val,
            'effective_aav':          aav,  # cbt_aav if deferred, else face aav
            'years':                  yrs,
            'aav':                    face_aav,
            'guarantee':              guar,
            'term_start':             t_start,
            'term_end':               t_end,
            'contract_status':        status,
            'baseline_war':           baseline_war,
            'expected_war_total':     expected_war_total,
            'expected_war_per_season': expected_war_by_season,
            'seasons_played':         seasons_played if canonical else 0,
            'total_realized_war':     total_realized_war,
            'market_rate_at_signing': market_rate,
            'realized_market_value':  realized_market_value,
            'realized_surplus':       realized_surplus,
            'expected_market_value':  expected_market_value,
            'expected_surplus':       expected_surplus,
            'war_by_season_json':     json.dumps(realized_war_by_season) if realized_war_by_season else None,
        })

    return valuations

# ── DB write ──────────────────────────────────────────────────────────────────
def create_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS market_rates (
            season              INTEGER PRIMARY KEY,
            dollars_per_war     REAL    NOT NULL,
            sample_size         INTEGER,
            total_contracts     INTEGER,
            match_rate          REAL,
            notes               TEXT
        );

        CREATE TABLE IF NOT EXISTS contract_valuations (
            id                      INTEGER PRIMARY KEY AUTOINCREMENT,
            name                    TEXT    NOT NULL,
            canonical_name          TEXT,
            match_type              TEXT,
            signing_class           INTEGER,
            position                TEXT,
            position_group          TEXT,   -- SP, RP, C, 1B, 2B, 3B, SS, OF, DH, UTIL
            role                    TEXT,
            new_team                TEXT,
            age_at_signing          INTEGER,
            years                   INTEGER,
            aav                     REAL,
            guarantee               REAL,
            term_start              INTEGER,
            term_end                INTEGER,
            contract_status         TEXT,

            -- Pre-contract baseline
            baseline_war            REAL,

            -- Aging curve projection (at time of signing)
            expected_war_total      REAL,
            expected_war_per_season REAL,

            -- Realized performance
            seasons_played          INTEGER,
            total_realized_war      REAL,

            -- Economic value
            market_rate_at_signing  REAL,
            realized_market_value   REAL,
            realized_surplus        REAL,   -- positive = team won, negative = overpay
            expected_market_value   REAL,
            expected_surplus        REAL,   -- what was expected at signing

            -- Deferral
            has_deferral            INTEGER DEFAULT 0,
            cbt_aav                 REAL,
            effective_aav           REAL,   -- cbt_aav if deferred, else aav

            -- Raw WAR data for sparklines
            war_by_season_json      TEXT,

            UNIQUE(name, signing_class, new_team)
        );
    """)
    conn.commit()

    # Migrate existing table if columns are missing
    existing = {row[1] for row in conn.execute("PRAGMA table_info(contract_valuations)")}
    for col, typ in [('has_deferral', 'INTEGER DEFAULT 0'),
                     ('cbt_aav',      'REAL'),
                     ('effective_aav','REAL')]:
        if col not in existing:
            conn.execute(f"ALTER TABLE contract_valuations ADD COLUMN {col} {typ}")
    conn.commit()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db',      default=str(Path.home() / 'Desktop/DiamondMinev2/diamondmine.db'))
    parser.add_argument('--min-war', type=float, default=0.5)
    parser.add_argument('--verbose', action='store_true')
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")

    conn = sqlite3.connect(db_path)
    create_tables(conn)

    print("Building name map...")
    name_map = build_name_map(conn)
    fuzzy_keys = list(name_map.keys()) if HAS_FUZZY else None
    print(f"  {len(name_map)} name variants indexed")

    print("\nDeriving market rates...")
    rates = derive_market_rates(conn, name_map, fuzzy_keys,
                                 min_war_per_season=args.min_war,
                                 verbose=args.verbose)

    conn.execute("DELETE FROM market_rates")
    conn.executemany("""
        INSERT OR REPLACE INTO market_rates
            (season, dollars_per_war, sample_size, total_contracts, match_rate)
        VALUES (:season, :dollars_per_war, :sample_size, :total_contracts, :match_rate)
    """, rates.values())
    conn.commit()

    print(f"  {len(rates)} class years with market rates\n")
    print(f"  {'Year':<6} {'$/WAR':>10} {'Sample':>8} {'Match%':>8}")
    print(f"  {'-'*36}")
    for yr in sorted(rates):
        r = rates[yr]
        print(f"  {yr:<6} ${r['dollars_per_war']:>9,.0f} {r['sample_size']:>8} {r['match_rate']:>7.1f}%")

    print("\nComputing contract valuations...")
    valuations = compute_valuations(conn, name_map, fuzzy_keys, rates,
                                     verbose=args.verbose)

    conn.execute("DELETE FROM contract_valuations")
    conn.executemany("""
        INSERT OR REPLACE INTO contract_valuations (
            name, canonical_name, match_type, signing_class, position, position_group, role,
            new_team, age_at_signing, years, aav, guarantee, term_start, term_end,
            contract_status, baseline_war, expected_war_total, expected_war_per_season,
            seasons_played, total_realized_war, market_rate_at_signing,
            realized_market_value, realized_surplus, expected_market_value,
            expected_surplus, has_deferral, cbt_aav, effective_aav, war_by_season_json
        ) VALUES (
            :name, :canonical_name, :match_type, :signing_class, :position, :position_group, :role,
            :new_team, :age_at_signing, :years, :aav, :guarantee, :term_start, :term_end,
            :contract_status, :baseline_war, :expected_war_total, :expected_war_per_season,
            :seasons_played, :total_realized_war, :market_rate_at_signing,
            :realized_market_value, :realized_surplus, :expected_market_value,
            :expected_surplus, :has_deferral, :cbt_aav, :effective_aav, :war_by_season_json
        )
    """, valuations)
    conn.commit()

    total = conn.execute("SELECT COUNT(*) FROM contract_valuations").fetchone()[0]
    with_surplus = conn.execute("""
        SELECT COUNT(*) FROM contract_valuations
        WHERE realized_surplus IS NOT NULL
    """).fetchone()[0]
    print(f"  {total} contracts valued | {with_surplus} with realized surplus data")

    # Spot-checks
    print("\nBiggest team wins (realized surplus, completed contracts):")
    for r in conn.execute("""
        SELECT name, signing_class, new_team, years, aav/1e6, 
               total_realized_war, realized_surplus/1e6
        FROM contract_valuations
        WHERE contract_status = 'complete' AND realized_surplus IS NOT NULL
        ORDER BY realized_surplus DESC LIMIT 8
    """):
        print(f"  {r[0]} {r[1]} {r[2]} | {r[3]}yr ${r[4]:.1f}M AAV | "
              f"{r[5]:.1f} WAR | surplus ${r[6]:.1f}M")

    print("\nBiggest overpays (realized surplus, completed contracts):")
    for r in conn.execute("""
        SELECT name, signing_class, new_team, years, aav/1e6,
               total_realized_war, realized_surplus/1e6
        FROM contract_valuations
        WHERE contract_status = 'complete' AND realized_surplus IS NOT NULL
        ORDER BY realized_surplus ASC LIMIT 8
    """):
        print(f"  {r[0]} {r[1]} {r[2]} | {r[3]}yr ${r[4]:.1f}M AAV | "
              f"{r[5]:.1f} WAR | surplus ${r[6]:.1f}M")

    # Log freshness
    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('compute_economics', 'market_rates', ?, ?, 'Implied $/WAR per FA class year')
    """, (datetime.now().isoformat(), len(rates)))
    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('compute_economics', 'contract_valuations', ?, ?, 'Realized + expected surplus per contract')
    """, (datetime.now().isoformat(), total))
    conn.commit()
    conn.close()
    print("\nDone.")

if __name__ == '__main__':
    main()
