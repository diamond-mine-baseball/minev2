#!/usr/bin/env python3
"""
scrape_payrolls.py
Scrapes historical team payroll data from Cot's Baseball Contracts and loads
it into diamondmine.db. Also seeds the cbt_thresholds table.

Usage:
    python3 scrape_payrolls.py [--db PATH] [--delay SECONDS]

Defaults:
    --db     ~/Desktop/DiamondMinev2/diamondmine.db
    --delay  1.5   (seconds between requests — be polite)
"""

import sqlite3
import re
import time
import argparse
from pathlib import Path
from datetime import datetime

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run:\n  pip3 install requests beautifulsoup4")
    raise SystemExit(1)

# ── CBT Thresholds (hardcoded — official CBA figures) ─────────────────────────
# Luxury tax introduced in 2003. Pre-2003 = no threshold.
CBT_THRESHOLDS = {
    2003: 117_000_000,
    2004: 120_500_000,
    2005: 128_000_000,
    2006: 136_500_000,
    2007: 148_000_000,
    2008: 155_000_000,
    2009: 162_000_000,
    2010: 170_000_000,
    2011: 178_000_000,
    2012: 178_000_000,
    2013: 178_000_000,
    2014: 189_000_000,
    2015: 189_000_000,
    2016: 189_000_000,
    2017: 195_000_000,
    2018: 197_000_000,
    2019: 206_000_000,
    2020: 208_000_000,
    2021: 210_000_000,
    2022: 230_000_000,  # new CBA
    2023: 233_000_000,
    2024: 237_000_000,
    2025: 241_000_000,
    2026: 244_000_000,
}

# ── All 30 team pages ──────────────────────────────────────────────────────────
BASE = "https://legacy.baseballprospectus.com/compensation/cots"

TEAMS = [
    # (url_path, abbrev, full_name)
    # AL East
    ("al-east/baltimore-orioles",       "BAL", "Baltimore Orioles"),
    ("al-east/boston-red-sox",          "BOS", "Boston Red Sox"),
    ("al-east/new-york-yankees",        "NYA", "New York Yankees"),
    ("al-east/tampa-bay-rays",          "TBA", "Tampa Bay Rays"),
    ("al-east/toronto-blue-jays",       "TOR", "Toronto Blue Jays"),
    # AL Central
    ("american-league/chicago-white-sox",   "CHA", "Chicago White Sox"),
    ("american-league/cleveland-guardians", "CLE", "Cleveland Guardians"),
    ("american-league/detroit-tigers",      "DET", "Detroit Tigers"),
    ("american-league/kansas-city-royals",  "KCA", "Kansas City Royals"),
    ("american-league/minnesota-twins",     "MIN", "Minnesota Twins"),
    # AL West
    ("al-west/athletics",               "ATH", "Athletics"),
    ("al-west/houston-astros",          "HOU", "Houston Astros"),
    ("al-west/los-angeles-angels",      "ANA", "Los Angeles Angels"),
    ("al-west/seattle-mariners",        "SEA", "Seattle Mariners"),
    ("al-west/texas-rangers",           "TEX", "Texas Rangers"),
    # NL East
    ("national-league/atlanta-braves",      "ATL", "Atlanta Braves"),
    ("national-league/miami-marlins",       "MIA", "Miami Marlins"),
    ("national-league/new-york-mets",       "NYN", "New York Mets"),
    ("national-league/philadelphia-phillies","PHI", "Philadelphia Phillies"),
    ("national-league/washington-nationals", "WAS", "Washington Nationals"),
    # NL Central
    ("national-league-central/chicago-cubs",      "CHN", "Chicago Cubs"),
    ("national-league-central/cincinnati-reds",   "CIN", "Cincinnati Reds"),
    ("national-league-central/milwaukee-brewers", "MIL", "Milwaukee Brewers"),
    ("national-league-central/pittsburgh-pirates","PIT", "Pittsburgh Pirates"),
    ("national-league-central/st-louis-cardinals","SLN", "St. Louis Cardinals"),
    # NL West
    ("nl-west/arizona-diamondbacks",    "ARI", "Arizona Diamondbacks"),
    ("nl-west/colorado-rockies",        "COL", "Colorado Rockies"),
    ("nl-west/los-angeles-dodgers",     "LAN", "Los Angeles Dodgers"),
    ("nl-west/san-diego-padres",        "SDN", "San Diego Padres"),
    ("nl-west/san-francisco-giants",    "SFN", "San Francisco Giants"),
]


def parse_dollar(text):
    """'$298,000,000 ( 3)' → 298000000.0, or None if placeholder/missing."""
    if not text:
        return None
    # Strip links, whitespace
    clean = re.sub(r'\s+', '', text.strip())
    # Reject placeholders like $000,000,000
    if re.search(r'\$0{3},0{3},0{3}', clean):
        return None
    m = re.search(r'\$([0-9,]+)', clean)
    if not m:
        return None
    try:
        return float(m.group(1).replace(',', ''))
    except ValueError:
        return None


