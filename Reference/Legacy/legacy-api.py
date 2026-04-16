"""
Stage 2: Baseball Stats Flask API
===================================
Serves batting, pitching, and fielding data from the SQLite database.

Usage:
    python api.py

Then open: http://localhost:5000

Requirements:
    pip3 install flask flask-cors
"""

from flask import Flask, jsonify, request, send_file
import os
from flask_cors import CORS
import sqlite3
from pathlib import Path

# -------------------------------------------------
# CONFIGURATION -- edit these if needed
# -------------------------------------------------

DB_PATH = Path.home() / "Desktop" / "DiamondMine" / "baseball.db"
PORT    = 5000

# -------------------------------------------------

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=False)


def get_db():
    """Open a database connection."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row  # Returns rows as dicts
    return conn


def rows_to_list(rows):
    """Convert sqlite3 rows to a list of dicts."""
    return [dict(row) for row in rows]


# ── Headshot image server ─────────────────────────────────────────────────────

@app.route("/headshot")
def serve_headshot():
    """Serve a headshot image from the local filesystem by path."""
    path = request.args.get("path")
    if not path or not os.path.exists(path):
        return jsonify({"error": "image not found"}), 404
    return send_file(path, mimetype="image/jpeg")


# ── Health check ──────────────────────────────────

@app.route("/")
def index():
    return jsonify({"status": "ok", "message": "Baseball API is running"})


# ── Seasons ───────────────────────────────────────

@app.route("/seasons")
def get_seasons():
    """Return all available seasons."""
    conn = get_db()
    rows = conn.execute("SELECT DISTINCT season FROM batting ORDER BY season").fetchall()
    conn.close()
    return jsonify([row["season"] for row in rows])


# ── Players ───────────────────────────────────────

@app.route("/players")
def get_players():
    """Return all unique player names, optionally filtered by season."""
    season = request.args.get("season")
    conn = get_db()
    if season:
        rows = conn.execute(
            "SELECT DISTINCT name FROM batting WHERE season = ? ORDER BY name", (season,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT DISTINCT name FROM batting ORDER BY name"
        ).fetchall()
    conn.close()
    return jsonify([row["name"] for row in rows])


# ── Batting ───────────────────────────────────────

@app.route("/batting")
def get_batting():
    """
    Return batting stats.
    Query params:
        season  -- filter by year e.g. ?season=2022
        player  -- filter by name e.g. ?player=Mike Trout
        limit   -- max rows to return (default 100)
    """
    season = request.args.get("season")
    player = request.args.get("player")
    limit  = request.args.get("limit", 100)

    query  = "SELECT * FROM batting WHERE 1=1"
    params = []

    if season:
        query += " AND season = ?"
        params.append(season)
    if player:
        query += " AND name LIKE ?"
        params.append(f"%{player}%")

    query += f" LIMIT ?"
    params.append(limit)

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


# ── Pitching ──────────────────────────────────────

@app.route("/pitching")
def get_pitching():
    """
    Return pitching stats.
    Query params:
        season  -- filter by year
        player  -- filter by name
        limit   -- max rows (default 100)
    """
    season = request.args.get("season")
    player = request.args.get("player")
    limit  = request.args.get("limit", 100)

    query  = "SELECT * FROM pitching WHERE 1=1"
    params = []

    if season:
        query += " AND season = ?"
        params.append(season)
    if player:
        query += " AND name LIKE ?"
        params.append(f"%{player}%")

    query += " LIMIT ?"
    params.append(limit)

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


# ── Fielding ──────────────────────────────────────

@app.route("/fielding")
def get_fielding():
    """
    Return fielding stats.
    Query params:
        season  -- filter by year
        player  -- filter by name
        limit   -- max rows (default 100)
    """
    season = request.args.get("season")
    player = request.args.get("player")
    limit  = request.args.get("limit", 100)

    query  = "SELECT * FROM fielding WHERE 1=1"
    params = []

    if season:
        query += " AND season = ?"
        params.append(season)
    if player:
        query += " AND name LIKE ?"
        params.append(f"%{player}%")

    query += " LIMIT ?"
    params.append(limit)

    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


# ── Player comparison ─────────────────────────────

# ── Player search (autosuggest) ───────────────────────────────────────────────

@app.route("/search/batters")
def search_batters():
    """Search batters by name. Returns name, idfg, team, position for disambiguation."""
    q       = request.args.get("q", "")
    season  = request.args.get("season")
    if len(q) < 4:
        return jsonify([])
    conn = get_db()
    if season:
        rows = conn.execute("""
            SELECT DISTINCT b.name, b.idfg,
                   b.team, pl.position
            FROM batting b
            LEFT JOIN player pl ON LOWER(pl.name) = LOWER(b.name)
            WHERE b.name LIKE ? AND b.season = ?
            AND NOT EXISTS (SELECT 1 FROM pitching p WHERE p.idfg = b.idfg)
            ORDER BY b.name LIMIT 20
        """, (f"%{q}%", season)).fetchall()
    else:
        rows = conn.execute("""
            SELECT b.name, b.idfg,
                   MAX(b.team) as team, pl.position
            FROM batting b
            LEFT JOIN player pl ON LOWER(pl.name) = LOWER(b.name)
            WHERE b.name LIKE ?
            AND NOT EXISTS (SELECT 1 FROM pitching p WHERE p.idfg = b.idfg)
            GROUP BY b.idfg
            ORDER BY b.name LIMIT 20
        """, (f"%{q}%",)).fetchall()
    conn.close()
    return jsonify([{"name": r[0], "idfg": r[1], "team": r[2], "position": r[3]} for r in rows])


@app.route("/search/pitchers")
def search_pitchers():
    """Search pitchers by name. Returns name, idfg, team, position for disambiguation."""
    q       = request.args.get("q", "")
    season  = request.args.get("season")
    if len(q) < 4:
        return jsonify([])
    conn = get_db()
    if season:
        rows = conn.execute("""
            SELECT DISTINCT p.name, p.idfg,
                   p.team, pl.position
            FROM pitching p
            LEFT JOIN player pl ON LOWER(pl.name) = LOWER(p.name)
            WHERE p.name LIKE ? AND p.season = ?
            ORDER BY p.name LIMIT 20
        """, (f"%{q}%", season)).fetchall()
    else:
        rows = conn.execute("""
            SELECT p.name, p.idfg,
                   MAX(p.team) as team, pl.position
            FROM pitching p
            LEFT JOIN player pl ON LOWER(pl.name) = LOWER(p.name)
            WHERE p.name LIKE ?
            GROUP BY p.idfg
            ORDER BY p.name LIMIT 20
        """, (f"%{q}%",)).fetchall()
    conn.close()
    return jsonify([{"name": r[0], "idfg": r[1], "team": r[2], "position": r[3]} for r in rows])


# ── Pitcher comparison ────────────────────────────────────────────────────────

@app.route("/career-stats/batter")
def career_batter():
    """Return career aggregated batting stats for a player."""
    name = request.args.get("name", "")
    if not name:
        return jsonify({"error": "name required"}), 400
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM batting WHERE name LIKE ? ORDER BY season",
        (f"%{name}%",)
    ).fetchall()
    conn.close()
    if not rows:
        return jsonify(None)
    rows = rows_to_list(rows)

    # Counting stats to sum
    counting = ["pa","ab","h","1b","2b","3b","hr","r","rbi","bb","ibb","so","hbp",
                "sf","sh","gdp","sb","cs","fb","gb","ld","iffb","ifh","bu","buh",
                "pitches","balls","strikes","idfg","barrels","hardhit","events"]
    # Rate stats to recalculate
    def safe(v): return v if v is not None else 0

    totals = {k: 0 for k in counting}
    for row in rows:
        for k in counting:
            if k in row and row[k] is not None:
                try: totals[k] += float(row[k])
                except: pass

    career = dict(rows[-1])  # base on most recent row for non-calculated fields
    career["season"] = "Career"
    career["team"] = f"{rows[0]['season']}–{rows[-1]['season']}"
    for k in counting:
        career[k] = round(totals[k]) if totals[k] == int(totals[k]) else round(totals[k], 1)

    # Recalculate rate stats
    ab   = safe(totals.get("ab"))
    pa   = safe(totals.get("pa"))
    h    = safe(totals.get("h"))
    bb   = safe(totals.get("bb"))
    hbp  = safe(totals.get("hbp"))
    sf   = safe(totals.get("sf"))
    hr   = safe(totals.get("hr"))
    so   = safe(totals.get("so"))
    s2b  = safe(totals.get("2b"))
    s3b  = safe(totals.get("3b"))
    s1b  = safe(totals.get("1b"))

    career["avg"]  = round(h / ab, 3) if ab > 0 else None
    career["obp"]  = round((h + bb + hbp) / (ab + bb + hbp + sf), 3) if (ab + bb + hbp + sf) > 0 else None
    career["slg"]  = round((s1b + 2*s2b + 3*s3b + 4*hr) / ab, 3) if ab > 0 else None
    obp = career["obp"] or 0
    slg = career["slg"] or 0
    career["ops"]  = round(obp + slg, 3)
    career["kpct"] = round(so / pa, 3) if pa > 0 else None
    career["bbpct"]= round(bb / pa, 3) if pa > 0 else None

    # WAR, wRC+, wOBA — sum WAR, average wRC+ weighted by PA
    total_war = sum(r.get("bwar") or 0 for r in rows)
    career["bwar"] = round(total_war, 1)
    pa_list = [r.get("pa") or 0 for r in rows]
    wrc_list = [r.get("wrcplus") or 0 for r in rows]
    total_pa = sum(pa_list)
    career["wrcplus"] = round(sum(w*p for w,p in zip(wrc_list,pa_list)) / total_pa) if total_pa > 0 else None
    career["wpa"] = round(sum(r.get("wpa") or 0 for r in rows), 1)
    career["clutch"] = round(sum(r.get("clutch") or 0 for r in rows), 2)

    return jsonify(career)


@app.route("/career-stats/pitcher")
def career_pitcher():
    """Return career aggregated pitching stats for a player."""
    name = request.args.get("name", "")
    if not name:
        return jsonify({"error": "name required"}), 400
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM pitching WHERE name LIKE ? ORDER BY season",
        (f"%{name}%",)
    ).fetchall()
    conn.close()
    if not rows:
        return jsonify(None)
    rows = rows_to_list(rows)

    counting = ["w","l","g","gs","cg","sho","sv","hld","bs","ip","tbf","h","r","er",
                "hr","bb","ibb","hbp","so","gs","pitches"]
    def safe(v): return v if v is not None else 0

    totals = {k: 0 for k in counting}
    for row in rows:
        for k in counting:
            if k in row and row[k] is not None:
                try: totals[k] += float(row[k])
                except: pass

    career = dict(rows[-1])
    career["season"] = "Career"
    career["team"] = f"{rows[0]['season']}–{rows[-1]['season']}"
    for k in counting:
        career[k] = round(totals[k]) if totals[k] == int(totals[k]) else round(totals[k], 1)

    ip  = safe(totals.get("ip"))
    er  = safe(totals.get("er"))
    bb  = safe(totals.get("bb"))
    so  = safe(totals.get("so"))
    h   = safe(totals.get("h"))
    tbf = safe(totals.get("tbf"))

    career["era"]   = round((er * 9) / ip, 2) if ip > 0 else None
    career["whip"]  = round((bb + h) / ip, 3) if ip > 0 else None
    career["kpct"]  = round(so / tbf, 3) if tbf > 0 else None
    career["bbpct"] = round(bb / tbf, 3) if tbf > 0 else None
    career["so9"]   = round((so * 9) / ip, 2) if ip > 0 else None
    career["bb9"]   = round((bb * 9) / ip, 2) if ip > 0 else None

    career["bwar"]   = round(sum(r.get("bwar") or 0 for r in rows), 1)
    career["wpa"]   = round(sum(r.get("wpa") or 0 for r in rows), 1)

    # FIP weighted by IP
    ip_list  = [r.get("ip") or 0 for r in rows]
    fip_list = [r.get("fip") or 0 for r in rows]
    total_ip = sum(ip_list)
    career["fip"] = round(sum(f*i for f,i in zip(fip_list,ip_list)) / total_ip, 2) if total_ip > 0 else None

    return jsonify(career)



def compare_pitchers():
    """Compare two pitchers for a given season."""
    player1 = request.args.get("player1", "")
    player2 = request.args.get("player2", "")
    season  = request.args.get("season")
    if not player1 or not player2:
        return jsonify({"error": "Please provide both player1 and player2"}), 400
    conn = get_db()
    try:
        if season:
            rows = conn.execute("""
                SELECT * FROM pitching
                WHERE (name LIKE ? OR name LIKE ?)
                AND CAST(season AS INTEGER) = CAST(? AS INTEGER)
                ORDER BY name
            """, (f"%{player1}%", f"%{player2}%", season)).fetchall()
        else:
            rows = conn.execute("""
                SELECT * FROM pitching
                WHERE (name LIKE ? OR name LIKE ?)
                ORDER BY season, name
            """, (f"%{player1}%", f"%{player2}%")).fetchall()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 400
    conn.close()
    return jsonify(rows_to_list(rows))


@app.route("/compare")
def compare_players():
    """
    Compare two players across all seasons.
    Query params:
        player1 -- first player name
        player2 -- second player name
        stat    -- table to compare: batting, pitching, or fielding (default: batting)
        season  -- optional season filter
    """
    player1 = request.args.get("player1")
    player2 = request.args.get("player2")
    stat    = request.args.get("stat", "batting")
    season  = request.args.get("season")

    if not player1 or not player2:
        return jsonify({"error": "Please provide both player1 and player2"}), 400
    if stat not in ("batting", "pitching", "fielding"):
        return jsonify({"error": "stat must be batting, pitching, or fielding"}), 400

    conn = get_db()
    try:
        if season:
            rows = conn.execute(f"""
                SELECT * FROM {stat}
                WHERE (name LIKE ? OR name LIKE ?)
                AND CAST(season AS INTEGER) = CAST(? AS INTEGER)
                ORDER BY name
            """, (f"%{player1}%", f"%{player2}%", season)).fetchall()
        else:
            rows = conn.execute(f"""
                SELECT * FROM {stat}
                WHERE name LIKE ? OR name LIKE ?
                ORDER BY season
            """, (f"%{player1}%", f"%{player2}%")).fetchall()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 400
    conn.close()
    return jsonify(rows_to_list(rows))


# ── Career stats ──────────────────────────────────

@app.route("/career/<player_name>")
def career_stats(player_name):
    """Return all seasons for a single player across batting, pitching, and fielding."""
    conn = get_db()
    result = {}
    for table in ("batting", "pitching", "fielding"):
        rows = conn.execute(
            f"SELECT * FROM {table} WHERE name LIKE ? ORDER BY season",
            (f"%{player_name}%",)
        ).fetchall()
        result[table] = rows_to_list(rows)
    conn.close()
    return jsonify(result)


# ── Top performers ────────────────────────────────

@app.route("/leaderboard")
def leaderboard():
    """
    Return top performers for a given stat column.
    Query params:
        season  -- year (required)
        table   -- batting, pitching, or fielding (default: batting)
        stat    -- column to sort by (default: war)
        limit   -- number of results (default: 10)
        order   -- asc or desc (default: desc)
    """
    season = request.args.get("season")
    table  = request.args.get("table", "batting")
    stat   = request.args.get("stat", "bwar")
    limit  = request.args.get("limit", 10)
    order  = request.args.get("order", "desc").upper()

    if not season:
        return jsonify({"error": "season is required"}), 400
    if table not in ("batting", "pitching", "fielding"):
        return jsonify({"error": "table must be batting, pitching, or fielding"}), 400
    if order not in ("ASC", "DESC"):
        return jsonify({"error": "order must be asc or desc"}), 400

    conn = get_db()
    try:
        rows = conn.execute(
            f"SELECT * FROM {table} WHERE season = ? AND {stat} IS NOT NULL "
            f"ORDER BY CAST({stat} AS REAL) {order} LIMIT ?",
            (season, limit)
        ).fetchall()
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 400

    conn.close()
    return jsonify(rows_to_list(rows))


# ── 2026 Projections ──────────────────────────────────────────────────────────

# Age curve coefficients — peak at 27, decline rate per year
# Based on standard baseball aging curves
def age_factor(age):
    if age is None:
        return 1.0
    peak = 27
    if age <= peak:
        return 1.0 + (peak - age) * 0.008   # slight upward trend approaching peak
    else:
        decline = age - peak
        if decline <= 5:   return 1.0 - decline * 0.015
        elif decline <= 10: return 1.0 - 0.075 - (decline - 5) * 0.025
        else:               return max(0.5, 1.0 - 0.075 - 0.125 - (decline - 10) * 0.04)

def weighted_avg(values, weights):
    """Weighted average, ignoring None values."""
    pairs = [(v, w) for v, w in zip(values, weights) if v is not None]
    if not pairs: return None
    total_w = sum(w for _, w in pairs)
    return sum(v * w for v, w in pairs) / total_w if total_w > 0 else None

def get_player_age(name, season, conn):
    """Estimate age from birth year if available, else return None."""
    try:
        row = conn.execute(
            "SELECT birth_year FROM player WHERE LOWER(name) = LOWER(?)", (name,)
        ).fetchone()
        if row and row[0]:
            return season - int(row[0])
    except Exception:
        pass
    return None

@app.route("/project")
def project_player():
    """
    Project 2026 stats for a player using weighted recent seasons + age curve.
    Query params:
        name -- player name
        type -- 'batter' or 'pitcher' (default: batter)
    """
    name  = request.args.get("name", "")
    ptype = request.args.get("type", "batter")
    if not name:
        return jsonify({"error": "name required"}), 400

    conn  = get_db()
    table = "batting" if ptype == "batter" else "pitching"

    # Fetch last 5 seasons of data
    rows = conn.execute(f"""
        SELECT * FROM {table}
        WHERE name LIKE ? AND season >= 2020
        ORDER BY season DESC LIMIT 5
    """, (f"%{name}%",)).fetchall()

    if not rows:
        # Try broader search
        rows = conn.execute(f"""
            SELECT * FROM {table}
            WHERE name LIKE ?
            ORDER BY season DESC LIMIT 5
        """, (f"%{name}%",)).fetchall()

    conn.close()

    if not rows:
        return jsonify({"error": f"No data found for {name}"}), 404

    rows = rows_to_list(rows)
    seasons = [r["season"] for r in rows]
    latest_season = max(seasons)
    player_name = rows[0]["name"]

    # Weights: most recent = 3, second = 2, third = 1, older = 0.5
    weight_map = {0: 3, 1: 2, 2: 1, 3: 0.5, 4: 0.5}
    weights = [weight_map.get(i, 0.5) for i in range(len(rows))]

    # Estimate age for 2026
    projected_age = None
    for row in rows:
        if row.get("age"):
            try:
                age_in_season = int(row["age"])
                season_diff = 2026 - row["season"]
                projected_age = age_in_season + season_diff
                break
            except Exception:
                pass

    af = age_factor(projected_age)

    def project_stat(stat, is_rate=False, lower_better=False):
        vals = [r.get(stat) for r in rows]
        base = weighted_avg(vals, weights)
        if base is None:
            return None
        adjusted = base * af if not lower_better else base * (2 - af)
        return adjusted

    # Build projection
    proj = {
        "name":            player_name,
        "projected_season": 2026,
        "projected_age":   projected_age,
        "age_factor":      round(af, 3),
        "seasons_used":    sorted(seasons, reverse=True)[:3],
        "method":          "Weighted (3/2/1) + Age Curve"
    }

    if ptype == "batter":
        counting_stats = ["pa","ab","hr","r","rbi","bb","so","sb","h","2b","3b"]
        rate_stats     = {"avg": False, "obp": False, "slg": False, "ops": False,
                          "wrcplus": False, "bwar": False, "babip": False,
                          "kpct": True, "bbpct": False, "wpa": False, "ops": False}

        for s in counting_stats:
            v = project_stat(s)
            proj[s] = round(v) if v is not None else None

        for s, lower in rate_stats.items():
            v = project_stat(s, is_rate=True, lower_better=lower)
            if v is not None:
                proj[s] = round(v, 3) if s in ("avg","obp","slg","ops","babip","kpct","bbpct") else round(v, 1)
            else:
                proj[s] = None

        # Recalculate OPS from projected OBP + SLG
        if proj.get("obp") and proj.get("slg"):
            proj["ops"] = round(proj["obp"] + proj["slg"], 3)

    else:  # pitcher
        counting_stats = ["w","l","g","gs","sv","so","bb","h","er","ip"]
        rate_stats     = {"era": True, "whip": True, "fip": True,
                          "bwar": False, "kpct": False, "bbpct": True,
                          "so9": False, "bb9": True}

        for s in counting_stats:
            v = project_stat(s)
            proj[s] = round(v) if v is not None else None

        for s, lower in rate_stats.items():
            v = project_stat(s, is_rate=True, lower_better=lower)
            if v is not None:
                proj[s] = round(v, 2) if s in ("era","whip","fip","so9","bb9") else round(v, 3)
            else:
                proj[s] = None

    return jsonify(proj)


@app.route("/project/leaderboard")
def projection_leaderboard():
    """
    Return 2026 projections for top N players by a given stat.
    Query params:
        type  -- 'batter' or 'pitcher'
        stat  -- stat to rank by (default: war)
        limit -- number of players (default: 25)
    """
    ptype = request.args.get("type", "batter")
    stat  = request.args.get("stat", "bwar")
    limit = int(request.args.get("limit", 25))
    table = "batting" if ptype == "batter" else "pitching"

    conn  = get_db()

    # Get players with enough recent data (at least 2 seasons since 2021)
    rows = conn.execute(f"""
        SELECT name, COUNT(DISTINCT season) as seasons
        FROM {table}
        WHERE season >= 2021
        GROUP BY name
        HAVING seasons >= 2
        ORDER BY MAX({stat}) DESC
        LIMIT 200
    """).fetchall()
    conn.close()

    candidates = [r[0] for r in rows]
    projections = []

    for name in candidates:
        try:
            import urllib.request
            url = f"http://localhost:{PORT}/project?name={urllib.parse.quote(name)}&type={ptype}"
            with urllib.request.urlopen(url, timeout=3) as r:
                import json as json_lib
                proj = json_lib.loads(r.read())
                if proj.get(stat) is not None:
                    projections.append(proj)
        except Exception:
            pass

    # Sort by stat
    lower_better = stat in ("era", "whip", "fip", "bb9", "kpct", "bbpct")
    projections.sort(key=lambda x: x.get(stat) or 0, reverse=not lower_better)

    return jsonify(projections[:limit])


# ── Fantasy Points ────────────────────────────────────────────────────────────

@app.route("/fantasy/settings")
def fantasy_settings():
    """List all scoring settings."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM scoring_settings ORDER BY id").fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


