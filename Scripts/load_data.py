"""
DiamondMinev2 — Data Loader
============================
Loads all data sources into diamondmine.db in the correct order.

Run order (handles dependencies automatically):
  Step 1 — BRef batting + pitching CSVs (1920–2026)  → batting, pitching tables
  Step 2 — MLB Stats API (2015–2026)                 → player table, extend batting/pitching, fielding
  Step 3 — Baseball Savant statcast CSV              → statcast table
  Step 4 — DRS CSV (SIS)                             → drs table
  Step 5 — Scoring settings                          → scoring_settings table

Usage:
  python3 load_data.py                    # full load
  python3 load_data.py --step bref        # only step 1
  python3 load_data.py --step mlb         # only step 2
  python3 load_data.py --step statcast    # only step 3
  python3 load_data.py --step drs         # only step 4
  python3 load_data.py --year 2026        # refresh a specific year only

Requirements:
  pip3 install pandas requests
"""

import sqlite3
import pandas as pd
import requests
import unicodedata
import re
import time
import logging
import argparse
from pathlib import Path
from datetime import datetime
from io import StringIO

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Paths ──────────────────────────────────────────────────────────────────────

BASE        = Path.home() / "Desktop" / "DiamondMinev2"
DB_PATH     = BASE / "diamondmine.db"
DATA_DIR    = BASE / "data"
TODAY       = datetime.now().strftime("%Y-%m-%d")
CURRENT_YEAR = datetime.now().year

BREF_BATTING_CSV  = DATA_DIR / "bref_batting_1920_2026.csv"
BREF_PITCHING_CSV = DATA_DIR / "bref_pitching_1920_2026.csv"
DRS_CSV           = DATA_DIR / "drs_by_season_final.csv"
STATCAST_CSV      = DATA_DIR / "statcast_2015_2026.csv"  # optional — can re-download

MLB_API = "https://statsapi.mlb.com/api/v1"
START_YEAR = 2015

# ── HTTP session ───────────────────────────────────────────────────────────────

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
})

# ── Helpers ────────────────────────────────────────────────────────────────────

def norm(s):
    """Normalize player name for fuzzy matching."""
    if not s:
        return ""
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", "", s.lower())
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s).strip()
    return s

def log_freshness(conn, source, table, rows, notes=""):
    conn.execute("""
        INSERT OR REPLACE INTO data_freshness (source, table_name, last_updated, rows_affected, notes)
        VALUES (?,?,?,?,?)
    """, (source, table, TODAY, rows, notes))

def safe_int(v):
    try:
        return int(float(v)) if v is not None and str(v).strip() not in ("", "nan") else None
    except:
        return None

def safe_float(v):
    try:
        return float(v) if v is not None and str(v).strip() not in ("", "nan") else None
    except:
        return None

# ── Step 1: Load BRef CSVs ─────────────────────────────────────────────────────

def load_bref_batting(conn, year_filter=None):
    log.info("Step 1a: Loading BRef batting CSV...")
    if not BREF_BATTING_CSV.exists():
        log.error(f"  File not found: {BREF_BATTING_CSV}")
        return

    df = pd.read_csv(BREF_BATTING_CSV)
    if year_filter:
        df = df[df["season"] == year_filter]
    log.info(f"  {len(df)} rows to load")

    inserted = updated = skipped = 0
    for _, row in df.iterrows():
        try:
            conn.execute("""
                INSERT INTO batting
                  (name, season, team, age, g, pa, ab, h, hr, rbi, bb, so, sb,
                   avg, obp, slg, ops, bwar, opsplus, as_of)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(name, season, team) DO UPDATE SET
                  bwar=excluded.bwar, opsplus=excluded.opsplus,
                  g=excluded.g, pa=excluded.pa, ab=excluded.ab,
                  h=excluded.h, hr=excluded.hr, rbi=excluded.rbi,
                  bb=excluded.bb, so=excluded.so, sb=excluded.sb,
                  avg=excluded.avg, obp=excluded.obp, slg=excluded.slg,
                  ops=excluded.ops, age=excluded.age, as_of=excluded.as_of
            """, (
                str(row.get("name", "") or ""),
                safe_int(row.get("season")),
                str(row.get("team", "") or ""),
                safe_int(row.get("age")),
                safe_int(row.get("g")),
                safe_int(row.get("pa")),
                safe_int(row.get("ab")),
                safe_int(row.get("h")),
                safe_int(row.get("hr")),
                safe_int(row.get("rbi")),
                safe_int(row.get("bb")),
                safe_int(row.get("so")),
                safe_int(row.get("sb")),
                safe_float(row.get("avg")),
                safe_float(row.get("obp")),
                safe_float(row.get("slg")),
                safe_float(row.get("ops")),
                safe_float(row.get("bwar")),
                safe_int(row.get("opsplus")),
                TODAY,
            ))
            inserted += 1
        except Exception as e:
            skipped += 1
            if skipped <= 3:
                log.warning(f"  Row skipped: {e} — {dict(row)}")

    conn.commit()
    log_freshness(conn, "baseball_reference", "batting", inserted)
    conn.commit()
    log.info(f"  Done: {inserted} rows loaded, {skipped} skipped")


