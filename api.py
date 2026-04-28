"""
DiamondMinev2 — FastAPI Backend
================================
Run:
    uvicorn api:app --reload --port 5001

Docs auto-generated at:
    http://localhost:5001/docs

Requirements:
    pip3 install fastapi uvicorn requests
"""

import sqlite3
import requests
import re
import unicodedata
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

# ── Config ─────────────────────────────────────────────────────────────────────
import os as _os

_IS_PROD     = _os.getenv("RAILWAY_ENVIRONMENT") is not None or _os.getenv("DB_PATH") is not None
DB_PATH      = Path(_os.getenv("DB_PATH", "/data/diamondmine.db")) if _IS_PROD else Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"
HEADSHOT_DIR = Path(_os.getenv("HEADSHOT_DIR", "/data/headshots")) if _IS_PROD else Path.home() / "Desktop" / "DiamondMinev2" / "data" / "Headshots"
CURRENT_YEAR = datetime.now().year
MLB_API      = "https://statsapi.mlb.com/api/v1"

app = FastAPI(
    title="DiamondMine API",
    description="Baseball analytics API — DiamondMinev2",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DB ─────────────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def rows_to_list(rows):
    return [dict(r) for r in rows]

def mlb_get(path, params=None):
    try:
        r = requests.get(f"{MLB_API}{path}", params=params, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"MLB API error: {e}")

# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    try:
        conn = get_db()
        counts = {t: conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
                  for t in ["batting", "pitching", "fielding", "drs", "player"]}
        freshness = rows_to_list(conn.execute(
            "SELECT source, table_name, last_updated, rows_affected FROM data_freshness"
        ).fetchall())
        conn.close()
        return {"status": "ok", "counts": counts, "freshness": freshness}
    except Exception as e:
        return {"status": "no_db", "error": str(e)}

# ── Player search ──────────────────────────────────────────────────────────────

@app.get("/player/search")
def search_players(q: str = Query(..., min_length=2)):
    conn = get_db()
    try:
        batters = conn.execute("""
            SELECT DISTINCT b.name, b.mlbam_id, MAX(b.season) last_season,
                   COALESCE(p1.headshot, p2.headshot) headshot
            FROM batting b
            LEFT JOIN player p1 ON b.mlbam_id = p1.mlbam_id AND b.mlbam_id IS NOT NULL
            LEFT JOIN player p2 ON LOWER(b.name) = LOWER(p2.name) AND b.mlbam_id IS NULL
            WHERE LOWER(b.name) LIKE LOWER(?)
            GROUP BY b.name ORDER BY last_season DESC LIMIT 10
        """, (f"%{q}%",)).fetchall()

        pitchers = conn.execute("""
            SELECT DISTINCT pt.name, pt.mlbam_id, MAX(pt.season) last_season,
                   COALESCE(p1.headshot, p2.headshot) headshot
            FROM pitching pt
            LEFT JOIN player p1 ON pt.mlbam_id = p1.mlbam_id AND pt.mlbam_id IS NOT NULL
            LEFT JOIN player p2 ON LOWER(pt.name) = LOWER(p2.name) AND pt.mlbam_id IS NULL
            WHERE LOWER(pt.name) LIKE LOWER(?)
              AND pt.name NOT IN (SELECT DISTINCT name FROM batting WHERE LOWER(name) LIKE LOWER(?))
            GROUP BY pt.name ORDER BY last_season DESC LIMIT 5
        """, (f"%{q}%", f"%{q}%")).fetchall()

        return {"results": rows_to_list(batters) + rows_to_list(pitchers)}
    finally:
        conn.close()

# ── Career stats ───────────────────────────────────────────────────────────────

@app.get("/player/career/batting")
def career_batting(name: str = Query(...)):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT b.season, b.team, b.age, b.g, b.pa, b.ab, b.h, b.hr, b.rbi,
                   b.bb, b.so, b.sb, b.avg, b.obp, b.slg, b.ops,
                   b.bwar, b.opsplus, b.xwoba, b.ev, b.hard_hit_pct,
                   b.k_pct,
                   CASE WHEN b.bb_pct IS NOT NULL THEN b.bb_pct
                        WHEN b.pa > 0 THEN ROUND(CAST(b.bb AS REAL)/b.pa*100, 1)
                        ELSE NULL END bb_pct,
                   CASE WHEN b.k_pct IS NOT NULL THEN b.k_pct
                        WHEN b.pa > 0 THEN ROUND(CAST(b.so AS REAL)/b.pa*100, 1)
                        ELSE NULL END k_pct_calc,
                   b.doubles, b.triples, b.r, b.hbp,
                   b.mlbam_id, p.headshot
            FROM batting b
            LEFT JOIN player p ON (b.mlbam_id IS NOT NULL AND b.mlbam_id = p.mlbam_id)
                          OR (b.mlbam_id IS NULL AND LOWER(p.name) = LOWER(b.name))
            WHERE LOWER(b.name) = LOWER(?)
            ORDER BY b.season
        """, (name,)).fetchall()

        if not rows:
            rows = conn.execute("""
                SELECT b.season, b.team, b.age, b.g, b.pa, b.ab, b.h, b.hr, b.rbi,
                       b.bb, b.so, b.sb, b.avg, b.obp, b.slg, b.ops,
                       b.bwar, b.opsplus, b.xwoba, b.ev, b.hard_hit_pct,
                       b.k_pct, b.bb_pct, b.doubles, b.triples, b.r, b.hbp,
                       b.mlbam_id, p.headshot
                FROM batting b
                LEFT JOIN player p ON (b.mlbam_id IS NOT NULL AND b.mlbam_id = p.mlbam_id)
                          OR (b.mlbam_id IS NULL AND LOWER(p.name) = LOWER(b.name))
                WHERE LOWER(b.name) LIKE LOWER(?)
                ORDER BY b.season LIMIT 200
            """, (f"%{name}%",)).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail=f"Player not found: {name}")

        seasons = rows_to_list(rows)
        ab = sum(r["ab"] or 0 for r in seasons)
        h  = sum(r["h"]  or 0 for r in seasons)
        totals = {
            "g": sum(r["g"] or 0 for r in seasons),
            "pa": sum(r["pa"] or 0 for r in seasons),
            "ab": ab, "h": h,
            "hr": sum(r["hr"] or 0 for r in seasons),
            "rbi": sum(r["rbi"] or 0 for r in seasons),
            "bb": sum(r["bb"] or 0 for r in seasons),
            "so": sum(r["so"] or 0 for r in seasons),
            "sb": sum(r["sb"] or 0 for r in seasons),
            "bwar": round(sum(r["bwar"] or 0 for r in seasons), 1),
            "avg": round(h / ab, 3) if ab else None,
        }
        return {"name": name, "headshot": seasons[0]["headshot"] if seasons else None,
                "seasons": seasons, "totals": totals}
    finally:
        conn.close()


@app.get("/player/career/pitching")
def career_pitching(name: str = Query(...)):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT p.season, p.team, p.age, p.w, p.l, p.g, p.gs, p.sv, p.hld,
                   p.ip, p.h, p.er, p.hr, p.bb, p.so, p.era, p.whip,
                   p.bwar, p.eraplus, p.fip,
                   CASE WHEN p.ip > 0 THEN ROUND(CAST(p.so AS REAL)/p.ip*9, 2) ELSE NULL END k_9,
                   CASE WHEN p.ip > 0 THEN ROUND(CAST(p.bb AS REAL)/p.ip*9, 2) ELSE NULL END bb_9,
                   p.k_pct, p.bb_pct,
                   p.xera, p.mlbam_id, pl.headshot
            FROM pitching p
            LEFT JOIN player pl ON (p.mlbam_id IS NOT NULL AND p.mlbam_id = pl.mlbam_id)
                           OR (p.mlbam_id IS NULL AND LOWER(pl.name) = LOWER(p.name))
            WHERE LOWER(p.name) = LOWER(?)
            ORDER BY p.season
        """, (name,)).fetchall()

        if not rows:
            rows = conn.execute("""
                SELECT p.season, p.team, p.age, p.w, p.l, p.g, p.gs, p.sv, p.hld,
                       p.ip, p.h, p.er, p.hr, p.bb, p.so, p.era, p.whip,
                       p.bwar, p.eraplus, p.fip,
                       CASE WHEN p.ip > 0 THEN ROUND(CAST(p.so AS REAL)/p.ip*9, 2) ELSE NULL END k_9,
                       CASE WHEN p.ip > 0 THEN ROUND(CAST(p.bb AS REAL)/p.ip*9, 2) ELSE NULL END bb_9,
                       p.k_pct, p.bb_pct,
                       p.xera, p.mlbam_id, pl.headshot
                FROM pitching p
                LEFT JOIN player pl ON (p.mlbam_id IS NOT NULL AND p.mlbam_id = pl.mlbam_id)
                           OR (p.mlbam_id IS NULL AND LOWER(pl.name) = LOWER(p.name))
                WHERE LOWER(p.name) LIKE LOWER(?)
                ORDER BY p.season LIMIT 200
            """, (f"%{name}%",)).fetchall()

        if not rows:
            raise HTTPException(status_code=404, detail=f"Player not found: {name}")

        seasons = rows_to_list(rows)
        ip = sum(r["ip"] or 0 for r in seasons)
        er = sum(r["er"] or 0 for r in seasons)
        totals = {
            "w": sum(r["w"] or 0 for r in seasons),
            "l": sum(r["l"] or 0 for r in seasons),
            "sv": sum(r["sv"] or 0 for r in seasons),
            "g": sum(r["g"] or 0 for r in seasons),
            "gs": sum(r["gs"] or 0 for r in seasons),
            "so": sum(r["so"] or 0 for r in seasons),
            "bb": sum(r["bb"] or 0 for r in seasons),
            "ip": round(ip, 1),
            "bwar": round(sum(r["bwar"] or 0 for r in seasons), 1),
            "era": round((er * 9) / ip, 2) if ip else None,
        }
        return {"name": name, "headshot": seasons[0]["headshot"] if seasons else None,
                "seasons": seasons, "totals": totals}
    finally:
        conn.close()

# ── Leaderboards ───────────────────────────────────────────────────────────────