@app.route("/fantasy/player")
def fantasy_player():
    """
    Return full fantasy point history for a player.
    Params: name, settings_id (default 1), idfg (optional, for disambiguation)
    """
    name        = request.args.get("name", "")
    settings_id = request.args.get("settings_id", 1)
    idfg        = request.args.get("idfg")
    if not name and not idfg:
        return jsonify({"error": "name or idfg required"}), 400

    conn = get_db()

    if idfg:
        rows = conn.execute("""
            SELECT fp.*, p.headshot
            FROM fantasy_points fp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(fp.player_name)
            WHERE fp.idfg = ? AND fp.settings_id = ?
            ORDER BY fp.season
        """, (idfg, settings_id)).fetchall()
    else:
        # Try exact idfg match first via batting table
        idfg_row = conn.execute(
            "SELECT idfg FROM batting WHERE name LIKE ? AND idfg IS NOT NULL LIMIT 1",
            (f"%{name}%",)
        ).fetchone()
        if not idfg_row:
            idfg_row = conn.execute(
                "SELECT idfg FROM pitching WHERE name LIKE ? AND idfg IS NOT NULL LIMIT 1",
                (f"%{name}%",)
            ).fetchone()

        if idfg_row:
            rows = conn.execute("""
                SELECT fp.*, p.headshot
                FROM fantasy_points fp
                LEFT JOIN player p ON LOWER(p.name) = LOWER(fp.player_name)
                WHERE fp.idfg = ? AND fp.settings_id = ?
                ORDER BY fp.season
            """, (idfg_row[0], settings_id)).fetchall()
        else:
            rows = conn.execute("""
                SELECT fp.*, p.headshot
                FROM fantasy_points fp
                LEFT JOIN player p ON LOWER(p.name) = LOWER(fp.player_name)
                WHERE fp.player_name LIKE ? AND fp.settings_id = ?
                ORDER BY fp.season
            """, (f"%{name}%", settings_id)).fetchall()
    conn.close()

    if not rows:
        return jsonify({"error": f"No fantasy data found for {name}"}), 404

    data = rows_to_list(rows)
    player_name = data[0]["player_name"]
    position    = data[0].get("position")
    headshot    = data[0].get("headshot")

    # Career total
    career_total = round(sum(r["total_points"] for r in data), 2)

    # Career avg per game
    total_pts = sum(r["total_points"] for r in data)
    total_g   = sum(r["g"] or 0 for r in data)
    career_avg_per_game = round(total_pts / total_g, 2) if total_g > 0 else None

    # Peak season
    peak = max(data, key=lambda r: r["total_points"])

    # Best consecutive 3-season peak
    best3 = {"total": None, "seasons": [], "avg": None}
    if len(data) >= 3:
        best_total = -999999
        for i in range(len(data) - 2):
            trio = data[i:i+3]
            # Must be consecutive seasons
            if trio[1]["season"] - trio[0]["season"] == 1 and trio[2]["season"] - trio[1]["season"] == 1:
                trio_total = sum(r["total_points"] for r in trio)
                if trio_total > best_total:
                    best_total = trio_total
                    best3 = {
                        "total": round(trio_total, 2),
                        "seasons": [r["season"] for r in trio],
                        "avg": round(trio_total / 3, 2)
                    }

    return jsonify({
        "name":              player_name,
        "position":          position,
        "headshot":          headshot,
        "seasons":           data,
        "career_total":      career_total,
        "career_avg_per_game": career_avg_per_game,
        "career_games":      total_g,
        "peak_season":       peak,
        "best_3yr":          best3,
    })