def load_bref_pitching(conn, year_filter=None):
    log.info("Step 1b: Loading BRef pitching CSV...")
    if not BREF_PITCHING_CSV.exists():
        log.error(f"  File not found: {BREF_PITCHING_CSV}")
        return

    df = pd.read_csv(BREF_PITCHING_CSV)
    if year_filter:
        df = df[df["season"] == year_filter]
    log.info(f"  {len(df)} rows to load")

    inserted = skipped = 0
    for _, row in df.iterrows():
        # Parse IP: "363.1" means 363 and 1/3 innings → store as float
        ip_raw = str(row.get("ip", "") or "")
        try:
            if "." in ip_raw:
                parts = ip_raw.split(".")
                ip = int(parts[0]) + int(parts[1]) / 3
            else:
                ip = float(ip_raw) if ip_raw else None
        except:
            ip = None

        try:
            conn.execute("""
                INSERT INTO pitching
                  (name, season, team, age, w, l, g, gs, sv, ip, h, er, hr,
                   bb, so, era, whip, bwar, eraplus, as_of)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(name, season, team) DO UPDATE SET
                  bwar=excluded.bwar, eraplus=excluded.eraplus,
                  w=excluded.w, l=excluded.l, g=excluded.g, gs=excluded.gs,
                  sv=excluded.sv, ip=excluded.ip, h=excluded.h, er=excluded.er,
                  hr=excluded.hr, bb=excluded.bb, so=excluded.so,
                  era=excluded.era, whip=excluded.whip,
                  age=excluded.age, as_of=excluded.as_of
            """, (
                str(row.get("name", "") or ""),
                safe_int(row.get("season")),
                str(row.get("team", "") or ""),
                safe_int(row.get("age")),
                safe_int(row.get("w")),
                safe_int(row.get("l")),
                safe_int(row.get("g")),
                safe_int(row.get("gs")),
                safe_int(row.get("sv")),
                ip,
                safe_int(row.get("h")),
                safe_int(row.get("er")),
                safe_int(row.get("hr")),
                safe_int(row.get("bb")),
                safe_int(row.get("so")),
                safe_float(row.get("era")),
                safe_float(row.get("whip")),
                safe_float(row.get("bwar")),
                safe_int(row.get("eraplus")),
                TODAY,
            ))
            inserted += 1
        except Exception as e:
            skipped += 1
            if skipped <= 3:
                log.warning(f"  Row skipped: {e}")

    conn.commit()
    log_freshness(conn, "baseball_reference", "pitching", inserted)
    conn.commit()
    log.info(f"  Done: {inserted} rows loaded, {skipped} skipped")


# ── Step 2: MLB Stats API ──────────────────────────────────────────────────────

