#!/usr/bin/env python3
"""
scrape_player_salaries.py
Scrapes per-player salary data from Cot's Baseball Contracts team pages.
Handles public Google Sheets (pubhtml URLs, typically 2009–2018).
Private sheets (2019+) must be exported manually via CoWork — see README.

Usage:
    python3 scrape_player_salaries.py [--db PATH] [--delay SECONDS] [--csv-dir PATH]

Output:
    - player_salaries table in diamondmine.db
    - Optional: CSV files per team/year in --csv-dir for manual inspection

Schema:
    player_salaries(name, team, season, salary, position, ml_service, agent,
                    contract_notes, source)
"""

import sqlite3
import re
import time
import csv
import argparse
from pathlib import Path
from datetime import datetime

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Missing dependencies. Run:\n  pip3 install requests beautifulsoup4")
    raise SystemExit(1)

BASE = "https://legacy.baseballprospectus.com/compensation/cots"

# All 30 teams with their URL paths and standard abbreviations
TEAMS = [
    ("al-east/baltimore-orioles",           "BAL"),
    ("al-east/boston-red-sox",              "BOS"),
    ("al-east/new-york-yankees",            "NYA"),
    ("al-east/tampa-bay-rays",              "TBA"),
    ("al-east/toronto-blue-jays",           "TOR"),
    ("american-league/chicago-white-sox",   "CHA"),
    ("american-league/cleveland-guardians", "CLE"),
    ("american-league/detroit-tigers",      "DET"),
    ("american-league/kansas-city-royals",  "KCA"),
    ("american-league/minnesota-twins",     "MIN"),
    ("al-west/athletics",                   "ATH"),
    ("al-west/houston-astros",              "HOU"),
    ("al-west/los-angeles-angels",          "ANA"),
    ("al-west/seattle-mariners",            "SEA"),
    ("al-west/texas-rangers",               "TEX"),
    ("national-league/atlanta-braves",      "ATL"),
    ("national-league/miami-marlins",       "MIA"),
    ("national-league/new-york-mets",       "NYN"),
    ("national-league/philadelphia-phillies","PHI"),
    ("national-league/washington-nationals","WAS"),
    ("national-league-central/chicago-cubs",      "CHN"),
    ("national-league-central/cincinnati-reds",   "CIN"),
    ("national-league-central/milwaukee-brewers", "MIL"),
    ("national-league-central/pittsburgh-pirates","PIT"),
    ("national-league-central/st-louis-cardinals","SLN"),
    ("nl-west/arizona-diamondbacks",        "ARI"),
    ("nl-west/colorado-rockies",            "COL"),
    ("nl-west/los-angeles-dodgers",         "LAN"),
    ("nl-west/san-diego-padres",            "SDN"),
    ("nl-west/san-francisco-giants",        "SFN"),
]

PLAYER_RE = re.compile(r'^[A-Z][a-z].*?,\s')  # "LastName, FirstName"


def normalize_name(raw):
    """'Buehrle, Mark' → 'Mark Buehrle'"""
    parts = str(raw).strip().split(',', 1)
    if len(parts) == 2:
        return f"{parts[1].strip()} {parts[0].strip()}"
    return raw.strip()


def parse_salary(s):
    """'$14,000,000' or '$14.000' (millions) → float in dollars, or None"""
    if not s:
        return None
    s = str(s).strip().replace(',', '')
    if s in ('FA', 'fa', '-', '', 'n/a', 'N/A', 'DFA', 'Ret', 'Minors'):
        return None
    m = re.search(r'\$?([\d.]+)', s)
    if not m:
        return None
    try:
        val = float(m.group(1))
        # Heuristic: values < 500 are in millions (e.g. "$14.000" = $14M)
        if val < 500:
            val *= 1_000_000
        return val
    except ValueError:
        return None


def parse_service(s):
    """'8.078' → '8.078' (keep as string, years.days format)"""
    try:
        return str(s).strip() if s else None
    except Exception:
        return None