@app.route("/fantasy/last-year")
def fantasy_last_year():
    """
    Return 2025 fantasy stats for a player including position ranking
    and comparison against top 12 at their position.
    Params: name, settings_id (default 1)
    """
    name        = request.args.get("name", "")
    settings_id = request.args.get("settings_id", 1)
    LAST_YEAR   = 2025

    if not name:
        return jsonify({"error": "name required"}), 400

    conn = get_db()

    # Resolve idfg first for clean disambiguation
    idfg_row = conn.execute(
        "SELECT idfg FROM batting WHERE name LIKE ? AND idfg IS NOT NULL LIMIT 1",
        (f"%{name}%",)
    ).fetchone()
    if not idfg_row:
        idfg_row = conn.execute(
            "SELECT idfg FROM pitching WHERE name LIKE ? AND idfg IS NOT NULL LIMIT 1",
            (f"%{name}%",)
        ).fetchone()

    if idfg_row:
        row = conn.execute("""
            SELECT fp.*, p.headshot
            FROM fantasy_points fp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(fp.player_name)
            WHERE fp.idfg = ? AND fp.settings_id = ? AND fp.season = ?
        """, (idfg_row[0], settings_id, LAST_YEAR)).fetchone()
    else:
        row = conn.execute("""
            SELECT fp.*, p.headshot
            FROM fantasy_points fp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(fp.player_name)
            WHERE fp.player_name LIKE ? AND fp.settings_id = ? AND fp.season = ?
        """, (f"%{name}%", settings_id, LAST_YEAR)).fetchone()

    if not row:
        conn.close()
        return jsonify({"error": f"No 2025 data found for {name}"}), 404

    row = dict(row)
    position = row.get("position")

    # Top 12 at position in 2025
    top12 = conn.execute("""
        SELECT player_name, total_points, fp_per_game, g
        FROM fantasy_points
        WHERE settings_id = ? AND season = ? AND position = ?
        ORDER BY total_points DESC LIMIT 12
    """, (settings_id, LAST_YEAR, position)).fetchall()
    top12 = rows_to_list(top12)

    # Position ranking
    pos_rank_row = conn.execute("""
        SELECT COUNT(*) + 1 as rank FROM fantasy_points
        WHERE settings_id = ? AND season = ? AND position = ?
        AND total_points > ?
    """, (settings_id, LAST_YEAR, position, row["total_points"])).fetchone()
    pos_rank = pos_rank_row[0] if pos_rank_row else None

    # Top 12 mean
    top12_mean = round(sum(r["total_points"] for r in top12) / len(top12), 2) if top12 else None
    premium_pct = None
    if top12_mean and top12_mean != 0:
        premium_pct = round(((row["total_points"] - top12_mean) / abs(top12_mean)) * 100, 1)

    # Games missed (162 - g)
    g = row.get("g") or 0
    games_missed   = 162 - g
    pct_played     = round((g / 162) * 100, 1)

    conn.close()

    return jsonify({
        "name":           row["player_name"],
        "position":       position,
        "headshot":       row.get("headshot"),
        "season":         LAST_YEAR,
        "total_points":   row["total_points"],
        "fp_per_game":    row["fp_per_game"],
        "g":              g,
        "games_missed":   games_missed,
        "pct_played":     pct_played,
        "pos_rank":       pos_rank,
        "top12_mean":     top12_mean,
        "premium_pct":    premium_pct,
        "top12":          top12,
    })