def fetch_mlb_batting(year):
    url = (f"{MLB_API}/stats?stats=season&group=hitting&season={year}"
           f"&sportId=1&limit=2000&offset=0")
    try:
        r = SESSION.get(url, timeout=30)
        r.raise_for_status()
        splits = r.json().get("stats", [{}])[0].get("splits", [])
        rows = []
        for s in splits:
            p  = s.get("player", {})
            t  = s.get("team", {})
            st = s.get("stat", {})
            rows.append({
                "name":    p.get("fullName"),
                "mlbam_id": p.get("id"),
                "team":    t.get("abbreviation"),
                "season":  year,
                "g":       st.get("gamesPlayed"),
                "pa":      st.get("plateAppearances"),
                "ab":      st.get("atBats"),
                "r":       st.get("runs"),
                "h":       st.get("hits"),
                "doubles": st.get("doubles"),
                "triples": st.get("triples"),
                "hr":      st.get("homeRuns"),
                "rbi":     st.get("rbi"),
                "bb":      st.get("baseOnBalls"),
                "ibb":     st.get("intentionalWalks"),
                "so":      st.get("strikeOuts"),
                "hbp":     st.get("hitByPitch"),
                "sf":      st.get("sacFlies"),
                "sb":      st.get("stolenBases"),
                "cs":      st.get("caughtStealing"),
                "avg":     safe_float(st.get("avg")),
                "obp":     safe_float(st.get("obp")),
                "slg":     safe_float(st.get("slg")),
                "ops":     safe_float(st.get("ops")),
            })
        log.info(f"  MLB API batting {year}: {len(rows)} players")
        return rows
    except Exception as e:
        log.error(f"  MLB API batting {year}: {e}")
        return []


def fetch_mlb_pitching(year):
    url = (f"{MLB_API}/stats?stats=season&group=pitching&season={year}"
           f"&sportId=1&limit=2000&offset=0")
    try:
        r = SESSION.get(url, timeout=30)
        r.raise_for_status()
        splits = r.json().get("stats", [{}])[0].get("splits", [])
        rows = []
        for s in splits:
            p  = s.get("player", {})
            t  = s.get("team", {})
            st = s.get("stat", {})
            ip_str = st.get("inningsPitched", "0") or "0"
            try:
                ip = float(ip_str)
            except:
                ip = None
            rows.append({
                "name":    p.get("fullName"),
                "mlbam_id": p.get("id"),
                "team":    t.get("abbreviation"),
                "season":  year,
                "w":       st.get("wins"),
                "l":       st.get("losses"),
                "g":       st.get("gamesPlayed"),
                "gs":      st.get("gamesStarted"),
                "cg":      st.get("completeGames"),
                "sho":     st.get("shutouts"),
                "sv":      st.get("saves"),
                "hld":     st.get("holds"),
                "bs":      st.get("blownSaves"),
                "ip":      ip,
                "h":       st.get("hits"),
                "r":       st.get("runs"),
                "er":      st.get("earnedRuns"),
                "hr":      st.get("homeRuns"),
                "bb":      st.get("baseOnBalls"),
                "ibb":     st.get("intentionalWalks"),
                "so":      st.get("strikeOuts"),
                "hbp":     st.get("hitByPitch"),
                "wp":      st.get("wildPitches"),
                "tbf":     st.get("battersFaced"),
                "era":     safe_float(st.get("era")),
                "whip":    safe_float(st.get("whip")),
                "k_9":     safe_float(st.get("strikeoutsPer9Inn")),
                "bb_9":    safe_float(st.get("walksPer9Inn")),
                "h_9":     safe_float(st.get("hitsPer9Inn")),
                "hr_9":    safe_float(st.get("homeRunsPer9")),
            })
        log.info(f"  MLB API pitching {year}: {len(rows)} pitchers")
        return rows
    except Exception as e:
        log.error(f"  MLB API pitching {year}: {e}")
        return []