def extract_sheet_links(html, team_abbr):
    """
    Parse a Cot's team page and return dict of:
      {year: {'url': ..., 'type': 'pubhtml'|'private'|'none'}}
    """
    soup = BeautifulSoup(html, 'html.parser')
    results = {}

    # Find payroll table rows
    for table in soup.find_all('table'):
        if 'Opening Day' not in table.get_text():
            continue
        for tr in table.find_all('tr'):
            tds = tr.find_all(['td', 'th'])
            if not tds:
                continue
            year_text = tds[0].get_text(strip=True)
            if not re.match(r'^\d{4}$', year_text):
                continue
            year = int(year_text)

            # Look for a link in the Opening Day column (td[1])
            link = tds[1].find('a') if len(tds) > 1 else None
            if not link or not link.get('href'):
                results[year] = {'url': None, 'type': 'none'}
                continue

            href = link['href']
            if 'pubhtml' in href or 'pub?output=html' in href or 'pub?output=csv' in href:
                results[year] = {'url': href, 'type': 'pubhtml'}
            elif 'docs.google.com/spreadsheets' in href:
                results[year] = {'url': href, 'type': 'private'}
            else:
                results[year] = {'url': href, 'type': 'other'}

    return results


def fetch_pubhtml_sheet(url, session):
    """
    Fetch a public Google Sheet (pubhtml) and return list of player row dicts.
    """
    # Convert edit links to pubhtml if needed
    if '/edit' in url:
        sheet_id = re.search(r'/d/([^/]+)', url)
        gid = re.search(r'gid=(\d+)', url)
        if sheet_id:
            base_id = sheet_id.group(1)
            gid_str = f'&gid={gid.group(1)}' if gid else ''
            url = f'https://docs.google.com/spreadsheets/d/{base_id}/pubhtml?{gid_str}'

    resp = session.get(url, timeout=20)
    if resp.status_code != 200:
        return []

    soup = BeautifulSoup(resp.text, 'html.parser')

    # Find the main data table
    rows = []
    table = soup.find('table')
    if not table:
        return []

    # Parse headers to find year columns
    headers = []
    header_row = table.find('tr')
    if header_row:
        headers = [th.get_text(strip=True) for th in header_row.find_all(['th', 'td'])]

    # Find column indices for year columns (4-digit years)
    year_cols = {}
    for i, h in enumerate(headers):
        m = re.search(r'(20\d{2})', h)
        if m:
            year_cols[int(m.group(1))] = i

    for tr in table.find_all('tr')[1:]:  # skip header
        cells = [td.get_text(strip=True) for td in tr.find_all(['td', 'th'])]
        if not cells:
            continue

        name_raw = cells[0] if cells else ''
        if not PLAYER_RE.match(name_raw):
            continue  # skip non-player rows (headers, totals, notes)

        player = {
            'name':             normalize_name(name_raw),
            'salary':           parse_salary(cells[1]) if len(cells) > 1 else None,
            'position':         cells[2].strip() if len(cells) > 2 else None,
            'ml_service':       parse_service(cells[3]) if len(cells) > 3 else None,
            'agent':            cells[4].strip() if len(cells) > 4 else None,
            'contract_notes':   cells[5].strip() if len(cells) > 5 else None,
            'year_salaries':    {},  # {year: salary_dollars}
        }

        # Extract per-year salary projections
        for yr, col_i in year_cols.items():
            if col_i < len(cells):
                player['year_salaries'][yr] = parse_salary(cells[col_i])

        rows.append(player)

    return rows