# ── Fantasy leaderboard ────────────────────────────────────────────────────────

@app.route("/fantasy/leaderboard")
def fantasy_leaderboard():
    """
    Top fantasy point performers for a given season and position.
    Params: season, position (optional), settings_id (default 1), limit (default 25)
    """
    season      = request.args.get("season", 2025)
    position    = request.args.get("position")
    settings_id = request.args.get("settings_id", 1)
    limit       = int(request.args.get("limit", 25))

    conn = get_db()
    if position:
        rows = conn.execute("""
            SELECT fp.*, p.headshot FROM fantasy_points fp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(fp.player_name)
            WHERE fp.settings_id=? AND fp.season=? AND fp.position=?
            ORDER BY fp.total_points DESC LIMIT ?
        """, (settings_id, season, position, limit)).fetchall()
    else:
        rows = conn.execute("""
            SELECT fp.*, p.headshot FROM fantasy_points fp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(fp.player_name)
            WHERE fp.settings_id=? AND fp.season=?
            ORDER BY fp.total_points DESC LIMIT ?
        """, (settings_id, season, limit)).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


# ── 2026 Projections ──────────────────────────────────────────────────────────

@app.route("/projections/2026/batters")
def projections_2026_batters():
    """
    Return 2026 batting projections with position filter.
    Uses proj_position + is_dh columns.
    DH filter returns all players where is_dh=1 OR proj_position='DH'.
    Params: position (C/1B/2B/3B/SS/OF/DH/ALL), limit
    """
    position = request.args.get("position", "ALL").upper()
    limit    = int(request.args.get("limit", 50))

    conn = get_db()

    if position == "ALL":
        rows = conn.execute("""
            SELECT pb.*, p.headshot
            FROM projections_2026_batting pb
            LEFT JOIN player p ON LOWER(p.name) = LOWER(pb.name)
            WHERE pb.proj_position NOT IN ('P', 'UNK') AND pb.proj_position IS NOT NULL
            ORDER BY pb.fantasy_pts DESC LIMIT ?
        """, (limit,)).fetchall()
    elif position == "DH":
        rows = conn.execute("""
            SELECT pb.*, p.headshot
            FROM projections_2026_batting pb
            LEFT JOIN player p ON LOWER(p.name) = LOWER(pb.name)
            WHERE pb.is_dh = 1 OR pb.proj_position = 'DH'
            ORDER BY pb.fantasy_pts DESC LIMIT ?
        """, (limit,)).fetchall()
    else:
        rows = conn.execute("""
            SELECT pb.*, p.headshot
            FROM projections_2026_batting pb
            LEFT JOIN player p ON LOWER(p.name) = LOWER(pb.name)
            WHERE pb.proj_position = ?
            ORDER BY pb.fantasy_pts DESC LIMIT ?
        """, (position, limit)).fetchall()

    conn.close()
    return jsonify(rows_to_list(rows))