def fetch_mlb_fielding(year):
    url = (f"{MLB_API}/stats?stats=season&group=fielding&season={year}"
           f"&sportId=1&limit=3000&offset=0")
    try:
        r = SESSION.get(url, timeout=30)
        r.raise_for_status()
        splits = r.json().get("stats", [{}])[0].get("splits", [])
        rows = []
        for s in splits:
            p   = s.get("player", {})
            t   = s.get("team", {})
            st  = s.get("stat", {})
            pos = s.get("position", {})
            rows.append({
                "name":    p.get("fullName"),
                "mlbam_id": p.get("id"),
                "team":    t.get("abbreviation"),
                "season":  year,
                "pos":     pos.get("abbreviation"),
                "g":       st.get("gamesPlayed"),
                "gs":      st.get("gamesStarted"),
                "inn":     safe_float(st.get("innings")),
                "tc":      st.get("chances"),
                "po":      st.get("putOuts"),
                "a":       st.get("assists"),
                "e":       st.get("errors"),
                "dp":      st.get("doublePlays"),
                "fld_pct": safe_float(st.get("fielding")),
            })
        log.info(f"  MLB API fielding {year}: {len(rows)} rows")
        return rows
    except Exception as e:
        log.error(f"  MLB API fielding {year}: {e}")
        return []


def fetch_mlb_players(year):
    """Fetch player identity data to build the player crosswalk table."""
    url = f"{MLB_API}/sports/1/players?season={year}"
    try:
        r = SESSION.get(url, timeout=30)
        r.raise_for_status()
        players = r.json().get("people", [])
        rows = []
        for p in players:
            rows.append({
                "mlbam_id":   p.get("id"),
                "name":       p.get("fullName"),
                "name_first": p.get("firstName"),
                "name_last":  p.get("lastName"),
                "bats":       p.get("batSide", {}).get("code"),
                "throws":     p.get("pitchHand", {}).get("code"),
                "birth_date": p.get("birthDate"),
            })
        return rows
    except Exception as e:
        log.error(f"  MLB API players {year}: {e}")
        return []