def create_table(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS player_salaries (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT    NOT NULL,
            team            TEXT    NOT NULL,
            season          INTEGER NOT NULL,
            salary          REAL,               -- opening day cash salary
            position        TEXT,
            ml_service      TEXT,               -- years.days format e.g. "8.078"
            agent           TEXT,
            contract_notes  TEXT,               -- e.g. "4 yr/$56M (08-11)"
            source          TEXT,               -- URL of source sheet
            as_of           TEXT,
            UNIQUE(name, team, season)
        );

        CREATE INDEX IF NOT EXISTS idx_ps_name_season ON player_salaries(name, season);
        CREATE INDEX IF NOT EXISTS idx_ps_team_season  ON player_salaries(team, season);
    """)
    conn.commit()


def upsert_rows(conn, rows_to_insert):
    conn.executemany("""
        INSERT OR IGNORE INTO player_salaries
            (name, team, season, salary, position, ml_service, agent, contract_notes, source, as_of)
        VALUES
            (:name, :team, :season, :salary, :position, :ml_service, :agent,
             :contract_notes, :source, :as_of)
    """, rows_to_insert)
    conn.commit()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db',      default=str(Path.home() / 'Desktop/DiamondMinev2/diamondmine.db'))
    parser.add_argument('--delay',   type=float, default=2.0)
    parser.add_argument('--csv-dir', default=None, help='Directory to save CSV files per team/year')
    parser.add_argument('--team',    default=None, help='Only process this team abbrev e.g. CHA')
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.exists():
        raise FileNotFoundError(f"DB not found: {db_path}")

    csv_dir = Path(args.csv_dir) if args.csv_dir else None
    if csv_dir:
        csv_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    create_table(conn)

    session = requests.Session()
    session.headers['User-Agent'] = 'DiamondMine/2.0 baseball research project'

    total_inserted = 0
    today = datetime.now().isoformat()[:10]

    teams_to_process = [(p, a) for p, a in TEAMS if not args.team or a == args.team]

    for url_path, abbr in teams_to_process:
        print(f"\n{'='*50}")
        print(f"  {abbr}  — {BASE}/{url_path}/")

        # Fetch team page
        try:
            resp = session.get(f"{BASE}/{url_path}/", timeout=15)
            resp.raise_for_status()
        except Exception as e:
            print(f"  ERROR fetching team page: {e}")
            continue

        sheet_links = extract_sheet_links(resp.text, abbr)
        print(f"  Found {len(sheet_links)} seasons | "
              f"public: {sum(1 for v in sheet_links.values() if v['type']=='pubhtml')} | "
              f"private: {sum(1 for v in sheet_links.values() if v['type']=='private')} | "
              f"no link: {sum(1 for v in sheet_links.values() if v['type']=='none')}")

        for season in sorted(sheet_links):
            info = sheet_links[season]
            if info['type'] != 'pubhtml':
                if info['type'] == 'private':
                    print(f"    {season}: PRIVATE (needs CoWork export)")
                continue

            print(f"    {season}: fetching public sheet...", end=' ', flush=True)
            try:
                players = fetch_pubhtml_sheet(info['url'], session)
            except Exception as e:
                print(f"ERROR: {e}")
                continue

            if not players:
                print("no data")
                continue

            rows_to_insert = []
            for p in players:
                # Primary row: opening day salary for this season
                rows_to_insert.append({
                    'name':           p['name'],
                    'team':           abbr,
                    'season':         season,
                    'salary':         p['salary'],
                    'position':       p['position'],
                    'ml_service':     p['ml_service'],
                    'agent':          p['agent'],
                    'contract_notes': p['contract_notes'],
                    'source':         info['url'],
                    'as_of':          today,
                })

                # Also insert projected salaries for future years from this sheet
                for yr, sal in (p.get('year_salaries') or {}).items():
                    if yr == season or sal is None:
                        continue
                    rows_to_insert.append({
                        'name':           p['name'],
                        'team':           abbr,
                        'season':         yr,
                        'salary':         sal,
                        'position':       p['position'],
                        'ml_service':     p['ml_service'],
                        'agent':          p['agent'],
                        'contract_notes': p['contract_notes'],
                        'source':         info['url'],
                        'as_of':          today,
                    })

            upsert_rows(conn, rows_to_insert)
            n = len([r for r in rows_to_insert if r['season'] == season])
            total_inserted += n
            print(f"{n} players")

            # Save CSV if requested
            if csv_dir and players:
                csv_path = csv_dir / f"{abbr}_{season}_payroll.csv"
                with open(csv_path, 'w', newline='') as f:
                    writer = csv.DictWriter(f, fieldnames=[
                        'name','position','ml_service','agent','contract_notes','salary'
                    ])
                    writer.writeheader()
                    for p in players:
                        writer.writerow({
                            'name': p['name'], 'position': p['position'],
                            'ml_service': p['ml_service'], 'agent': p['agent'],
                            'contract_notes': p['contract_notes'],
                            'salary': p['salary'],
                        })

            time.sleep(args.delay)

        time.sleep(args.delay)

    # Summary
    total_rows = conn.execute("SELECT COUNT(*) FROM player_salaries").fetchone()[0]
    seasons   = conn.execute("SELECT MIN(season), MAX(season) FROM player_salaries").fetchone()
    print(f"\n{'='*50}")
    print(f"Done — {total_rows} total rows in player_salaries | {seasons[0]}–{seasons[1]}")

    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES ('cots_pubhtml', 'player_salaries', ?, ?, 'Per-player opening day salaries from public Cot sheets')
    """, (today, total_rows))
    conn.commit()
    conn.close()


if __name__ == '__main__':
    main()