BATTING_COLS = {
    "bwar", "opsplus", "hr", "rbi", "avg", "obp", "slg", "ops",
    "sb", "bb", "so", "h", "pa", "xwoba", "ev", "hard_hit_pct",
    "barrel_pct", "k_pct", "bb_pct", "doubles", "triples", "r", "g",
}
PITCHING_COLS = {
    "bwar", "eraplus", "era", "so", "ip", "whip", "fip",
    "k_9", "bb_9", "k_pct", "bb_pct", "w", "sv", "hld",
    "xera", "hard_hit_pct", "barrel_pct", "g",
}

@app.get("/leaderboard/batting")
def leaderboard_batting(
    season: int = Query(default=CURRENT_YEAR),
    stat:   str = Query(default="bwar"),
    min_pa: int = Query(default=100),
    limit:  int = Query(default=50, le=200),
    team:   Optional[str] = None,
):
    if stat not in BATTING_COLS:
        raise HTTPException(status_code=400, detail=f"Invalid stat. Choose: {sorted(BATTING_COLS)}")
    conn = get_db()
    try:
        team_clause = f"AND b.team = '{team}'" if team else ""
        rows = conn.execute(f"""
            SELECT b.name, b.season, b.team, b.age, b.g, b.pa, b.h, b.hr, b.rbi,
                   b.bb, b.so, b.sb, b.avg, b.obp, b.slg, b.ops,
                   b.bwar, b.opsplus, b.xwoba, b.ev, b.hard_hit_pct, b.barrel_pct,
                   b.doubles, b.triples, b.r,
                   CASE WHEN b.k_pct IS NOT NULL THEN b.k_pct
                        WHEN b.pa > 0 THEN ROUND(CAST(b.so AS REAL)/b.pa*100,1)
                        ELSE NULL END k_pct,
                   CASE WHEN b.bb_pct IS NOT NULL THEN b.bb_pct
                        WHEN b.pa > 0 THEN ROUND(CAST(b.bb AS REAL)/b.pa*100,1)
                        ELSE NULL END bb_pct,
                   COALESCE(p1.headshot, p2.headshot) headshot
            FROM batting b
            LEFT JOIN player p1 ON b.mlbam_id = p1.mlbam_id AND b.mlbam_id IS NOT NULL
            LEFT JOIN player p2 ON LOWER(b.name) = LOWER(p2.name) AND b.mlbam_id IS NULL
            WHERE b.season = ? AND (b.pa >= ? OR b.pa IS NULL) {team_clause}
            ORDER BY b.{stat} DESC NULLS LAST
            LIMIT ?
        """, (season, min_pa, limit)).fetchall()
        return {"season": season, "stat": stat, "results": rows_to_list(rows)}
    finally:
        conn.close()


@app.get("/leaderboard/pitching")
def leaderboard_pitching(
    season: int   = Query(default=CURRENT_YEAR),
    stat:   str   = Query(default="bwar"),
    min_ip: float = Query(default=20.0),
    role:   Optional[str] = None,
    limit:  int   = Query(default=50, le=200),
):
    if stat not in PITCHING_COLS:
        raise HTTPException(status_code=400, detail=f"Invalid stat. Choose: {sorted(PITCHING_COLS)}")
    conn = get_db()
    try:
        role_clause = ""
        if role == "SP": role_clause = "AND p.gs >= p.g * 0.5"
        elif role == "RP": role_clause = "AND p.gs < p.g * 0.5"
        order = "ASC" if stat in ("era", "whip", "fip", "xera", "bb_9") else "DESC"
        rows = conn.execute(f"""
            SELECT p.name, p.season, p.team, p.age, p.w, p.l, p.g, p.gs,
                   p.sv, p.hld, p.ip, p.so, p.bb, p.era, p.whip,
                   p.bwar, p.eraplus, p.fip, p.k_9, p.bb_9,
                   pl.headshot
            FROM pitching p
            LEFT JOIN player pl ON (p.mlbam_id IS NOT NULL AND p.mlbam_id = pl.mlbam_id)
                           OR (p.mlbam_id IS NULL AND LOWER(pl.name) = LOWER(p.name))
            WHERE p.season = ? AND (p.ip >= ? OR p.ip IS NULL) {role_clause}
            ORDER BY p.{stat} {order} NULLS LAST
            LIMIT ?
        """, (season, min_ip, limit)).fetchall()
        return {"season": season, "stat": stat, "role": role, "results": rows_to_list(rows)}
    finally:
        conn.close()

# ── DRS ────────────────────────────────────────────────────────────────────────

@app.get("/drs/leaderboard")
def drs_leaderboard(
    season: int = Query(default=CURRENT_YEAR - 1),
    pos:    Optional[str] = None,
    limit:  int = Query(default=50, le=200),
    min_g:  int = Query(default=30),
):
    conn = get_db()
    try:
        pos_clause = f"AND UPPER(d.pos) = UPPER('{pos}')" if pos else ""
        rows = conn.execute(f"""
            SELECT d.player, d.season, d.pos, d.g, d.inn, d.total,
                   d.art, d.gfpdm, d.of_arm, p.headshot
            FROM drs d
            LEFT JOIN player p ON LOWER(p.name) = LOWER(d.player)
            WHERE d.season = ? AND (d.g >= ? OR d.g IS NULL) {pos_clause}
            ORDER BY d.total DESC NULLS LAST
            LIMIT ?
        """, (season, min_g, limit)).fetchall()
        return {"season": season, "pos": pos, "results": rows_to_list(rows)}
    finally:
        conn.close()