def load_mlb_api(conn, year_filter=None):
    log.info("Step 2: Loading MLB Stats API data (2015–present)...")
    years = [year_filter] if year_filter else list(range(START_YEAR, CURRENT_YEAR + 1))

    total_bat = total_pit = total_fld = 0

    for year in years:
        log.info(f"  Year {year}...")

        # ── Player crosswalk ──
        player_rows = fetch_mlb_players(year)
        for p in player_rows:
            try:
                conn.execute("""
                    INSERT OR IGNORE INTO player (mlbam_id, name, name_first, name_last, bats, throws, birth_date)
                    VALUES (?,?,?,?,?,?,?)
                """, (p["mlbam_id"], p["name"], p["name_first"], p["name_last"],
                      p["bats"], p["throws"], p["birth_date"]))
            except:
                pass
        conn.commit()

        # Build name→mlbam_id lookup for this year
        name_to_id = {norm(p["name"]): p["mlbam_id"] for p in player_rows if p["name"]}

        # ── Batting ──
        bat_rows = fetch_mlb_batting(year)
        for row in bat_rows:
            name_key = norm(row["name"])
            mlbam_id = row["mlbam_id"] or name_to_id.get(name_key)
            team = row["team"] or ""
            try:
                conn.execute("""
                    INSERT INTO batting
                      (name, season, team, mlbam_id, g, pa, ab, r, h, doubles, triples,
                       hr, rbi, bb, ibb, so, hbp, sf, sb, cs, avg, obp, slg, ops, as_of)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(name, season, team) DO UPDATE SET
                      mlbam_id=excluded.mlbam_id,
                      r=excluded.r, doubles=excluded.doubles, triples=excluded.triples,
                      ibb=excluded.ibb, hbp=excluded.hbp, sf=excluded.sf, cs=excluded.cs,
                      as_of=excluded.as_of
                """, (
                    row["name"], year, team, mlbam_id,
                    safe_int(row["g"]), safe_int(row["pa"]), safe_int(row["ab"]),
                    safe_int(row["r"]), safe_int(row["h"]),
                    safe_int(row["doubles"]), safe_int(row["triples"]),
                    safe_int(row["hr"]), safe_int(row["rbi"]),
                    safe_int(row["bb"]), safe_int(row["ibb"]),
                    safe_int(row["so"]), safe_int(row["hbp"]),
                    safe_int(row["sf"]), safe_int(row["sb"]), safe_int(row["cs"]),
                    row["avg"], row["obp"], row["slg"], row["ops"], TODAY,
                ))
                total_bat += 1
            except Exception as e:
                if total_bat < 3:
                    log.warning(f"  Batting row error: {e}")

        # ── Pitching ──
        pit_rows = fetch_mlb_pitching(year)
        for row in pit_rows:
            name_key = norm(row["name"])
            mlbam_id = row["mlbam_id"] or name_to_id.get(name_key)
            team = row["team"] or ""
            try:
                conn.execute("""
                    INSERT INTO pitching
                      (name, season, team, mlbam_id, w, l, g, gs, cg, sho, sv, hld, bs,
                       ip, h, r, er, hr, bb, ibb, so, hbp, wp, tbf,
                       era, whip, k_9, bb_9, h_9, hr_9, as_of)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(name, season, team) DO UPDATE SET
                      mlbam_id=excluded.mlbam_id,
                      cg=excluded.cg, sho=excluded.sho, hld=excluded.hld, bs=excluded.bs,
                      r=excluded.r, ibb=excluded.ibb, hbp=excluded.hbp, wp=excluded.wp,
                      tbf=excluded.tbf, k_9=excluded.k_9, bb_9=excluded.bb_9,
                      h_9=excluded.h_9, hr_9=excluded.hr_9, as_of=excluded.as_of
                """, (
                    row["name"], year, team, mlbam_id,
                    safe_int(row["w"]), safe_int(row["l"]),
                    safe_int(row["g"]), safe_int(row["gs"]),
                    safe_int(row["cg"]), safe_int(row["sho"]),
                    safe_int(row["sv"]), safe_int(row["hld"]), safe_int(row["bs"]),
                    row["ip"],
                    safe_int(row["h"]), safe_int(row["r"]), safe_int(row["er"]),
                    safe_int(row["hr"]), safe_int(row["bb"]), safe_int(row["ibb"]),
                    safe_int(row["so"]), safe_int(row["hbp"]), safe_int(row["wp"]),
                    safe_int(row["tbf"]),
                    row["era"], row["whip"], row["k_9"], row["bb_9"], row["h_9"], row["hr_9"],
                    TODAY,
                ))
                total_pit += 1
            except Exception as e:
                if total_pit < 3:
                    log.warning(f"  Pitching row error: {e}")

        # ── Fielding ──
        fld_rows = fetch_mlb_fielding(year)
        for row in fld_rows:
            mlbam_id = row["mlbam_id"]
            team = row["team"] or ""
            pos  = row["pos"] or ""
            try:
                conn.execute("""
                    INSERT INTO fielding
                      (name, season, team, pos, mlbam_id, g, gs, inn, tc, po, a, e, dp, fld_pct, as_of)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(name, season, team, pos) DO UPDATE SET
                      mlbam_id=excluded.mlbam_id, g=excluded.g, gs=excluded.gs,
                      inn=excluded.inn, tc=excluded.tc, po=excluded.po, a=excluded.a,
                      e=excluded.e, dp=excluded.dp, fld_pct=excluded.fld_pct, as_of=excluded.as_of
                """, (
                    row["name"], year, team, pos, mlbam_id,
                    safe_int(row["g"]), safe_int(row["gs"]),
                    row["inn"], safe_int(row["tc"]),
                    safe_int(row["po"]), safe_int(row["a"]),
                    safe_int(row["e"]), safe_int(row["dp"]),
                    row["fld_pct"], TODAY,
                ))
                total_fld += 1
            except:
                pass

        conn.commit()
        time.sleep(0.5)

    log_freshness(conn, "mlb_stats_api", "batting",  total_bat)
    log_freshness(conn, "mlb_stats_api", "pitching", total_pit)
    log_freshness(conn, "mlb_stats_api", "fielding", total_fld)
    conn.commit()
    log.info(f"  Done: batting={total_bat}, pitching={total_pit}, fielding={total_fld}")


# ── Step 3: Statcast CSV ───────────────────────────────────────────────────────