@app.route("/projections/2026/pitchers")
def projections_2026_pitchers():
    """
    Return 2026 pitching projections.
    Params: role (SP/RP/ALL, default ALL), limit (default 50)
    SP = GS > 0, RP = GS = 0
    """
    role  = request.args.get("role", "ALL").upper()
    limit = int(request.args.get("limit", 50))

    conn = get_db()

    if role == "SP":
        rows = conn.execute("""
            SELECT pp.*, p.headshot
            FROM projections_2026_pitching pp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(pp.name)
            WHERE pp.gs > 0
            ORDER BY pp.fantasy_pts DESC LIMIT ?
        """, (limit,)).fetchall()
    elif role == "RP":
        rows = conn.execute("""
            SELECT pp.*, p.headshot
            FROM projections_2026_pitching pp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(pp.name)
            WHERE pp.gs = 0
            ORDER BY pp.fantasy_pts DESC LIMIT ?
        """, (limit,)).fetchall()
    else:
        rows = conn.execute("""
            SELECT pp.*, p.headshot
            FROM projections_2026_pitching pp
            LEFT JOIN player p ON LOWER(p.name) = LOWER(pp.name)
            ORDER BY pp.fantasy_pts DESC LIMIT ?
        """, (limit,)).fetchall()

    conn.close()
    return jsonify(rows_to_list(rows))


