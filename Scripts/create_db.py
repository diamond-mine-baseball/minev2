"""
DiamondMinev2 — Database Creation Script
=========================================
Creates a clean SQLite database with a lean, purposeful schema.

Data sources by era:
  1920–2026  Baseball Reference  →  standard stats, bWAR, OPS+, ERA+
  2015–2026  MLB Stats API       →  mlbam_id, cs, 2b, 3b, r, hbp, full pitching splits
  2015–2026  Baseball Savant     →  xwOBA, exit velocity, barrel%, sprint speed
  2003–2025  SIS                 →  DRS by position
  2026       Projections         →  Steamer/ZiPS batting + pitching

Column naming conventions:
  - snake_case throughout
  - NULL = not available for that era (not missing data)
  - bwar  = Baseball Reference WAR (consistent 1920–2026)
  - No fWAR — bWAR is the single WAR source

Usage:
  python3 create_db.py
  python3 create_db.py --path ~/Desktop/DiamondMinev2/diamondmine.db
"""

import sqlite3
import argparse
from pathlib import Path

def create(db_path: Path):
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")   # concurrent reads + writes
    conn.execute("PRAGMA foreign_keys=ON")

    # ── Player identity crosswalk ─────────────────────────────────────────────
    # Central table linking player names to IDs across all sources.
    # All other tables join through here via name+season for historical,
    # or mlbam_id for modern.
    conn.execute("""
    CREATE TABLE IF NOT EXISTS player (
        mlbam_id        INTEGER PRIMARY KEY,  -- MLB Stats API / Baseball Savant ID
        name            TEXT    NOT NULL,
        name_first      TEXT,
        name_last       TEXT,
        bref_id         TEXT,                 -- baseball-reference.com player slug
        idfg            TEXT,                 -- FanGraphs ID (kept for headshot paths)
        sis_player_id   TEXT,                 -- SIS ID for DRS linkage
        bats            TEXT,                 -- L / R / S
        throws          TEXT,                 -- L / R
        birth_date      TEXT,
        debut_year      INTEGER,
        headshot        TEXT                  -- filename only (not full path)
    )""")

    # ── Batting ───────────────────────────────────────────────────────────────
    # Base columns populated 1920–2026 from BRef.
    # modern_* columns populated 2015–2026 from MLB API / Savant.
    # NULL pre-2015 is correct and expected.
    conn.execute("""
    CREATE TABLE IF NOT EXISTS batting (
        -- Identity
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        season          INTEGER NOT NULL,
        team            TEXT,
        age             INTEGER,
        mlbam_id        INTEGER REFERENCES player(mlbam_id),

        -- Standard (BRef 1920–2026)
        g               INTEGER,
        pa              INTEGER,
        ab              INTEGER,
        h               INTEGER,
        hr              INTEGER,
        rbi             INTEGER,
        bb              INTEGER,
        so              INTEGER,
        sb              INTEGER,
        avg             REAL,
        obp             REAL,
        slg             REAL,
        ops             REAL,

        -- BRef advanced (1920–2026)
        bwar            REAL,
        opsplus         INTEGER,

        -- Standard extended (MLB API 2015–2026, NULL before)
        r               INTEGER,
        doubles         INTEGER,
        triples         INTEGER,
        cs              INTEGER,
        ibb             INTEGER,
        hbp             INTEGER,
        sf              INTEGER,

        -- Statcast (Baseball Savant 2015–2026, NULL before)
        xba             REAL,
        xslg            REAL,
        xwoba           REAL,
        xobp            REAL,
        ev              REAL,       -- avg exit velocity
        max_ev          REAL,
        la              REAL,       -- avg launch angle
        barrels         INTEGER,
        barrel_pct      REAL,
        hard_hit_pct    REAL,
        sprint_speed    REAL,
        k_pct           REAL,
        bb_pct          REAL,
        whiff_pct       REAL,
        chase_pct       REAL,

        -- Metadata
        as_of           TEXT,       -- date this row was last refreshed
        UNIQUE(name, season, team)
    )""")

    # ── Pitching ──────────────────────────────────────────────────────────────
    conn.execute("""
    CREATE TABLE IF NOT EXISTS pitching (
        -- Identity
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        season          INTEGER NOT NULL,
        team            TEXT,
        age             INTEGER,
        mlbam_id        INTEGER REFERENCES player(mlbam_id),

        -- Standard (BRef 1920–2026)
        w               INTEGER,
        l               INTEGER,
        g               INTEGER,
        gs              INTEGER,
        sv              INTEGER,
        ip              REAL,
        h               INTEGER,
        er              INTEGER,
        hr              INTEGER,
        bb              INTEGER,
        so              INTEGER,
        era             REAL,
        whip            REAL,

        -- BRef advanced (1920–2026)
        bwar            REAL,
        eraplus         INTEGER,

        -- Standard extended (MLB API 2015–2026, NULL before)
        cg              INTEGER,
        sho             INTEGER,
        hld             INTEGER,
        bs              INTEGER,
        r               INTEGER,
        ibb             INTEGER,
        hbp             INTEGER,
        wp              INTEGER,
        tbf             INTEGER,
        k_9             REAL,
        bb_9            REAL,
        h_9             REAL,
        hr_9            REAL,

        -- Advanced (MLB API 2015–2026, NULL before)
        fip             REAL,
        k_pct           REAL,
        bb_pct          REAL,

        -- Statcast (Baseball Savant 2015–2026, NULL before)
        xera            REAL,
        xfip            REAL,
        ev              REAL,
        hard_hit_pct    REAL,
        barrel_pct      REAL,
        whiff_pct       REAL,
        chase_pct       REAL,
        stuff_plus      REAL,

        -- Metadata
        as_of           TEXT,
        UNIQUE(name, season, team)
    )""")

    # ── Fielding ──────────────────────────────────────────────────────────────
    # MLB API provides reliable fielding 2015–2026.
    # Pre-2015 fielding is excluded — basic fielding% is in BRef but
    # not worth loading without DRS context.
    conn.execute("""
    CREATE TABLE IF NOT EXISTS fielding (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        season          INTEGER NOT NULL,
        team            TEXT,
        pos             TEXT    NOT NULL,
        mlbam_id        INTEGER REFERENCES player(mlbam_id),

        -- MLB API (2015–2026)
        g               INTEGER,
        gs              INTEGER,
        inn             REAL,
        tc              INTEGER,    -- total chances
        po              INTEGER,    -- putouts
        a               INTEGER,    -- assists
        e               INTEGER,    -- errors
        dp              INTEGER,    -- double plays
        fld_pct         REAL,

        as_of           TEXT,
        UNIQUE(name, season, team, pos)
    )""")

    # ── DRS (Defensive Runs Saved) ────────────────────────────────────────────
    # Source: Sports Info Solutions via drs_by_season_final.csv
    # Available 2003–2025 across all positions
    conn.execute("""
    CREATE TABLE IF NOT EXISTS drs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        player          TEXT    NOT NULL,
        player_id       TEXT,       -- SIS player ID
        season          INTEGER NOT NULL,
        pos             TEXT,       -- primary position for this row
        g               INTEGER,
        inn             REAL,
        total           INTEGER,    -- total DRS

        -- DRS components
        art             INTEGER,    -- arm runs
        gfpdm           INTEGER,    -- good fielding plays / defensive misplays
        sb              INTEGER,    -- stolen base runs (catchers)
        of_arm          INTEGER,    -- outfield arm runs
        bunt            INTEGER,
        gdp             INTEGER,
        adj_er          INTEGER,    -- adjusted earned runs (catchers)
        strike_zone     INTEGER,    -- strike zone runs (catchers)

        UNIQUE(player, season, pos)
    )""")

    # ── Statcast aggregated (player-season level) ─────────────────────────────
    # Aggregated from Baseball Savant pitch-by-pitch.
    # Separate from batting/pitching for clean separation of concerns.
    conn.execute("""
    CREATE TABLE IF NOT EXISTS statcast (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT,
        mlbam_id        INTEGER REFERENCES player(mlbam_id),
        season          INTEGER NOT NULL,
        player_type     TEXT    NOT NULL CHECK(player_type IN ('batter','pitcher')),

        -- Plate discipline
        k_pct           REAL,
        bb_pct          REAL,
        whiff_pct       REAL,
        chase_pct       REAL,
        csw_pct         REAL,       -- called strike + whiff

        -- Batted ball
        ev              REAL,
        max_ev          REAL,
        la              REAL,
        barrels         INTEGER,
        barrel_pct      REAL,
        hard_hit_pct    REAL,
        gb_pct          REAL,
        fb_pct          REAL,
        ld_pct          REAL,

        -- Expected stats
        xba             REAL,
        xslg            REAL,
        xwoba           REAL,
        xobp            REAL,
        xera            REAL,       -- pitchers only

        -- Sprint speed (batters)
        sprint_speed    REAL,

        as_of           TEXT,
        UNIQUE(mlbam_id, season, player_type)
    )""")

    # ── Fantasy scoring settings ───────────────────────────────────────────────
    conn.execute("""
    CREATE TABLE IF NOT EXISTS scoring_settings (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        league_name     TEXT    NOT NULL DEFAULT 'Oyster Catcher',
        stat            TEXT    NOT NULL,
        player_type     TEXT    NOT NULL CHECK(player_type IN ('batter','pitcher')),
        points          REAL    NOT NULL,
        UNIQUE(league_name, stat, player_type)
    )""")

    # ── Fantasy points (calculated) ────────────────────────────────────────────
    conn.execute("""
    CREATE TABLE IF NOT EXISTS fantasy_points (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        mlbam_id        INTEGER REFERENCES player(mlbam_id),
        season          INTEGER NOT NULL,
        player_type     TEXT    NOT NULL CHECK(player_type IN ('batter','pitcher')),
        league_name     TEXT    NOT NULL DEFAULT 'Oyster Catcher',
        total_points    REAL,
        points_per_game REAL,
        as_of           TEXT,
        UNIQUE(name, season, player_type, league_name)
    )""")

    # ── Projections ────────────────────────────────────────────────────────────
    conn.execute("""
    CREATE TABLE IF NOT EXISTS projections_batting (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        mlbam_id        INTEGER REFERENCES player(mlbam_id),
        season          INTEGER NOT NULL,
        source          TEXT    NOT NULL DEFAULT 'Steamer',  -- Steamer / ZiPS / ATC
        team            TEXT,
        pos             TEXT,
        is_dh           INTEGER DEFAULT 0,

        -- Projected stats
        g               INTEGER,
        pa              INTEGER,
        hr              INTEGER,
        rbi             INTEGER,
        r               INTEGER,
        sb              INTEGER,
        avg             REAL,
        obp             REAL,
        slg             REAL,
        ops             REAL,
        woba            REAL,
        xwoba           REAL,
        bwar            REAL,

        as_of           TEXT,
        UNIQUE(name, season, source)
    )""")

    conn.execute("""
    CREATE TABLE IF NOT EXISTS projections_pitching (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT    NOT NULL,
        mlbam_id        INTEGER REFERENCES player(mlbam_id),
        season          INTEGER NOT NULL,
        source          TEXT    NOT NULL DEFAULT 'Steamer',
        team            TEXT,
        role            TEXT    CHECK(role IN ('SP','RP','CL')),

        -- Projected stats
        w               INTEGER,
        sv              INTEGER,
        hld             INTEGER,
        ip              REAL,
        era             REAL,
        whip            REAL,
        k_9             REAL,
        bb_9            REAL,
        fip             REAL,
        bwar            REAL,

        as_of           TEXT,
        UNIQUE(name, season, source)
    )""")

    # ── Data freshness tracker ─────────────────────────────────────────────────
    conn.execute("""
    CREATE TABLE IF NOT EXISTS data_freshness (
        source          TEXT    NOT NULL,
        table_name      TEXT    NOT NULL,
        last_updated    TEXT    NOT NULL,
        rows_affected   INTEGER,
        notes           TEXT,
        PRIMARY KEY (source, table_name)
    )""")

    # ── Indexes ────────────────────────────────────────────────────────────────
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_batting_name_season  ON batting(name, season)",
        "CREATE INDEX IF NOT EXISTS idx_batting_season        ON batting(season)",
        "CREATE INDEX IF NOT EXISTS idx_batting_mlbam         ON batting(mlbam_id)",
        "CREATE INDEX IF NOT EXISTS idx_batting_bwar          ON batting(bwar)",
        "CREATE INDEX IF NOT EXISTS idx_pitching_name_season ON pitching(name, season)",
        "CREATE INDEX IF NOT EXISTS idx_pitching_season       ON pitching(season)",
        "CREATE INDEX IF NOT EXISTS idx_pitching_mlbam        ON pitching(mlbam_id)",
        "CREATE INDEX IF NOT EXISTS idx_pitching_bwar         ON pitching(bwar)",
        "CREATE INDEX IF NOT EXISTS idx_fielding_name_season ON fielding(name, season)",
        "CREATE INDEX IF NOT EXISTS idx_fielding_pos          ON fielding(pos)",
        "CREATE INDEX IF NOT EXISTS idx_drs_player_season    ON drs(player, season)",
        "CREATE INDEX IF NOT EXISTS idx_drs_season_total     ON drs(season, total)",
        "CREATE INDEX IF NOT EXISTS idx_statcast_mlbam_season ON statcast(mlbam_id, season)",
    ]
    for idx in indexes:
        conn.execute(idx)

    conn.commit()

    # ── Summary ────────────────────────────────────────────────────────────────
    tables = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    print(f"\nCreated: {db_path}")
    print(f"\nTables ({len(tables)}):")
    for (t,) in tables:
        cols = conn.execute(f"PRAGMA table_info({t})").fetchall()
        print(f"  {t:<30} {len(cols)} columns")

    print(f"\nIndexes: {len(indexes)} created")
    print("\nReady to load data.")
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", default="~/Desktop/DiamondMinev2/diamondmine.db")
    args = parser.parse_args()
    create(Path(args.path).expanduser())