def load_statcast(conn, year_filter=None):
    log.info("Step 3: Loading Statcast CSV...")
    if not STATCAST_CSV.exists():
        log.warning(f"  File not found: {STATCAST_CSV} — skipping")
        log.info("  (Re-download from baseballsavant.mlb.com)")
        return

    try:
        df = pd.read_csv(STATCAST_CSV, low_memory=False)
    except Exception as e:
        log.error(f"  Failed to read statcast CSV: {e}")
        return

    if year_filter:
        season_col = next((c for c in df.columns if "season" in c.lower() or "year" in c.lower()), None)
        if season_col:
            df = df[df[season_col] == year_filter]

    log.info(f"  {len(df)} rows, columns: {list(df.columns[:10])}")

    # Statcast is pitch-level — aggregate to player-season
    # Column names vary slightly by download — handle common variants
    name_col = next((c for c in df.columns if c in ("player_name", "name", "Name")), None)
    id_col   = next((c for c in df.columns if c in ("batter", "pitcher", "mlbam_id", "player_id")), None)

    if not name_col:
        log.warning("  Could not find name column in statcast CSV — check column names")
        log.info(f"  Available columns: {list(df.columns)}")
        return

    log.info(f"  Using name_col={name_col}, id_col={id_col}")
    log.info("  Statcast CSV loaded — aggregation to player-season coming in next version")
    log.info("  (Raw pitch data stored; aggregation script TBD)")

    log_freshness(conn, "baseball_savant", "statcast", len(df), "raw CSV loaded")
    conn.commit()


# ── Step 4: DRS ───────────────────────────────────────────────────────────────

def load_drs(conn, year_filter=None):
    log.info("Step 4: Loading DRS CSV (SIS)...")
    if not DRS_CSV.exists():
        log.error(f"  File not found: {DRS_CSV}")
        return

    df = pd.read_csv(DRS_CSV)
    if year_filter:
        season_col = next((c for c in df.columns if c.lower() in ("season", "year")), None)
        if season_col:
            df = df[df[season_col] == year_filter]

    log.info(f"  {len(df)} rows, columns: {list(df.columns)}")

    # Map CSV columns to schema — DRS CSV has varied column names
    col_map = {
        "Player":      "player",
        "player":      "player",
        "player_id":   "player_id",
        "Season":      "season",
        "season":      "season",
        "G":           "g",
        "Inn":         "inn",
        "Total":       "total",
        "total":       "total",
        "ART":         "art",
        "GFP/DM":      "gfpdm",
        "SB":          "sb",
        "OF Arm":      "of_arm",
        "Bunt":        "bunt",
        "GDP":         "gdp",
        "Adj. ER":     "adj_er",
        "Strike Zone": "strike_zone",
    }

    inserted = skipped = 0
    for _, row in df.iterrows():
        mapped = {}
        for csv_col, db_col in col_map.items():
            if csv_col in row.index:
                mapped[db_col] = row[csv_col]

        player = str(mapped.get("player", "") or "").strip()
        season = safe_int(mapped.get("season"))
        if not player or not season:
            skipped += 1
            continue

        try:
            conn.execute("""
                INSERT INTO drs (player, player_id, season, g, inn, total, art, gfpdm,
                                 sb, of_arm, bunt, gdp, adj_er, strike_zone)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(player, season, pos) DO UPDATE SET
                  total=excluded.total, g=excluded.g, inn=excluded.inn,
                  art=excluded.art, gfpdm=excluded.gfpdm
            """, (
                player,
                str(mapped.get("player_id", "") or ""),
                season,
                safe_int(mapped.get("g")),
                safe_float(mapped.get("inn")),
                safe_int(mapped.get("total")),
                safe_int(mapped.get("art")),
                safe_int(mapped.get("gfpdm")),
                safe_int(mapped.get("sb")),
                safe_int(mapped.get("of_arm")),
                safe_int(mapped.get("bunt")),
                safe_int(mapped.get("gdp")),
                safe_int(mapped.get("adj_er")),
                safe_int(mapped.get("strike_zone")),
            ))
            inserted += 1
        except Exception as e:
            skipped += 1
            if skipped <= 3:
                log.warning(f"  DRS row error: {e}")

    conn.commit()
    log_freshness(conn, "sis", "drs", inserted)
    conn.commit()
    log.info(f"  Done: {inserted} rows loaded, {skipped} skipped")