def scrape_team_payrolls(url_path, abbrev, full_name, session):
    url = f"{BASE}/{url_path}/"
    resp = session.get(url, timeout=15)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, 'html.parser')

    # Find the payroll table — look for table containing "Opening Day"
    payroll_table = None
    for table in soup.find_all('table'):
        text = table.get_text()
        if 'Opening Day' in text and 'Year End' in text:
            payroll_table = table
            break

    if not payroll_table:
        print(f"  WARNING: No payroll table found for {full_name}")
        return []

    rows = []
    for tr in payroll_table.find_all('tr'):
        tds = tr.find_all(['td', 'th'])
        if len(tds) < 3:
            continue

        year_text = tds[0].get_text(strip=True)
        # Year must be a 4-digit number
        if not re.match(r'^\d{4}$', year_text):
            continue

        season = int(year_text)
        opening_day = parse_dollar(tds[1].get_text())
        year_end    = parse_dollar(tds[2].get_text())
        cb_tax      = parse_dollar(tds[3].get_text()) if len(tds) > 3 else None

        rows.append({
            'team':              abbrev,
            'team_name':         full_name,
            'season':            season,
            'opening_day_payroll': opening_day,
            'year_end_payroll':  year_end,
            'cb_tax_payroll':    cb_tax,
        })

    return rows


def create_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS cbt_thresholds (
            season      INTEGER PRIMARY KEY,
            threshold   REAL    NOT NULL,
            notes       TEXT
        );

        CREATE TABLE IF NOT EXISTS team_payrolls (
            id                   INTEGER PRIMARY KEY AUTOINCREMENT,
            team                 TEXT    NOT NULL,
            team_name            TEXT,
            season               INTEGER NOT NULL,
            opening_day_payroll  REAL,
            year_end_payroll     REAL,
            cb_tax_payroll       REAL,
            UNIQUE(team, season)
        );
    """)
    conn.commit()


def seed_cbt_thresholds(conn):
    conn.execute("DELETE FROM cbt_thresholds")
    conn.executemany(
        "INSERT INTO cbt_thresholds (season, threshold, notes) VALUES (?, ?, ?)",
        [(yr, amt, "Official CBA luxury tax threshold") for yr, amt in sorted(CBT_THRESHOLDS.items())]
    )
    conn.commit()
    print(f"✓ cbt_thresholds: {len(CBT_THRESHOLDS)} seasons seeded")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db',    default=str(Path.home() / 'Desktop/DiamondMinev2/diamondmine.db'))
    parser.add_argument('--delay', type=float, default=1.5)
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")

    conn = sqlite3.connect(db_path)
    create_tables(conn)
    seed_cbt_thresholds(conn)

    session = requests.Session()
    session.headers['User-Agent'] = 'DiamondMine/2.0 baseball research project'

    all_rows = []
    for url_path, abbrev, full_name in TEAMS:
        print(f"  Scraping {full_name}...", end=' ', flush=True)
        try:
            rows = scrape_team_payrolls(url_path, abbrev, full_name, session)
            print(f"{len(rows)} seasons")
            all_rows.extend(rows)
        except Exception as e:
            print(f"ERROR: {e}")
        time.sleep(args.delay)

    print(f"\nInserting {len(all_rows)} team-season rows...")
    conn.execute("DELETE FROM team_payrolls")
    conn.executemany("""
        INSERT OR REPLACE INTO team_payrolls
            (team, team_name, season, opening_day_payroll, year_end_payroll, cb_tax_payroll)
        VALUES
            (:team, :team_name, :season, :opening_day_payroll, :year_end_payroll, :cb_tax_payroll)
    """, all_rows)
    conn.commit()

    # Quick validation
    total   = conn.execute("SELECT COUNT(*) FROM team_payrolls").fetchone()[0]
    seasons = conn.execute("SELECT MIN(season), MAX(season) FROM team_payrolls WHERE opening_day_payroll IS NOT NULL").fetchone()
    print(f"✓ team_payrolls: {total} rows | coverage {seasons[0]}–{seasons[1]}")

    # Spot-check: highest single-season payrolls
    print("\nTop 5 highest opening-day payrolls:")
    for r in conn.execute("""
        SELECT tp.team, tp.season, tp.opening_day_payroll, ct.threshold,
               ROUND(tp.opening_day_payroll / ct.threshold * 100, 1) AS pct_threshold
        FROM team_payrolls tp
        LEFT JOIN cbt_thresholds ct ON tp.season = ct.season
        WHERE tp.opening_day_payroll IS NOT NULL
        ORDER BY tp.opening_day_payroll DESC LIMIT 5
    """):
        pct = f"{r[4]}% of CBT" if r[4] else "pre-CBT era"
        print(f"  {r[0]} {r[1]}: ${r[2]/1e6:.1f}M ({pct})")

    # Log freshness
    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('Cots/BP', 'team_payrolls', ?, ?, 'Historical opening day + year-end + CB tax payrolls')
    """, (datetime.now().isoformat(), total))
    conn.commit()
    conn.close()
    print("\nDone.")


if __name__ == '__main__':
    main()