@app.get("/drs/player")
def drs_player(name: str = Query(...)):
    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT player, season, pos, g, inn, total, art, gfpdm, of_arm, sb, bunt, gdp
            FROM drs WHERE LOWER(player) LIKE LOWER(?)
            ORDER BY season DESC
        """, (f"%{name}%",)).fetchall()
        if not rows:
            raise HTTPException(status_code=404, detail=f"No DRS data for: {name}")
        return {"name": name, "seasons": rows_to_list(rows)}
    finally:
        conn.close()

# ── Compare ────────────────────────────────────────────────────────────────────

@app.get("/compare")
def compare(
    names:  str = Query(..., description="Comma-separated names"),
    season: Optional[int] = None,
    type:   str = Query(default="batting"),
):
    player_list = [n.strip() for n in names.split(",") if n.strip()]
    if not 2 <= len(player_list) <= 6:
        raise HTTPException(status_code=400, detail="Need 2-6 player names")

    conn = get_db()
    results = []
    try:
        for name in player_list:
            if type == "batting":
                if season:
                    row = conn.execute("""
                        SELECT b.*, p.headshot FROM batting b
                        LEFT JOIN player p ON b.mlbam_id = p.mlbam_id
                        WHERE LOWER(b.name) = LOWER(?) AND b.season=?
                        ORDER BY b.pa DESC NULLS LAST LIMIT 1
                    """, (name, season)).fetchone()
                else:
                    r = conn.execute("""
                        SELECT b.name,
                            SUM(b.g) g, SUM(b.pa) pa, SUM(b.ab) ab,
                            SUM(b.h) h, SUM(b.hr) hr, SUM(b.rbi) rbi,
                            SUM(b.bb) bb, SUM(b.so) so, SUM(b.sb) sb,
                            SUM(b.r) r, SUM(b.doubles) doubles,
                            SUM(COALESCE(b.hbp,0)) hbp, SUM(COALESCE(b.sf,0)) sf,
                            ROUND(SUM(b.bwar),1) bwar,
                            ROUND(CAST(SUM(b.h) AS REAL)/NULLIF(SUM(b.ab),0),3) avg,
                            ROUND(CAST(SUM(b.h)+SUM(COALESCE(b.bb,0))+SUM(COALESCE(b.hbp,0)) AS REAL)/
                                NULLIF(SUM(b.ab)+SUM(COALESCE(b.bb,0))+SUM(COALESCE(b.hbp,0))+SUM(COALESCE(b.sf,0)),0),3) obp,
                            ROUND(CAST((SUM(b.h)-SUM(COALESCE(b.doubles,0))-SUM(COALESCE(b.triples,0))-SUM(b.hr))
                                +2*SUM(COALESCE(b.doubles,0))+3*SUM(COALESCE(b.triples,0))+4*SUM(b.hr)
                                AS REAL)/NULLIF(SUM(b.ab),0),3) slg,
                            ROUND(SUM(COALESCE(b.opsplus,100)*COALESCE(b.pa,0))/
                                NULLIF(SUM(CASE WHEN b.opsplus IS NOT NULL THEN COALESCE(b.pa,0) ELSE 0 END),0)) opsplus,
                            b.mlbam_id, p.headshot
                        FROM batting b
                        LEFT JOIN player p ON (b.mlbam_id IS NOT NULL AND b.mlbam_id = p.mlbam_id)
                                      OR (b.mlbam_id IS NULL AND LOWER(p.name) = LOWER(b.name))
                        WHERE LOWER(b.name) = LOWER(?) GROUP BY b.name
                    """, (name,)).fetchone()
                    row = dict(r) if r else None
                    if row:
                        row['ops'] = round((row.get('obp') or 0) + (row.get('slg') or 0), 3) or None
                        pa = row.get('pa') or 0
                        bb = row.get('bb') or 0
                        so = row.get('so') or 0
                        if pa > 0:
                            row['bb_pct'] = round(bb / pa * 100, 1)
                            row['k_pct']  = round(so / pa * 100, 1)
            else:
                if season:
                    row = conn.execute("""
                        SELECT p.*, pl.headshot FROM pitching p
                        LEFT JOIN player pl ON p.mlbam_id = pl.mlbam_id
                        WHERE LOWER(p.name) = LOWER(?) AND p.season=?
                        ORDER BY p.ip DESC NULLS LAST LIMIT 1
                    """, (name, season)).fetchone()
                else:
                    row = conn.execute("""
                        SELECT p.name, SUM(p.w) w, SUM(p.sv) sv, SUM(p.g) g,
                               SUM(p.gs) gs, SUM(p.so) so, SUM(p.bb) bb,
                               SUM(p.er) er, SUM(p.h) h,
                               ROUND(SUM(p.ip),1) ip,
                               ROUND(SUM(p.bwar),1) bwar,
                               ROUND(SUM(p.er)*9.0/NULLIF(SUM(p.ip),0), 2) era,
                               ROUND(
                                 SUM(COALESCE(p.eraplus,100)*COALESCE(p.ip,0)) /
                                 NULLIF(SUM(CASE WHEN p.eraplus IS NOT NULL THEN COALESCE(p.ip,0) ELSE 0 END),0)
                               ) eraplus,
                               ROUND((SUM(p.h)+SUM(p.bb))*1.0/NULLIF(SUM(p.ip),0), 3) whip,
                               CASE WHEN SUM(p.ip) > 0 THEN ROUND(SUM(p.so)*9.0/SUM(p.ip),2) ELSE NULL END k_9,
                               CASE WHEN SUM(p.ip) > 0 THEN ROUND(SUM(p.bb)*9.0/SUM(p.ip),2) ELSE NULL END bb_9,
                               p.mlbam_id, pl.headshot
                        FROM pitching p
                        LEFT JOIN player pl ON (p.mlbam_id IS NOT NULL AND p.mlbam_id = pl.mlbam_id)
                                       OR (p.mlbam_id IS NULL AND LOWER(pl.name) = LOWER(p.name))
                        WHERE LOWER(p.name) = LOWER(?) GROUP BY p.name
                    """, (name,)).fetchone()

            results.append(dict(row) if row else {"name": name, "error": "not found"})

        return {"type": type, "season": season, "players": results}
    finally:
        conn.close()

# ── Fantasy ────────────────────────────────────────────────────────────────────

@app.get("/fantasy/settings")
def fantasy_settings(league: str = Query(default="Oyster Catcher")):
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT stat, player_type, points FROM scoring_settings WHERE league_name=?",
            (league,)
        ).fetchall()
        return {"league": league, "settings": rows_to_list(rows)}
    finally:
        conn.close()


@app.get("/fantasy/leaderboard")
def fantasy_leaderboard(
    season: int = Query(default=CURRENT_YEAR),
    type:   str = Query(default="batter"),
    limit:  int = Query(default=50, le=200),
    league: str = Query(default="Oyster Catcher"),
):
    conn = get_db()
    try:
        settings = {r["stat"]: r["points"] for r in conn.execute(
            "SELECT stat, points FROM scoring_settings WHERE league_name=? AND player_type=?",
            (league, type)
        ).fetchall()}

        if not settings:
            raise HTTPException(status_code=404, detail=f"No settings for {league}")

        if type == "batter":
            rows = conn.execute("""
                SELECT b.name, b.season, b.team, b.g, b.pa, b.h, b.hr, b.rbi,
                       b.r, b.bb, b.hbp, b.sb, b.cs, b.doubles, b.triples,
                       b.avg, b.ops, b.bwar, p.headshot
                FROM batting b
                LEFT JOIN player p ON b.mlbam_id = p.mlbam_id
                WHERE b.season=? AND b.pa >= 50
            """, (season,)).fetchall()

            results = []
            for row in rows:
                r = dict(row)
                h   = r.get("h") or 0
                dbl = r.get("doubles") or 0
                trp = r.get("triples") or 0
                hr  = r.get("hr") or 0
                pts = ((h - dbl - trp - hr) * settings.get("1B", 0) +
                       dbl  * settings.get("2B",  0) +
                       trp  * settings.get("3B",  0) +
                       hr   * settings.get("HR",  0) +
                       (r.get("rbi") or 0) * settings.get("RBI", 0) +
                       (r.get("r")   or 0) * settings.get("R",   0) +
                       (r.get("bb")  or 0) * settings.get("BB",  0) +
                       (r.get("hbp") or 0) * settings.get("HBP", 0) +
                       (r.get("sb")  or 0) * settings.get("SB",  0) +
                       (r.get("cs")  or 0) * settings.get("CS",  0))
                r["fantasy_points"] = round(pts, 1)
                r["pts_per_game"]   = round(pts / r["g"], 2) if r.get("g") else 0
                results.append(r)
        else:
            rows = conn.execute("""
                SELECT p.name, p.season, p.team, p.g, p.gs, p.ip,
                       p.w, p.l, p.sv, p.hld, p.so, p.bb, p.er,
                       p.h, p.cg, p.sho, p.era, p.whip, p.bwar, pl.headshot
                FROM pitching p
                LEFT JOIN player pl ON p.mlbam_id = pl.mlbam_id
                WHERE p.season=? AND p.ip >= 5
            """, (season,)).fetchall()

            results = []
            for row in rows:
                r = dict(row)
                pts = ((r.get("ip")  or 0) * settings.get("IP",  0) +
                       (r.get("so")  or 0) * settings.get("K",   0) +
                       (r.get("w")   or 0) * settings.get("W",   0) +
                       (r.get("l")   or 0) * settings.get("L",   0) +
                       (r.get("sv")  or 0) * settings.get("SV",  0) +
                       (r.get("hld") or 0) * settings.get("HLD", 0) +
                       (r.get("er")  or 0) * settings.get("ER",  0) +
                       (r.get("bb")  or 0) * settings.get("BB",  0) +
                       (r.get("h")   or 0) * settings.get("H",   0) +
                       (r.get("cg")  or 0) * settings.get("CG",  0) +
                       (r.get("sho") or 0) * settings.get("SHO", 0))
                r["fantasy_points"] = round(pts, 1)
                r["pts_per_game"]   = round(pts / r["g"], 2) if r.get("g") else 0
                results.append(r)

        results.sort(key=lambda x: x["fantasy_points"], reverse=True)
        return {"season": season, "type": type, "league": league, "results": results[:limit]}
    finally:
        conn.close()

# ── MLB Stats API proxy ────────────────────────────────────────────────────────

@app.get("/scoreboard")
def scoreboard(date: Optional[str] = None):
    params = {"sportId": 1, "hydrate": "linescore,team"}
    if date:
        params["date"] = date
    data   = mlb_get("/schedule", params)
    dates  = data.get("dates", [])
    games  = dates[0].get("games", []) if dates else []
    return {"date": date or datetime.now().strftime("%Y-%m-%d"), "games": games}


@app.get("/standings")
def standings(season: int = Query(default=CURRENT_YEAR)):
    data = mlb_get("/standings", {
        "leagueId": "103,104", "season": season,
        "standingsTypes": "regularSeason", "hydrate": "team",
    })
    return {"season": season, "records": data.get("records", [])}


@app.get("/stats/leaders")
def stat_leaders(
    stat:   str = Query(default="homeRuns"),
    season: int = Query(default=CURRENT_YEAR),
    limit:  int = Query(default=10, le=25),
):
    data = mlb_get("/stats/leaders", {
        "leaderCategories": stat, "season": season, "sportId": 1, "limit": limit,
    })
    return {"season": season, "stat": stat, "leaders": data.get("leagueLeaders", [])}

# ── Headshot ───────────────────────────────────────────────────────────────────

@app.get("/headshot")
def headshot(
    mlbam_id: Optional[int] = None,
    name:     Optional[str] = None,
    path:     Optional[str] = None,
    filename: Optional[str] = None, 
):
    resolved = path
    
    if filename and not resolved:
        resolved = str(HEADSHOT_DIR / filename)

    if mlbam_id and not resolved:
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT headshot FROM player WHERE mlbam_id=?", (mlbam_id,)
            ).fetchone()
            if row and row["headshot"]:
                resolved = str(HEADSHOT_DIR / row["headshot"])
        finally:
            conn.close()

    if name and not resolved:
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT headshot FROM player WHERE LOWER(name) LIKE LOWER(?) LIMIT 1",
                (f"%{name}%",)
            ).fetchone()
            if row and row["headshot"]:
                resolved = str(HEADSHOT_DIR / row["headshot"])
        finally:
            conn.close()

    if not resolved:
        raise HTTPException(status_code=404, detail="No headshot found")

    img = Path(resolved)
    if not img.exists():
        # Legacy absolute path support
        img = Path(resolved)
        if not img.exists():
            raise HTTPException(status_code=404, detail=f"Image not found: {resolved}")

    return FileResponse(img, media_type="image/jpeg")


@app.get("/seasons")
def seasons():
    conn = get_db()
    try:
        bat = [r[0] for r in conn.execute(
            "SELECT DISTINCT season FROM batting ORDER BY season DESC"
        ).fetchall()]
        return {"seasons": bat, "current": CURRENT_YEAR}
    finally:
        conn.close()

@app.get("/hof")
def hof_lookup(name: str = Query(...)):
    import re as _re
    conn = get_db()
    try:
        # Strip Jr/Sr/II/III suffixes, then extract last name
        clean = _re.sub(r'\b(jr\.?|sr\.?|ii|iii|iv)\b', '', name, flags=_re.I).strip()
        last = clean.split()[-1] if clean else name.strip().split()[0]

        # Try exact full name first, then last name with most bWAR
        row = conn.execute("""
            SELECT last_name, full_name, inducted_year, vote_pct,
                   ballots_taken, first_ballot, first_ballot_year
            FROM hof WHERE LOWER(full_name) = LOWER(?)
        """, (clean,)).fetchone()

        if not row:
            row = conn.execute("""
                SELECT h.last_name, h.full_name, h.inducted_year, h.vote_pct,
                       h.ballots_taken, h.first_ballot, h.first_ballot_year,
                       COUNT(b.season) seasons
                FROM hof h
                LEFT JOIN batting b ON LOWER(b.name) = LOWER(h.full_name)
                WHERE LOWER(h.last_name) = LOWER(?)
                GROUP BY h.rowid
                ORDER BY seasons DESC, h.vote_pct DESC
                LIMIT 1
            """, (last,)).fetchone()

        return {"hof": dict(row) if row else None}
    finally:
        conn.close()



# ── SDI (Sustained Deviation Index) ───────────────────────────────────────────

def _norm_name(s):
    """Strip accents and normalize name for deduplication."""
    import unicodedata
    s = unicodedata.normalize("NFD", str(s))
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return s.strip()

@app.get("/sdi/batting")
def sdi_batting(
    season:  int = Query(default=CURRENT_YEAR),
    signal:  Optional[str] = None,  # breakout | regression | noise | stable
    limit:   int = Query(default=50, le=200),
    sort_by: str = Query(default="net_sdi"),
):
    """Pre-computed SDI for batters. Run compute_sdi.py to refresh."""
    conn = get_db()
    try:
        signal_clause = f"AND signal = '{signal}'" if signal else ""
        rows = conn.execute(f"""
            SELECT s.name, s.season, s.team, s.archetype, s.overall_confidence,
                   s.signal, s.net_sdi, s.metrics_json, s.career_pa, s.career_seasons,
                   b.pa, b.hr, b.avg, b.obp, b.slg, b.ops, b.bwar, b.opsplus,
                   b.xwoba, b.ev, b.hard_hit_pct, b.barrel_pct,
                   COALESCE(p1.headshot, p2.headshot) headshot
            FROM sdi_2026 s
            JOIN batting b ON LOWER(b.name)=LOWER(s.name) AND b.season=s.season
                AND (b.team=s.team OR s.team IS NULL OR s.team='')
            LEFT JOIN player p1 ON b.mlbam_id = p1.mlbam_id AND b.mlbam_id IS NOT NULL
            LEFT JOIN player p2 ON LOWER(b.name) = LOWER(p2.name) AND b.mlbam_id IS NULL
            WHERE s.season=? AND s.role='batter' {signal_clause}
            ORDER BY {"s.net_sdi ASC" if sort_by == "net_sdi_asc" else f"s.{sort_by} DESC"} NULLS LAST
            LIMIT ?
        """, (season, limit)).fetchall()

        results = []
        for row in rows_to_list(rows):
            row["sdi_metrics"] = __import__("json").loads(row.pop("metrics_json") or "{}")
            results.append(row)
        return {"season": season, "signal": signal, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SDI data not found. Run compute_sdi.py first. Error: {e}")
    finally:
        conn.close()


@app.get("/sdi/pitching")
def sdi_pitching(
    season:  int = Query(default=CURRENT_YEAR),
    signal:  Optional[str] = None,
    limit:   int = Query(default=50, le=200),
    sort_by: str = Query(default="net_sdi"),
):
    """Pre-computed SDI for pitchers."""
    conn = get_db()
    try:
        signal_clause = f"AND signal = '{signal}'" if signal else ""
        rows = conn.execute(f"""
            SELECT s.name, s.season, s.team, s.archetype, s.overall_confidence,
                   s.signal, s.net_sdi, s.metrics_json, s.career_ip, s.career_seasons,
                   p.ip, p.era, p.whip, p.eraplus, p.bwar, p.so, p.g, p.gs,
                   ROUND(CAST(p.so AS REAL)/NULLIF(p.ip,0)*9,2) k_9,
                   ROUND(CAST(p.bb AS REAL)/NULLIF(p.ip,0)*9,2) bb_9,
                   COALESCE(pl1.headshot, pl2.headshot) headshot
            FROM sdi_2026 s
            JOIN pitching p ON LOWER(p.name)=LOWER(s.name) AND p.season=s.season
                AND (p.team=s.team OR s.team IS NULL OR s.team='')
            LEFT JOIN player pl1 ON p.mlbam_id = pl1.mlbam_id AND p.mlbam_id IS NOT NULL
            LEFT JOIN player pl2 ON LOWER(p.name) = LOWER(pl2.name) AND p.mlbam_id IS NULL
            WHERE s.season=? AND s.role='pitcher' {signal_clause}
            ORDER BY {"s.net_sdi ASC" if sort_by == "net_sdi_asc" else f"s.{sort_by} DESC"} NULLS LAST
            LIMIT ?
        """, (season, limit)).fetchall()

        results = []
        for row in rows_to_list(rows):
            row["sdi_metrics"] = __import__("json").loads(row.pop("metrics_json") or "{}")
            results.append(row)
        return {"season": season, "signal": signal, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SDI data not found. Run compute_sdi.py first. Error: {e}")
    finally:
        conn.close()


@app.get("/sdi/player")
def sdi_player(name: str = Query(...), season: int = Query(default=CURRENT_YEAR)):
    """Get SDI breakdown for a specific player."""
    conn = get_db()
    try:
        row = conn.execute("""
            SELECT * FROM sdi_2026
            WHERE LOWER(name)=LOWER(?) AND season=?
            LIMIT 1
        """, (name, season)).fetchone()
        if not row:
            return {"name": name, "season": season, "sdi": None}
        r = dict(row)
        r["sdi_metrics"] = __import__("json").loads(r.pop("metrics_json") or "{}")
        return {"name": name, "season": season, "sdi": r}
    finally:
        conn.close()


def _compute_batter_sdi(conn, current, season):
    """
    Compute SDI for a single batter.
    Returns dict with reliability weights and sustained deviations per metric.
    """
    name = current["name"]
    curr_pa = current.get("pa") or 0
    if curr_pa < 20:
        return None

    # Career averages (exclude current season)
    career = conn.execute("""
        SELECT AVG(k_pct) k_pct, AVG(bb_pct) bb_pct,
               AVG(CASE WHEN xwoba IS NOT NULL THEN xwoba END) xwoba,
               AVG(CASE WHEN barrel_pct IS NOT NULL THEN barrel_pct END) barrel_pct,
               AVG(CASE WHEN hard_hit_pct IS NOT NULL THEN hard_hit_pct END) hard_hit_pct,
               AVG(ev) ev, SUM(pa) career_pa, COUNT(season) seasons
        FROM batting
        WHERE LOWER(name) = LOWER(?) AND season < ?
    """, (name, season)).fetchone()

    if not career or not career["career_pa"]:
        return None  # Rookie with no prior seasons

    career = dict(career)

    # Archetype detection: TTO vs Contact
    # TTO = high K% + high BB% + high HR rate; Contact = low K%, higher contact
    k_pct_career = career.get("k_pct") or 20
    hr_rate = (current.get("hr") or 0) / max(curr_pa, 1) * 600
    archetype = "tto" if (k_pct_career > 22 or hr_rate > 25) else "contact"

    # Stabilization S-values (PA where signal = noise)
    S = {
        "k_pct":       40  if archetype == "contact" else 80,
        "bb_pct":      120 if archetype == "contact" else 80,
        "xwoba":       150 if archetype == "contact" else 100,
        "barrel_pct":  80  if archetype == "contact" else 30,
        "hard_hit_pct": 60,
    }

    metrics = {}
    total_w = 0
    metrics_computed = 0

    for metric, s_val in S.items():
        curr_val = current.get(metric)
        career_val = career.get(metric)
        if curr_val is None or career_val is None:
            continue

        sample = curr_pa
        weight = sample / (sample + s_val)
        raw_dev = float(curr_val) - float(career_val)
        sustained = raw_dev * weight

        metrics[metric] = {
            "current": round(float(curr_val), 3),
            "career":  round(float(career_val), 3),
            "reliability_pct": round(weight * 100, 1),
            "raw_deviation":   round(raw_dev, 3),
            "sustained_deviation": round(sustained, 3),
        }
        total_w += weight
        metrics_computed += 1

    if metrics_computed == 0:
        return None

    overall_confidence = round((total_w / metrics_computed) * 100, 1)

    # Determine signal type
    positive_sdi = sum(1 for m in metrics.values() if m["sustained_deviation"] > 0)
    negative_sdi = sum(1 for m in metrics.values() if m["sustained_deviation"] < 0)

    if overall_confidence >= 50 and positive_sdi > negative_sdi:
        signal = "breakout"
    elif overall_confidence >= 50 and negative_sdi > positive_sdi:
        signal = "regression"
    elif overall_confidence < 30:
        signal = "noise"
    else:
        signal = "stable"

    return {
        "sdi_metrics":         metrics,
        "overall_confidence":  overall_confidence,
        "archetype":           archetype,
        "signal":              signal,
        "career_pa":           career.get("career_pa"),
        "career_seasons":      career.get("seasons"),
    }


def _compute_pitcher_sdi(conn, current, season):
    """Compute SDI for a single pitcher."""
    name = current["name"]
    curr_ip = current.get("ip") or 0
    if curr_ip < 5:
        return None

    career = conn.execute("""
        SELECT AVG(CASE WHEN ip > 0 THEN CAST(so AS REAL)/ip*9 END) k_9,
               AVG(CASE WHEN ip > 0 THEN CAST(bb AS REAL)/ip*9 END) bb_9,
               AVG(era) era, AVG(eraplus) eraplus,
               AVG(CASE WHEN ip > 0 THEN (h+bb)*1.0/ip END) whip,
               SUM(ip) career_ip, COUNT(season) seasons
        FROM pitching
        WHERE LOWER(name) = LOWER(?) AND season < ?
    """, (name, season)).fetchone()

    if not career or not career["career_ip"]:
        return None

    career = dict(career)

    # Archetype: power vs finesse
    k9_career = career.get("k_9") or 7
    archetype = "power" if k9_career > 9 else "finesse"

    S = {
        "k_9":  50  if archetype == "power" else 90,
        "bb_9": 150 if archetype == "power" else 120,
        "era":  200,
        "whip": 150,
    }

    metrics = {}
    total_w = 0
    metrics_computed = 0

    for metric, s_val in S.items():
        curr_val = current.get(metric)
        career_val = career.get(metric)
        if curr_val is None or career_val is None:
            continue

        # Use BF estimate for pitchers (IP * ~3.7)
        sample = curr_ip * 3.7
        weight = sample / (sample + s_val)
        raw_dev = float(curr_val) - float(career_val)
        # ERA/WHIP: negative deviation = improvement
        if metric in ("era", "whip", "bb_9"):
            raw_dev = -raw_dev
        sustained = raw_dev * weight

        metrics[metric] = {
            "current": round(float(curr_val), 3),
            "career":  round(float(career_val), 3),
            "reliability_pct": round(weight * 100, 1),
            "raw_deviation":   round(raw_dev, 3),
            "sustained_deviation": round(sustained, 3),
        }
        total_w += weight
        metrics_computed += 1

    if metrics_computed == 0:
        return None

    overall_confidence = round((total_w / metrics_computed) * 100, 1)
    positive_sdi = sum(1 for m in metrics.values() if m["sustained_deviation"] > 0)
    negative_sdi = sum(1 for m in metrics.values() if m["sustained_deviation"] < 0)

    if overall_confidence >= 50 and positive_sdi > negative_sdi:
        signal = "breakout"
    elif overall_confidence >= 50 and negative_sdi > positive_sdi:
        signal = "regression"
    elif overall_confidence < 30:
        signal = "noise"
    else:
        signal = "stable"

    return {
        "sdi_metrics":        metrics,
        "overall_confidence": overall_confidence,
        "archetype":          archetype,
        "signal":             signal,
        "career_ip":          career.get("career_ip"),
        "career_seasons":     career.get("seasons"),
    }





if __name__ == "__main__":
    import uvicorn
    port = int(_os.getenv("PORT", 5001))
    print(f"""