# ── Read-only SQL query endpoint (for data viz artifacts) ─────────────────────

@app.route("/query", methods=["POST", "OPTIONS"])
def run_query():
    """
    Execute a read-only SQL query and return results as JSON.
    Only SELECT statements are permitted.
    """
    if request.method == "OPTIONS":
        resp = app.make_default_options_response()
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        return resp

    body = request.get_json(force=True, silent=True) or {}
    sql  = (body.get("sql") or "").strip()

    if not sql:
        return jsonify({"error": "no sql provided"}), 400

    first_word = sql.split()[0].upper() if sql.split() else ""
    if first_word not in ("SELECT", "PRAGMA", "WITH"):
        return jsonify({"error": "only SELECT statements are permitted"}), 403

    conn = get_db()
    try:
        rows = conn.execute(sql).fetchall()
        conn.close()
        resp = jsonify(rows_to_list(rows))
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp
    except Exception as e:
        conn.close()
        resp = jsonify({"error": str(e)})
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp, 400


# ── DRS Endpoints ──────────────────────────────────────────────────────────────

@app.route("/drs/player")
def drs_player():
    """Career DRS by season for a player. Params: name, idfg (optional)"""
    name = request.args.get("name","").strip()
    idfg = request.args.get("idfg", None)
    if not name:
        return jsonify({"error": "name required"}), 400
    conn = get_db()
    if idfg:
        rows = conn.execute("""
            SELECT d.season, d.g, d.inn, d.art, d.gfpdm, d.sb,
                   d.of_arm, d.bunt, d.gdp, d.adj_er, d.strike_zone, d.total
            FROM drs d
            JOIN player p ON p.sis_player_id = d.player_id
            WHERE p.idfg = ? ORDER BY d.season
        """, (idfg,)).fetchall()
    else:
        rows = conn.execute("""
            SELECT d.season, d.g, d.inn, d.art, d.gfpdm, d.sb,
                   d.of_arm, d.bunt, d.gdp, d.adj_er, d.strike_zone, d.total
            FROM drs d
            JOIN player p ON p.sis_player_id = d.player_id
            WHERE LOWER(p.name) = LOWER(?) ORDER BY d.season
        """, (name,)).fetchall()
    if not rows:
        rows = conn.execute("""
            SELECT season, g, inn, art, gfpdm, sb,
                   of_arm, bunt, gdp, adj_er, strike_zone, total
            FROM drs WHERE LOWER(player) = LOWER(?) ORDER BY season
        """, (name,)).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))


