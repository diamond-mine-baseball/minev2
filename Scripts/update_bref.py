"""
update_bref.py — Scrape current year BRef stats directly from standard batting/pitching pages
No Stathead subscription needed. Uses the public 2026-standard-batting.shtml page.

Usage:
  python3 update_bref.py              # updates current year
  python3 update_bref.py --year 2025  # updates specific year
"""

import sqlite3
import argparse
import unicodedata
import re
import logging
import time
import requests
from bs4 import BeautifulSoup
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

DB_PATH = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"
TODAY   = datetime.now().strftime("%Y-%m-%d")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

def norm(s):
    if not s: return ""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", "", s.lower())
    return re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s).strip()

def safe_float(v):
    try: return float(v) if v is not None and str(v) not in ("", "nan", "NaN", "---") else None
    except: return None

def safe_int(v):
    try: return int(float(v)) if v is not None and str(v) not in ("", "nan", "NaN", "---") else None
    except: return None

def scrape_table(url, table_id):
    log.info(f"  Fetching {url}")
    time.sleep(3)  # be polite to BRef
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    table = soup.find("table", {"id": table_id})
    if not table:
        log.error(f"  Table {table_id} not found")
        return []
    rows = []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in tr.get("class", []):
            continue
        row = {}
        for td in tr.find_all(["td", "th"]):
            stat = td.get("data-stat")
            if stat:
                row[stat] = td.get_text(strip=True)
        if row.get("name_display") and row.get("name_display") != "":
            rows.append(row)
    log.info(f"  {len(rows)} rows scraped")
    return rows

def update_batting(conn, year):
    log.info(f"Scraping BRef batting for {year}...")
    url = f"https://www.baseball-reference.com/leagues/majors/{year}-standard-batting.shtml"
    rows = scrape_table(url, "players_standard_batting")

    updated = 0
    for row in rows:
        name = row.get("name_display", "").strip()
        team = row.get("team_name_abbr", "").strip()
        if not name or team in ("", "TOT"):
            continue

        conn.execute("""
            UPDATE batting SET
                bwar    = COALESCE(?, bwar),
                opsplus = COALESCE(?, opsplus),
                obp     = COALESCE(?, obp),
                slg     = COALESCE(?, slg),
                ops     = COALESCE(?, ops),
                avg     = COALESCE(?, avg),
                doubles = COALESCE(?, doubles),
                triples = COALESCE(?, triples),
                as_of   = ?
            WHERE LOWER(name) = LOWER(?) AND season = ? AND team = ?
        """, (
            safe_float(row.get("b_war")),
            safe_int(row.get("b_onbase_plus_slugging_plus")),
            safe_float(row.get("b_onbase_perc")),
            safe_float(row.get("b_slugging_perc")),
            safe_float(row.get("b_onbase_plus_slugging")),
            safe_float(row.get("b_batting_avg")),
            safe_int(row.get("b_doubles")),
            safe_int(row.get("b_triples")),
            TODAY,
            name, year, team
        ))
        updated += conn.execute("SELECT changes()").fetchone()[0]

    conn.commit()
    log.info(f"  Updated {updated} batting rows")

def update_pitching(conn, year):
    log.info(f"Scraping BRef pitching for {year}...")
    url = f"https://www.baseball-reference.com/leagues/majors/{year}-standard-pitching.shtml"

    # Check pitching table columns first
    time.sleep(3)
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    table = soup.find("table", {"id": "players_standard_pitching"})
    if not table:
        log.error("  Pitching table not found")
        return

    rows = []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in tr.get("class", []):
            continue
        row = {}
        for td in tr.find_all(["td", "th"]):
            stat = td.get("data-stat")
            if stat:
                row[stat] = td.get_text(strip=True)
        if row.get("name_display") and row.get("name_display") != "":
            rows.append(row)

    log.info(f"  {len(rows)} rows scraped")

    updated = 0
    for row in rows:
        name = row.get("name_display", "").strip()
        team = row.get("team_name_abbr", "").strip()
        if not name or team in ("", "TOT"):
            continue

        conn.execute("""
            UPDATE pitching SET
                bwar    = COALESCE(?, bwar),
                eraplus = COALESCE(?, eraplus),
                as_of   = ?
            WHERE LOWER(name) = LOWER(?) AND season = ? AND team = ?
        """, (
            safe_float(row.get("p_war")),
            safe_int(row.get("earned_run_avg_plus")),
            TODAY,
            name, year, team
        ))
        updated += conn.execute("SELECT changes()").fetchone()[0]

    conn.commit()
    log.info(f"  Updated {updated} pitching rows")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now().year)
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    try:
        update_batting(conn, args.year)
        update_pitching(conn, args.year)
        log.info(f"Done. BRef stats updated for {args.year}.")
    finally:
        conn.close()