╔══════════════════════════════════════╗
║   DiamondMine API v2.0               ║
║   http://localhost:{port}              ║
║   Docs: http://localhost:{port}/docs   ║
╚══════════════════════════════════════╝
""")
    uvicorn.run(app, host="0.0.0.0", port=port)


# ── Economics endpoints ───────────────────────────────────────────────────────

import re as _re
from collections import defaultdict as _defaultdict

def _parse_contract_notes(notes):
    if not notes: return None, None, None, None
    s = str(notes)
    years = total = t_start = t_end = None
    m = _re.search(r'(\d+)\s*(?:yr|y(?:ear)?)(?!\w)', s, _re.I)
    if m: years = int(m.group(1))
    m = _re.search(r'\$\s*(\d+(?:\.\d+)?)\s*[Mm]', s)
    if m: total = float(m.group(1)) * 1_000_000
    m = _re.search(r'\((\d{2,4})-(\d{2,4})\)', s)
    if m:
        sy, ey = int(m.group(1)), int(m.group(2))
        t_start = sy + 2000 if sy < 100 else sy
        t_end   = ey + 2000 if ey < 100 else ey
    return years, total, t_start, t_end


def _service_buckets(mls_str, contract_years):
    if not mls_str or not contract_years: return None, None, None
    try: mls = float(str(mls_str).strip())
    except: return None, None, None
    pre_arb = arb = fa = 0
    cur = mls
    for _ in range(int(contract_years)):
        if cur < 3.0:   pre_arb += 1
        elif cur < 6.0: arb += 1
        else:           fa += 1
        cur += 1.0
    return pre_arb, arb, fa



# Cot's abbreviations (player_salaries, contracts) -> BRef table abbreviations (batting, pitching)
COTS_TO_BREF = {
    'LAN':'LAD', 'KCA':'KCR', 'CHA':'CHW', 'SDN':'SDP', 'SLN':'STL',
    'TBA':'TBR', 'WAS':'WSN', 'NYA':'NYY', 'NYN':'NYM', 'CHN':'CHC',
    'SFN':'SFG', 'ANA':'LAA', 'ATH':'OAK', 'MIA':'FLA',
    # These are already the same in both:
    # ATL, BAL, BOS, CIN, CLE, COL, DET, HOU, MIN, MIL, PHI, PIT, SEA, TEX, TOR, ARI
}
BREF_TO_COTS = {v: k for k, v in COTS_TO_BREF.items()}

def to_bref(team): return COTS_TO_BREF.get(team, team)
def to_cots(team): return BREF_TO_COTS.get(team, team)

def _ext_surplus_rows(conn, current_rate, team="", era_start=0, era_end=9999,
                      position_group="", contract_type="", min_years=1, limit=200):
    """Build extension/international rows in leaderboard format."""
    POS_MAP = {
        'sp':'SP','rhp-s':'SP','lhp-s':'SP','rp':'RP','lhp':'RP','rhp':'RP',
        'rhp-r':'RP','lhp-r':'RP','lhp-c':'RP','c':'C','1b':'1B','2b':'2B',
        '3b':'3B','ss':'SS','lf':'OF','cf':'OF','rf':'OF','of':'OF','dh':'DH',
    }

    where = ["ps.contract_type IN ('extension','international')",
             "ps.season BETWEEN :es AND :ee"]
    params = dict(es=era_start or 2009, ee=era_end or 9999)

    if contract_type in ('extension','international'):
        where.append("ps.contract_type = :ct"); params['ct'] = contract_type
    if team:
        where.append("ps.team = :team"); params['team'] = team

    ps_rows = conn.execute(f"""
        SELECT ps.name, ps.team, MIN(ps.season) AS first_season,
               MAX(ps.season) AS last_season, COUNT(*) AS seasons,
               ps.position, ps.contract_type, ps.ml_service,
               ps.contract_notes, ps.is_international
        FROM player_salaries ps
        WHERE {" AND ".join(where)}
        GROUP BY ps.name, ps.team, ps.contract_type
        HAVING COUNT(*) >= :mn
        LIMIT :lim
    """, {**params, 'mn': min_years, 'lim': limit}).fetchall()

    market_rates = {r[0]: r[1] for r in conn.execute(
        "SELECT season, dollars_per_war FROM market_rates WHERE dollars_per_war IS NOT NULL"
    ).fetchall()}

    results = []
    for ps in ps_rows:
        ps = dict(ps)
        pos = (ps.get('position') or '').lower().strip()
        pg  = POS_MAP.get(pos, pos.upper() if pos else None)
        if position_group and pg != position_group:
            continue

        notes = ps.get('contract_notes') or ''
        yrs, total_val, t_start, t_end = _parse_contract_notes(notes)
        observed = ps['last_season'] - ps['first_season'] + 1
        eff_yrs  = yrs if (yrs and yrs >= observed) else observed
        pre_arb, arb, fa_y = _service_buckets(ps.get('ml_service'), eff_yrs)

        signing_rate = market_rates.get(t_start or ps['first_season']) or \
                       market_rates.get((t_start or ps['first_season']) - 1)

        # Sum WAR across all seasons
        # Use contract term window (t_start/t_end) when available — prevents
        # pulling WAR from adjacent contracts on same team with same type
        war_start = t_start if t_start else ps['first_season']
        war_end   = t_end   if t_end   else ps['last_season']
        war_row = conn.execute("""
            SELECT COALESCE(SUM(season_war), 0) AS war FROM (
                    SELECT season,
                        CASE
                            WHEN bat_war > 1.5 AND pit_war > 1.5
                            THEN bat_war + pit_war   -- genuine two-way player (Ohtani): sum both
                            ELSE MAX(bat_war, pit_war) -- pitcher or hitter: take larger, avoid double-count
                        END AS season_war
                    FROM (
                        SELECT season,
                            COALESCE(MAX(CASE WHEN src='bat' THEN bwar END), 0) AS bat_war,
                            COALESCE(MAX(CASE WHEN src='pit' THEN bwar END), 0) AS pit_war
                        FROM (
                            SELECT season, 'bat' AS src, COALESCE(bwar,0) AS bwar
                                FROM batting  WHERE name=? AND season BETWEEN ? AND ?
                            UNION ALL
                            SELECT season, 'pit' AS src, COALESCE(bwar,0) AS bwar
                                FROM pitching WHERE name=? AND season BETWEEN ? AND ?
                        ) GROUP BY season
                    )
                )
        """, (ps['name'], war_start, war_end,
              ps['name'], war_start, war_end)).fetchone()
        total_war = float(war_row['war']) if war_row else 0.0

        total_salary = conn.execute(
            "SELECT COALESCE(SUM(salary),0) FROM player_salaries "
            "WHERE name=? AND team=? AND contract_type=?",
            (ps['name'], ps['team'], ps['contract_type'])
        ).fetchone()[0]

        fa_surplus = None
        if signing_rate and total_salary:
            fa_surplus = round(total_war * signing_rate - total_salary)

        adj_surplus = None
        if fa_surplus is not None and signing_rate and current_rate:
            adj_surplus = round(fa_surplus * (current_rate / signing_rate))

        aav = round(total_val / yrs) if total_val and yrs else None

        results.append({
            "name":                  ps['name'],
            "canonical_name":        ps['name'],
            "signing_class":         t_start or ps['first_season'],
            "position":              ps.get('position'),
            "position_group":        pg,
            "new_team":              ps['team'],
            "age_at_signing":        None,
            "years":                 eff_yrs,
            "aav":                   aav,
            "guarantee":             total_val,
            "term_start":            t_start,
            "term_end":              t_end,
            "contract_status":       "active" if (t_end or 0) >= 2026 else "complete",
            "total_realized_war":    round(total_war, 1),
            "realized_surplus":      fa_surplus,
            "expected_surplus":      None,
            "market_rate_at_signing": signing_rate,
            "realized_market_value": round(total_war * signing_rate) if signing_rate else None,
            "contract_type":         ps['contract_type'],
            "has_deferral":          0,
            "cbt_aav":               None,
            "pre_arb_years":         pre_arb,
            "arb_years":             arb,
            "fa_years":              fa_y,
            "inflation_adj_surplus": adj_surplus,
            "current_market_rate":   current_rate,
        })
    return results


@app.get("/economics/market-rates")
def economics_market_rates():
    conn = get_db()
    rows = conn.execute(
        "SELECT season, dollars_per_war, sample_size, total_contracts, match_rate "
        "FROM market_rates ORDER BY season"
    ).fetchall()
    return [dict(r) for r in rows]


@app.get("/economics/leaderboard")
def economics_leaderboard(
    position_group: str = Query(""),
    status: str         = Query(""),
    team: str           = Query(""),
    contract_type: str  = Query(""),
    era_start: int      = Query(0),
    era_end: int        = Query(9999),
    sort_by: str        = Query("realized_surplus"),
    order: str          = Query("desc"),
    min_years: int      = Query(1),
    limit: int          = Query(200),
):
    conn = get_db()
    latest = conn.execute(
        "SELECT dollars_per_war FROM market_rates "
        "WHERE dollars_per_war IS NOT NULL ORDER BY season DESC LIMIT 1"
    ).fetchone()
    current_rate = latest[0] if latest else None

    ext_types = {"extension", "international"}
    want_ext = (not contract_type) or contract_type in ext_types
    want_fa  = (not contract_type) or contract_type in {"fa", "trade"}

    # ── FA contracts from contract_valuations ─────────────────────────────────
    fa_result = []
    if want_fa:
        where  = ["cv.realized_surplus IS NOT NULL",
                  "cv.years >= :min_years",
                  "cv.signing_class BETWEEN :era_start AND :era_end"]
        params = dict(min_years=min_years, era_start=era_start, era_end=era_end)
        if position_group:
            where.append("cv.position_group = :position_group")
            params["position_group"] = position_group
        if status:
            where.append("cv.contract_status = :status"); params["status"] = status
        if team:
            where.append("cv.new_team = :team"); params["team"] = team

        valid  = {"realized_surplus","expected_surplus","total_realized_war",
                  "aav","guarantee","signing_class","years"}
        sql_col   = sort_by if sort_by in valid else "realized_surplus"
        direction = "ASC" if order.lower() == "asc" else "DESC"

        rows = conn.execute(f"""
            SELECT cv.name, cv.canonical_name, cv.signing_class, cv.position,
                   cv.position_group, cv.new_team, cv.age_at_signing, cv.years,
                   cv.aav, cv.guarantee, cv.term_start, cv.term_end,
                   cv.contract_status, cv.total_realized_war,
                   cv.realized_surplus, cv.expected_surplus,
                   cv.market_rate_at_signing, cv.realized_market_value,
                   COALESCE(c.contract_type,'fa') AS contract_type,
                   COALESCE(c.has_deferral,0)     AS has_deferral,
                   c.cbt_aav, c.pre_arb_years, c.arb_years, c.fa_years
            FROM contract_valuations cv
            LEFT JOIN contracts c ON c.name = cv.name
                                  AND c.signing_class = cv.signing_class
                                  AND c.new_team = cv.new_team
            WHERE {" AND ".join(where)}
              AND COALESCE(c.contract_type,'fa') NOT IN ('extension','international')
            ORDER BY cv.{sql_col} {direction}
            LIMIT :limit
        """, {**params, "limit": limit}).fetchall()

        for r in rows:
            d = dict(r)
            if current_rate and d.get("realized_surplus") is not None and d.get("market_rate_at_signing"):
                d["inflation_adj_surplus"] = round(d["realized_surplus"] * (current_rate / d["market_rate_at_signing"]))
            else:
                d["inflation_adj_surplus"] = None
            d["current_market_rate"] = current_rate
            fa_result.append(d)

    # ── Extensions/international from player_salaries ─────────────────────────
    ext_result = []
    if want_ext and (not status or status == ""):
        ext_result = _ext_surplus_rows(
            conn, current_rate,
            team=team, era_start=era_start, era_end=era_end,
            position_group=position_group,
            contract_type=contract_type if contract_type in ext_types else "",
            min_years=min_years, limit=limit,
        )

    # ── Merge and sort ────────────────────────────────────────────────────────
    combined = fa_result + ext_result

    sort_key = sort_by if sort_by in {
        "realized_surplus","inflation_adj_surplus","total_realized_war",
        "aav","guarantee","signing_class","years"
    } else "realized_surplus"

    combined.sort(
        key=lambda x: (x.get(sort_key) is None, x.get(sort_key) or 0),
        reverse=(order.lower() == "desc")
    )

    if sort_by == "inflation_adj_surplus":
        combined.sort(
            key=lambda x: (x.get("inflation_adj_surplus") is None, x.get("inflation_adj_surplus") or 0),
            reverse=(order.lower() == "desc")
        )

    return combined[:limit]


@app.get("/economics/player")
def economics_player(name: str = Query(...)):
    conn = get_db()
    rows = conn.execute("""
        SELECT cv.*, COALESCE(c.contract_type,'fa') AS contract_type,
               c.agent, c.has_deferral, c.cbt_aav,
               c.pre_arb_years, c.arb_years, c.fa_years,
               c.source_league, c.ml_service_at_signing
        FROM contract_valuations cv
        LEFT JOIN contracts c ON c.name = cv.name
                              AND c.signing_class = cv.signing_class
                              AND c.new_team = cv.new_team
        WHERE cv.canonical_name LIKE :n OR cv.name LIKE :n
        ORDER BY cv.signing_class
    """, {"n": f"%{name}%"}).fetchall()
    return [dict(r) for r in rows]


@app.get("/economics/team")
def economics_team(
    team: str      = Query(...),
    era_start: int = Query(1991),
    era_end: int   = Query(9999),
    sort_by: str   = Query("signing_class"),
    order: str     = Query("desc"),
):
    """
    Team contract economics with proper pro-rata attribution.

    Uses BRef team-split rows directly from batting/pitching tables.
    For traded players, salary is pro-rated by games played for this team
    vs total games that season (as the user described with Machado 2018).

    WAR = from BRef split rows WHERE team = this team (already split by BRef).
    Salary = player_salaries salary * (team_g / total_g) for each season.
    Surplus = team_WAR * signing_$/WAR - pro_rated_salary_paid.
    """
    conn = get_db()

    market_rates = {r[0]: r[1] for r in conn.execute(
        "SELECT season, dollars_per_war FROM market_rates WHERE dollars_per_war IS NOT NULL"
    ).fetchall()}
    current_rate = conn.execute(
        "SELECT dollars_per_war FROM market_rates WHERE dollars_per_war IS NOT NULL ORDER BY season DESC LIMIT 1"
    ).fetchone()
    current_rate = current_rate[0] if current_rate else None

    POS_MAP = {
        'sp':'SP','rhp-s':'SP','lhp-s':'SP','rp':'RP','lhp':'RP','rhp':'RP',
        'rhp-r':'RP','lhp-r':'RP','lhp-c':'RP','c':'C','1b':'1B','2b':'2B',
        '3b':'3B','ss':'SS','lf':'OF','cf':'OF','rf':'OF','of':'OF','dh':'DH',
    }

    # ── Step 1: get all player-seasons where player appeared for this team ────
    # Exclude TOT/2TM summary rows — we only want team-specific split rows
    # Translate Cot's abbreviation (LAN, KCA...) to BRef stats table abbrev (LAD, KCR...)
    bref_team = to_bref(team)

    bat_rows = conn.execute("""
        SELECT name, season, team, g, COALESCE(bwar,0) AS bwar
        FROM batting
        WHERE team = :team AND season BETWEEN :era_start AND :era_end
          AND team NOT IN ('TOT','2TM','3TM','4TM','LGN','LGS')
        ORDER BY name, season
    """, dict(team=bref_team, era_start=era_start, era_end=era_end)).fetchall()

    pit_rows = conn.execute("""
        SELECT name, season, team, g, COALESCE(bwar,0) AS bwar
        FROM pitching
        WHERE team = :team AND season BETWEEN :era_start AND :era_end
          AND team NOT IN ('TOT','2TM','3TM','4TM','LGN','LGS')
        ORDER BY name, season
    """, dict(team=bref_team, era_start=era_start, era_end=era_end)).fetchall()

    # Build per-(name, season) war dict: Ohtani-aware
    from collections import defaultdict
    war_by_player_season = defaultdict(lambda: {'bat': 0.0, 'pit': 0.0, 'g_bat': 0, 'g_pit': 0})
    for r in bat_rows:
        key = (r['name'], r['season'])
        war_by_player_season[key]['bat'] = float(r['bwar'] or 0)
        war_by_player_season[key]['g_bat'] = int(r['g'] or 0)
    for r in pit_rows:
        key = (r['name'], r['season'])
        war_by_player_season[key]['pit'] = float(r['bwar'] or 0)
        war_by_player_season[key]['g_pit'] = int(r['g'] or 0)

    # All unique players who appeared for this team
    all_players = set(k[0] for k in war_by_player_season.keys())

    # ── Step 2: for each player-season, get total games (all teams) ───────────
    # Used for pro-rating salary on traded players
    total_g_cache = {}  # (name, season) -> total games
    for (name, season) in war_by_player_season.keys():
        # Use batting total games (2TM/TOT row) or sum of all split rows
        tot = conn.execute("""
            SELECT COALESCE(MAX(g), 0) FROM batting
            WHERE name = ? AND season = ?
              AND team IN ('TOT','2TM','3TM','4TM')
        """, (name, season)).fetchone()[0]
        if not tot:
            # No TOT row — sum all team split rows
            tot = conn.execute("""
                SELECT COALESCE(SUM(g), 0) FROM batting
                WHERE name = ? AND season = ?
                  AND team NOT IN ('TOT','2TM','3TM','4TM')
            """, (name, season)).fetchone()[0]
        if not tot:
            tot = conn.execute("""
                SELECT COALESCE(MAX(g), 0) FROM pitching
                WHERE name = ? AND season = ?
                  AND team IN ('TOT','2TM','3TM','4TM')
            """, (name, season)).fetchone()[0]
        if not tot:
            tot = conn.execute("""
                SELECT COALESCE(SUM(g), 0) FROM pitching
                WHERE name = ? AND season = ?
                  AND team NOT IN ('TOT','2TM','3TM','4TM','LGN','LGS')
            """, (name, season)).fetchone()[0]
        total_g_cache[(name, season)] = max(int(tot or 0), 1)

    # ── Step 3: salary lookup from player_salaries ────────────────────────────
    # player_salaries has opening-day roster so it reflects the team
    # that signed them at the start of the season (or previous year for trade)
    salary_cache = {}  # (name, season) -> (salary, source_team)
    sal_rows = conn.execute("""
        SELECT name, season, team, salary
        FROM player_salaries
        WHERE season BETWEEN :era_start AND :era_end
          AND name IN ({})
        ORDER BY name, season
    """.format(','.join('?' * len(all_players))),
        [era_start, era_end] + list(all_players) if all_players else [era_start, era_end]
    ).fetchall() if all_players else []

    # This query needs fixing — player names can't go in positional params easily
    # Use a temp approach: fetch all player_salaries for the era then filter
    all_sal = conn.execute("""
        SELECT name, season, team, salary
        FROM player_salaries
        WHERE season BETWEEN ? AND ?
    """, (era_start, era_end)).fetchall()

    for r in all_sal:
        key = (r['name'], r['season'])
        if key not in salary_cache:
            salary_cache[key] = (float(r['salary'] or 0), r['team'])

    # ── Step 4: group by player, compute pro-rata salary and WAR ─────────────
    player_stints = defaultdict(lambda: {
        'seasons': [], 'total_war': 0.0, 'total_salary': 0.0,
        'first_season': None, 'last_season': None
    })

    for (name, season), wars in war_by_player_season.items():
        bat_war = wars['bat']
        pit_war = wars['pit']
        g_team  = max(wars['g_bat'], wars['g_pit'])  # games for this team

        # Two-way player WAR (Ohtani rule)
        if bat_war > 1.5 and pit_war > 1.5:
            season_war = bat_war + pit_war
        else:
            season_war = max(bat_war, pit_war)

        # Pro-rate salary
        total_g = total_g_cache.get((name, season), 162)
        g_ratio = min(g_team / total_g, 1.0) if total_g > 0 else 1.0

        sal, sal_team = salary_cache.get((name, season), (0.0, None))
        pro_rated_salary = sal * g_ratio

        stint = player_stints[name]
        stint['seasons'].append(season)
        stint['total_war']    += season_war
        stint['total_salary'] += pro_rated_salary
        if stint['first_season'] is None or season < stint['first_season']:
            stint['first_season'] = season
        if stint['last_season'] is None or season > stint['last_season']:
            stint['last_season'] = season

    # ── Step 5: get contract metadata from contracts / player_salaries ────────
    contracts = []
    for name, stint in player_stints.items():
        if not stint['seasons']: continue
        first_s = stint['first_season']
        last_s  = stint['last_season']
        seasons_on_team = len(stint['seasons'])
        total_war    = round(stint['total_war'], 1)
        total_salary = stint['total_salary']

        # Skip players with trivial WAR contribution (bench appearances etc)
        if total_war == 0 and total_salary < 500_000:
            continue

        # Contract metadata: prefer contracts table (FA), fall back to player_salaries
        cv = conn.execute("""
            SELECT cv.signing_class, cv.position, cv.position_group,
                   cv.age_at_signing, cv.years, cv.aav, cv.guarantee,
                   cv.term_start, cv.term_end, cv.contract_status,
                   cv.market_rate_at_signing,
                   COALESCE(c.contract_type,'fa') AS contract_type,
                   COALESCE(c.has_deferral,0) AS has_deferral,
                   c.cbt_aav
            FROM contract_valuations cv
            LEFT JOIN contracts c ON c.name=cv.name
                                 AND c.signing_class=cv.signing_class
                                 AND c.new_team=cv.new_team
            WHERE cv.name = ?
              AND cv.term_start <= ? AND cv.term_end >= ?
            ORDER BY ABS(cv.signing_class - ?) LIMIT 1
        """, (name, last_s, first_s, first_s)).fetchone()

        if cv:
            signing_class  = cv['signing_class']
            signing_rate   = cv['market_rate_at_signing'] or market_rates.get(signing_class)
            position       = cv['position']
            position_group = cv['position_group']
            age_at_signing = cv['age_at_signing']
            full_years     = cv['years']
            aav            = cv['aav']
            guarantee      = cv['guarantee']
            term_start     = cv['term_start']
            term_end       = cv['term_end']
            contract_type  = cv['contract_type']
            has_deferral   = cv['has_deferral']
            cbt_aav_val    = cv['cbt_aav']
        else:
            # Fall back to player_salaries for contract notes
            ps = conn.execute("""
                SELECT position, contract_notes, contract_type, ml_service
                FROM player_salaries WHERE name=? AND team=?
                ORDER BY LENGTH(COALESCE(contract_notes,'')) DESC LIMIT 1
            """, (name, team)).fetchone()
            notes = (ps['contract_notes'] if ps else None) or ''
            yrs, total_val, t_start, t_end = _parse_contract_notes(notes)
            observed = last_s - first_s + 1
            eff_yrs  = yrs if (yrs and yrs >= observed) else observed
            signing_class  = t_start or first_s
            signing_rate   = market_rates.get(signing_class) or market_rates.get(signing_class-1)
            pos_raw        = (ps['position'] if ps else '').lower()
            position       = ps['position'] if ps else None
            position_group = POS_MAP.get(pos_raw, pos_raw.upper() if pos_raw else None)
            age_at_signing = None
            full_years     = eff_yrs
            aav            = round(total_val/yrs) if total_val and yrs else None
            guarantee      = total_val
            term_start     = t_start or first_s
            term_end       = t_end or last_s
            contract_type  = ps['contract_type'] if ps else 'unknown'
            has_deferral   = 0
            cbt_aav_val    = None

        if not signing_rate:
            signing_rate = market_rates.get(first_s) or market_rates.get(first_s - 1)
        if not signing_rate:
            continue

        team_market_value = round(total_war * signing_rate)
        team_surplus      = round(team_market_value - total_salary)
        adj_surplus       = round(team_surplus * (current_rate / signing_rate)) if current_rate else None

        contracts.append({
            "name":                  name,
            "canonical_name":        name,
            "signing_class":         signing_class,
            "position":              position,
            "position_group":        position_group,
            "new_team":              team,
            "age_at_signing":        age_at_signing,
            "years":                 full_years,
            "seasons_on_team":       seasons_on_team,
            "aav":                   aav,
            "guarantee":             guarantee,
            "term_start":            term_start,
            "term_end":              term_end,
            "contract_status":       "active" if (term_end or 0) >= 2025 else "complete",
            "contract_type":         contract_type,
            "has_deferral":          has_deferral,
            "cbt_aav":               cbt_aav_val,
            "total_realized_war":    total_war,
            "team_salary_paid":      round(total_salary),
            "realized_surplus":      team_surplus,
            "expected_surplus":      None,
            "market_rate_at_signing": signing_rate,
            "realized_market_value": team_market_value,
            "inflation_adj_surplus": adj_surplus,
            "current_market_rate":   current_rate,
        })

    # Sort
    valid_sort = {"signing_class","realized_surplus","inflation_adj_surplus",
                  "aav","guarantee","total_realized_war","seasons_on_team"}
    sk = sort_by if sort_by in valid_sort else "signing_class"
    contracts.sort(
        key=lambda x: (x.get(sk) is None, x.get(sk) or 0),
        reverse=(order.lower() == "desc")
    )

    total_spent   = sum(r["team_salary_paid"]     or 0 for r in contracts)
    total_surplus = sum(r["realized_surplus"]      or 0 for r in contracts)
    total_adj     = sum(r["inflation_adj_surplus"] or 0 for r in contracts if r["inflation_adj_surplus"])
    total_war_sum = sum(r["total_realized_war"]    or 0 for r in contracts)
    wins          = sum(1 for r in contracts if (r["realized_surplus"] or 0) > 0)

    return {
        "team":          team,
        "era_start":     era_start,
        "era_end":       era_end,
        "total_contracts": len(contracts),
        "total_spent":                 round(total_spent),
        "total_surplus":               round(total_surplus),
        "total_inflation_adj_surplus": round(total_adj),
        "total_war":                   round(total_war_sum, 1),
        "win_rate": round(wins / len(contracts) * 100, 1) if contracts else 0,
        "current_market_rate":         current_rate,
        "contracts":                   contracts,
    }


@app.get("/economics/payroll")
def economics_payroll(
    team: str          = Query(""),
    season: int        = Query(0),
    contract_type: str = Query(""),
):
    conn = get_db()
    where  = ["1=1"]
    params: dict = {}
    if team:
        where.append("team = :team"); params["team"] = team
    if season:
        where.append("season = :season"); params["season"] = season
    if contract_type:
        where.append("contract_type = :contract_type"); params["contract_type"] = contract_type
    rows = conn.execute(f"""
        SELECT name, team, season, salary, cbt_aav, position,
               ml_service, age, agent, contract_notes, contract_type,
               draft_year, draft_round, is_international
        FROM player_salaries
        WHERE {" AND ".join(where)}
        ORDER BY season DESC, salary DESC
        LIMIT 500
    """, params).fetchall()
    return [dict(r) for r in rows]


@app.get("/economics/extensions")
def economics_extensions(
    team: str           = Query(""),
    era_start: int      = Query(2009),
    era_end: int        = Query(9999),
    position_group: str = Query(""),
    sort_by: str        = Query("aav"),
    order: str          = Query("desc"),
):
    conn = get_db()
    POS_MAP = {
        'sp':'SP','rhp-s':'SP','lhp-s':'SP','rp':'RP','lhp':'RP','rhp':'RP',
        'rhp-r':'RP','lhp-r':'RP','lhp-c':'RP','c':'C','1b':'1B','2b':'2B',
        '3b':'3B','ss':'SS','lf':'OF','cf':'OF','rf':'OF','of':'OF','dh':'DH',
    }
    PG_POS = {
        'SP':['sp','rhp-s','lhp-s'],'RP':['rp','lhp','rhp','rhp-r','lhp-r','lhp-c'],
        'C':['c'],'1B':['1b'],'2B':['2b'],'3B':['3b'],'SS':['ss'],
        'OF':['lf','cf','rf','of'],'DH':['dh'],
    }
    where  = ["ps.contract_type IN ('extension','international')",
              "ps.season BETWEEN :era_start AND :era_end"]
    params: dict = dict(era_start=era_start, era_end=era_end)
    if team:
        where.append("ps.team = :team"); params["team"] = team
    if position_group:
        pos_list = PG_POS.get(position_group.upper(), [position_group.lower()])
        phs = ",".join(f":pos{i}" for i in range(len(pos_list)))
        where.append(f"LOWER(ps.position) IN ({phs})")
        for i, p in enumerate(pos_list): params[f"pos{i}"] = p

    col = "MAX(ps.salary)" if sort_by == "season" else "MAX(ps.salary)"
    direction = "ASC" if order.lower() == "asc" else "DESC"

    rows = conn.execute(f"""
        SELECT ps.name, ps.team,
               MIN(ps.season) AS first_season, MAX(ps.season) AS last_season,
               COUNT(*)       AS seasons_in_db,
               ps.position, ps.contract_type, ps.ml_service,
               ps.age, ps.agent, ps.is_international,
               MAX(ps.salary) AS salary,
               (SELECT cn.contract_notes FROM player_salaries cn
                WHERE cn.name=ps.name AND cn.team=ps.team AND cn.contract_type=ps.contract_type
                ORDER BY LENGTH(cn.contract_notes) DESC LIMIT 1) AS contract_notes
        FROM player_salaries ps
        WHERE {" AND ".join(where)}
        GROUP BY ps.name, ps.team, ps.contract_type
        ORDER BY {col} {direction}
        LIMIT 500
    """, params).fetchall()

    result = []
    for r in rows:
        d = dict(r)
        pos = (d.get('position') or '').lower().strip()
        d['position_group'] = POS_MAP.get(pos, pos.upper() if pos else None)
        yrs, total, t_start, t_end = _parse_contract_notes(d.get('contract_notes'))
        observed = (d.get('last_season') or 0) - (d.get('first_season') or 0) + 1
        eff_yrs  = yrs if (yrs and yrs >= observed) else observed
        d['years']        = eff_yrs
        d['guarantee']    = total
        d['aav']          = round(total / yrs) if total and yrs else None
        d['term_start']   = t_start
        d['term_end']     = t_end
        pre_arb, arb, fa = _service_buckets(d.get('ml_service'), eff_yrs)
        d['pre_arb_years'] = pre_arb
        d['arb_years']     = arb
        d['fa_years']      = fa
        d['pct_fa_years']  = round(fa/eff_yrs*100,1) if eff_yrs and fa is not None else None
        result.append(d)

    if sort_by == 'aav':
        result.sort(key=lambda x: (x.get('aav') is None, x.get('aav') or 0),
                    reverse=(order.lower()=='desc'))
    return result


@app.get("/economics/extension-surplus")
def economics_extension_surplus(
    team: str           = Query(""),
    era_start: int      = Query(2009),
    era_end: int        = Query(9999),
    position_group: str = Query(""),
    sort_by: str        = Query("fa_rate_surplus"),
    order: str          = Query("desc"),
    min_seasons: int    = Query(2),
):
    conn = get_db()
    LG_MIN = {
        2009:400000,2010:400000,2011:414000,2012:480000,2013:490000,
        2014:500000,2015:507500,2016:507500,2017:535000,2018:545000,
        2019:555000,2020:563500,2021:570500,2022:700000,2023:720000,
        2024:740000,2025:760000,2026:780000,
    }
    POS_MAP = {
        'sp':'SP','rhp-s':'SP','lhp-s':'SP','rp':'RP','lhp':'RP','rhp':'RP',
        'rhp-r':'RP','lhp-r':'RP','lhp-c':'RP','c':'C','1b':'1B','2b':'2B',
        '3b':'3B','ss':'SS','lf':'OF','cf':'OF','rf':'OF','of':'OF','dh':'DH',
    }
    PG_POS = {
        'SP':['sp','rhp-s','lhp-s'],'RP':['rp','lhp','rhp','rhp-r','lhp-r','lhp-c'],
        'C':['c'],'1B':['1b'],'2B':['2b'],'3B':['3b'],'SS':['ss'],
        'OF':['lf','cf','rf','of'],'DH':['dh'],
    }

    where  = ["ps.contract_type IN ('extension','international')",
              "ps.season BETWEEN :era_start AND :era_end"]
    params: dict = dict(era_start=era_start, era_end=era_end)
    if team:
        where.append("ps.team = :team"); params["team"] = team
    if position_group:
        pos_list = PG_POS.get(position_group.upper(), [position_group.lower()])
        phs = ",".join(f":pos{i}" for i in range(len(pos_list)))
        where.append(f"LOWER(ps.position) IN ({phs})")
        for i, p in enumerate(pos_list): params[f"pos{i}"] = p

    ps_rows = conn.execute(f"""
        SELECT ps.name, ps.team, MIN(ps.season) AS first_season,
               MAX(ps.season) AS last_season, COUNT(*) AS seasons,
               ps.position, ps.contract_type, ps.ml_service,
               ps.contract_notes, ps.is_international
        FROM player_salaries ps
        WHERE {" AND ".join(where)}
        GROUP BY ps.name, ps.team, ps.contract_type
        HAVING COUNT(*) >= :mn
    """, {**params, 'mn': min_seasons}).fetchall()

    market_rates = {r[0]: r[1] for r in conn.execute(
        "SELECT season, dollars_per_war FROM market_rates WHERE dollars_per_war IS NOT NULL"
    ).fetchall()}
    latest_rate = conn.execute(
        "SELECT dollars_per_war FROM market_rates WHERE dollars_per_war IS NOT NULL ORDER BY season DESC LIMIT 1"
    ).fetchone()
    current_rate = latest_rate[0] if latest_rate else None

    result = []
    for ps in ps_rows:
        ps = dict(ps)
        pos = (ps.get('position') or '').lower().strip()
        pg  = POS_MAP.get(pos, pos.upper() if pos else None)
        if position_group and pg != position_group: continue

        notes     = ps.get('contract_notes') or ''
        mls_str   = ps.get('ml_service')
        first_s   = ps['first_season']
        last_s    = ps['last_season']
        yrs, total_val, t_start, t_end = _parse_contract_notes(notes)
        observed  = last_s - first_s + 1
        eff_yrs   = yrs if (yrs and yrs >= observed) else observed
        pre_arb_y, arb_y, fa_y = _service_buckets(mls_str, eff_yrs)
        signing_rate = market_rates.get(t_start or first_s) or market_rates.get((t_start or first_s)-1)
        if not signing_rate: continue

        war_start = t_start if t_start else first_s
        war_end   = t_end   if t_end   else last_s
        war_row = conn.execute("""
            SELECT COALESCE(SUM(season_war), 0) AS war FROM (
                    SELECT season,
                        CASE
                            WHEN bat_war > 1.5 AND pit_war > 1.5
                            THEN bat_war + pit_war   -- genuine two-way player (Ohtani): sum both
                            ELSE MAX(bat_war, pit_war) -- pitcher or hitter: take larger, avoid double-count
                        END AS season_war
                    FROM (
                        SELECT season,
                            COALESCE(MAX(CASE WHEN src='bat' THEN bwar END), 0) AS bat_war,
                            COALESCE(MAX(CASE WHEN src='pit' THEN bwar END), 0) AS pit_war
                        FROM (
                            SELECT season, 'bat' AS src, COALESCE(bwar,0) AS bwar
                                FROM batting  WHERE name=? AND season BETWEEN ? AND ?
                            UNION ALL
                            SELECT season, 'pit' AS src, COALESCE(bwar,0) AS bwar
                                FROM pitching WHERE name=? AND season BETWEEN ? AND ?
                        ) GROUP BY season
                    )
                )
        """, (ps['name'], war_start, war_end,
              ps['name'], war_start, war_end)).fetchone()
        total_war = float(war_row['war']) if war_row else 0.0

        total_salary = conn.execute(
            "SELECT COALESCE(SUM(salary),0) FROM player_salaries WHERE name=? AND team=? AND contract_type=?",
            (ps['name'], ps['team'], ps['contract_type'])
        ).fetchone()[0]
        if total_salary == 0: continue

        fa_surplus     = round(total_war * signing_rate - total_salary)
        tiered_value   = 0.0
        cur_mls        = float(mls_str or 0)
        seasons_list   = conn.execute(
            "SELECT season FROM player_salaries WHERE name=? AND team=? AND contract_type=? ORDER BY season",
            (ps['name'], ps['team'], ps['contract_type'])
        ).fetchall()
        for sr in seasons_list:
            yr = sr[0]
            war_s = conn.execute("""
                SELECT
                        CASE
                            WHEN bat_war > 1.5 AND pit_war > 1.5 THEN bat_war + pit_war
                            ELSE MAX(bat_war, pit_war)
                        END AS w
                    FROM (
                        SELECT
                            COALESCE(MAX(CASE WHEN src='bat' THEN bwar END), 0) AS bat_war,
                            COALESCE(MAX(CASE WHEN src='pit' THEN bwar END), 0) AS pit_war
                        FROM (
                            SELECT 'bat' AS src, COALESCE(bwar,0) AS bwar FROM batting  WHERE name=? AND season=?
                            UNION ALL
                            SELECT 'pit' AS src, COALESCE(bwar,0) AS bwar FROM pitching WHERE name=? AND season=?
                        )
                    )
            """, (ps['name'],yr,ps['name'],yr)).fetchone()
            yr_war = float(war_s['w']) if war_s else 0.0
            if cur_mls < 3.0:   tiered_value += yr_war * (signing_rate * 0.20)
            elif cur_mls < 6.0: tiered_value += yr_war * (signing_rate * 0.50)
            else:               tiered_value += yr_war * signing_rate
            cur_mls += 1.0
        tiered_surplus = round(tiered_value - total_salary)
        adj_surplus    = round(fa_surplus * (current_rate/signing_rate)) if current_rate else None

        result.append({
            "name": ps['name'], "team": ps['team'],
            "contract_type": ps['contract_type'],
            "position": ps.get('position'), "position_group": pg,
            "first_season": first_s, "last_season": last_s,
            "seasons_in_db": ps['seasons'],
            "contract_notes": notes,
            "years": eff_yrs, "guarantee": total_val,
            "aav": round(total_val/yrs) if total_val and yrs else None,
            "pre_arb_years": pre_arb_y, "arb_years": arb_y, "fa_years": fa_y,
            "pct_fa_years": round(fa_y/eff_yrs*100,1) if eff_yrs and fa_y is not None else None,
            "ml_service": mls_str,
            "total_salary_paid": total_salary,
            "total_war": round(total_war,1),
            "signing_rate": signing_rate,
            "fa_market_value": round(total_war*signing_rate),
            "fa_rate_surplus": fa_surplus,
            "tiered_surplus": tiered_surplus,
            "inflation_adj_surplus": adj_surplus,
        })

    valid = {"fa_rate_surplus","tiered_surplus","total_war","total_salary_paid","inflation_adj_surplus","first_season"}
    sk = sort_by if sort_by in valid else "fa_rate_surplus"
    result.sort(key=lambda x: (x.get(sk) is None, x.get(sk) or 0), reverse=(order.lower()=="desc"))
    return result