@app.route("/drs/leaderboard")
def drs_leaderboard():
    """DRS leaderboard for a season. Params: season, limit"""
    season = request.args.get("season", 2024)
    limit  = int(request.args.get("limit", 50))
    conn   = get_db()
    rows   = conn.execute("""
        SELECT d.player, d.season, d.g, d.inn, d.art, d.gfpdm,
               d.sb, d.of_arm, d.bunt, d.gdp, d.adj_er, d.strike_zone,
               d.total, p.headshot
        FROM drs d
        LEFT JOIN player p ON p.sis_player_id = d.player_id
        WHERE d.season = ?
        ORDER BY d.total DESC LIMIT ?
    """, (season, limit)).fetchall()
    conn.close()
    return jsonify(rows_to_list(rows))




# ─────────────────────────────────────────────────

if __name__ == "__main__":
    if not DB_PATH.exists():
        print(f"\nERROR: Database not found at {DB_PATH}")
        print("Please run load_to_db_no_statcast.py first.\n")
    else:
        print(f"\nBaseball API running at http://localhost:{PORT}")
        print("  GET /drs/leaderboard?season=2024&limit=50")
        print("  GET /drs/player?name=Mookie+Betts")
        print("\nPress Ctrl+C to stop\n")
        app.run(debug=True, port=PORT)