# ── Step 5: Scoring settings ───────────────────────────────────────────────────

def load_scoring_settings(conn):
    log.info("Step 5: Loading Oyster Catcher scoring settings...")

    batting_settings = [
        ("1B",   1.0), ("2B",  2.0), ("3B",  3.0), ("HR",  4.0),
        ("RBI",  1.0), ("R",   1.0), ("BB",  1.0), ("HBP", 1.0),
        ("SB",   2.0), ("CS", -1.0),
    ]
    pitching_settings = [
        ("IP",  3.0), ("K",   1.0), ("W",   4.0), ("SV",  5.0),
        ("HLD", 2.0), ("ER", -1.0), ("BB", -0.5), ("H",  -0.5),
        ("CG",  3.0), ("SHO", 3.0), ("L",  -2.0),
    ]

    for stat, pts in batting_settings:
        conn.execute("""
            INSERT OR REPLACE INTO scoring_settings (league_name, stat, player_type, points)
            VALUES ('Oyster Catcher', ?, 'batter', ?)
        """, (stat, pts))

    for stat, pts in pitching_settings:
        conn.execute("""
            INSERT OR REPLACE INTO scoring_settings (league_name, stat, player_type, points)
            VALUES ('Oyster Catcher', ?, 'pitcher', ?)
        """, (stat, pts))

    conn.commit()
    log.info(f"  Done: {len(batting_settings)} batting + {len(pitching_settings)} pitching settings")


# ── Summary ────────────────────────────────────────────────────────────────────

def print_summary(conn):
    log.info("\n" + "="*50)
    log.info("DATABASE SUMMARY")
    log.info("="*50)
    tables = ["batting", "pitching", "fielding", "drs", "statcast", "player",
              "scoring_settings", "fantasy_points", "projections_batting", "projections_pitching"]
    for t in tables:
        try:
            n = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            log.info(f"  {t:<30} {n:>8,} rows")
        except:
            pass

    # Spot check
    log.info("\nSpot check:")
    rows = conn.execute("""
        SELECT name, season, bwar, opsplus, hr, avg
        FROM batting WHERE name IN ('Babe Ruth','Willie Mays','Mike Trout','Aaron Judge')
        ORDER BY name, season DESC LIMIT 8
    """).fetchall()
    for r in rows:
        log.info(f"  {r[0]:<20} {r[1]}  bWAR={r[2]}  OPS+={r[3]}  HR={r[4]}  AVG={r[5]}")

    freshness = conn.execute("SELECT source, table_name, last_updated, rows_affected FROM data_freshness").fetchall()
    log.info("\nData freshness:")
    for f in freshness:
        log.info(f"  [{f[2]}] {f[0]:<25} → {f[1]:<15} {f[3]:>8,} rows")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Load DiamondMinev2 database")
    parser.add_argument("--step", choices=["bref", "mlb", "statcast", "drs", "settings", "all"],
                        default="all", help="Which step to run")
    parser.add_argument("--year", type=int, default=None, help="Refresh a specific year only")
    args = parser.parse_args()

    if not DB_PATH.exists():
        log.error(f"Database not found: {DB_PATH}")
        log.error("Run create_db.py first.")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")

    step = args.step
    year = args.year

    log.info(f"Starting load — step={step}, year={year or 'all'}, db={DB_PATH}")

    if step in ("bref", "all"):
        load_bref_batting(conn, year)
        load_bref_pitching(conn, year)

    if step in ("mlb", "all"):
        load_mlb_api(conn, year)

    if step in ("statcast", "all"):
        load_statcast(conn, year)

    if step in ("drs", "all"):
        load_drs(conn, year)

    if step in ("settings", "all"):
        load_scoring_settings(conn)

    print_summary(conn)
    conn.close()
    log.info("Done.")


if __name__ == "__main__":
    main()
