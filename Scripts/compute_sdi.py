"""
compute_sdi.py — Pre-compute SDI for all 2026 players and store in sdi_2026 table.
Run after each DB update. Results are served instantly by the API.

Usage:
  python3 compute_sdi.py
  python3 compute_sdi.py --year 2026
"""

import sqlite3, unicodedata, re, argparse, logging, json
from pathlib import Path
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

DB_PATH = Path.home() / "Desktop" / "DiamondMinev2" / "diamondmine.db"
TODAY   = datetime.now().strftime("%Y-%m-%d")

# ── Stabilization S-values ────────────────────────────────────────────────────
# S = PA/BF where signal == noise (Bayesian 50/50 split)
# Sources: Albert (2004), Carlin & Louis, BaseballProspectus research
BATTER_S = {
    "contact": {
        "k_pct":        40,   # Contact hitters have low variance K%
        "bb_pct":       120,
        "xwoba":        150,
        "barrel_pct":   80,
        "hard_hit_pct": 60,
    },
    "tto": {
        "k_pct":        80,   # TTO hitters have high variance K%
        "bb_pct":       80,
        "xwoba":        100,
        "barrel_pct":   30,   # Power hitters barrel consistently
        "hard_hit_pct": 50,
    }
}

PITCHER_S = {
    "power": {
        "k_9":  50,
        "bb_9": 150,
        "era":  200,
        "whip": 150,
    },
    "finesse": {
        "k_9":  90,
        "bb_9": 120,
        "era":  200,
        "whip": 150,
    }
}

def safe_float(v):
    try:
        f = float(v)
        return None if f != f else f  # NaN check
    except: return None

def create_sdi_table(conn):
    conn.execute("""
        CREATE TABLE IF NOT EXISTS sdi_2026 (
            name            TEXT,
            season          INTEGER,
            team            TEXT,
            role            TEXT,  -- 'batter' or 'pitcher'
            archetype       TEXT,
            overall_confidence REAL,
            signal          TEXT,  -- 'breakout', 'regression', 'noise', 'stable'
            metrics_json    TEXT,  -- JSON blob of per-metric details
            career_pa       REAL,
            career_ip       REAL,
            career_seasons  INTEGER,
            net_sdi         REAL,
            computed_at     TEXT,
            PRIMARY KEY (name, season, team, role)
        )
    """)
    conn.commit()

def compute_batter_sdi(conn, row, season):
    name    = row["name"]
    curr_pa = row.get("pa") or 0
    if curr_pa < 20:
        return None

    career = conn.execute("""
        SELECT
            -- PA-weighted averages: full seasons count more than partial/short seasons
            SUM(COALESCE(k_pct, CASE WHEN pa > 0 THEN CAST(so AS REAL)/pa*100 END) * pa) /
                NULLIF(SUM(pa),0)                                                      k_pct,
            SUM(COALESCE(bb_pct, CASE WHEN pa > 0 THEN CAST(bb AS REAL)/pa*100 END) * pa) /
                NULLIF(SUM(pa),0)                                                      bb_pct,
            SUM(CASE WHEN xwoba IS NOT NULL AND xwoba > 0 THEN xwoba * pa END) /
                NULLIF(SUM(CASE WHEN xwoba IS NOT NULL AND xwoba > 0 THEN pa END),0)   xwoba,
            SUM(CASE WHEN barrel_pct IS NOT NULL AND barrel_pct > 0 THEN barrel_pct * pa END) /
                NULLIF(SUM(CASE WHEN barrel_pct IS NOT NULL AND barrel_pct > 0 THEN pa END),0) barrel_pct,
            SUM(CASE WHEN hard_hit_pct IS NOT NULL AND hard_hit_pct > 0 THEN hard_hit_pct * pa END) /
                NULLIF(SUM(CASE WHEN hard_hit_pct IS NOT NULL AND hard_hit_pct > 0 THEN pa END),0) hard_hit_pct,
            SUM(CASE WHEN ev IS NOT NULL AND ev > 0 THEN ev * pa END) /
                NULLIF(SUM(CASE WHEN ev IS NOT NULL AND ev > 0 THEN pa END),0)         ev,
            SUM(CASE WHEN opsplus IS NOT NULL THEN opsplus * pa END) /
                NULLIF(SUM(CASE WHEN opsplus IS NOT NULL THEN pa END),0)               opsplus,
            SUM(CASE WHEN avg IS NOT NULL THEN avg * pa END) /
                NULLIF(SUM(CASE WHEN avg IS NOT NULL THEN pa END),0)                   avg_career,
            SUM(pa) career_pa,
            COUNT(season) seasons
        FROM batting
        WHERE LOWER(name) = LOWER(?) AND season < ?
    """, (name, season)).fetchone()

    if not career or not career["career_pa"] or career["career_pa"] < 50:
        return None  # Rookie or insufficient history

    career = dict(career)

    # Compute k_pct / bb_pct from raw if null (some rows only have calc versions)
    if career.get("k_pct") is None:
        career["k_pct"] = None  # will be skipped in metric loop

    # Compute k_pct / bb_pct from raw counts if null
    curr_pa = row.get("pa") or 0
    if row.get("k_pct") is None and curr_pa > 0:
        row["k_pct"] = round((row.get("so") or 0) / curr_pa * 100, 1)
    if row.get("bb_pct") is None and curr_pa > 0:
        row["bb_pct"] = round((row.get("bb") or 0) / curr_pa * 100, 1)

    # Archetype detection
    k_pct_career = safe_float(career.get("k_pct")) or 20
    hr_pa = (row.get("hr") or 0) / max(curr_pa, 1)
    archetype = "tto" if (k_pct_career > 22 or hr_pa * 600 > 25) else "contact"
    s_map = dict(BATTER_S[archetype])

    # Add standard stats that are always available from BRef
    s_map["opsplus"] = 200  # OPS+ stabilizes slowly but always available
    s_map["ev"]      = 100  # Exit velo stabilizes quickly when available

    metrics = {}
    total_w = 0
    n = 0

    for metric, s_val in s_map.items():
        curr_val   = safe_float(row.get(metric))
        career_val = safe_float(career.get(metric))
        if curr_val is None or career_val is None or career_val == 0:
            continue

        weight  = curr_pa / (curr_pa + s_val)
        raw_dev = curr_val - career_val
        if metric == "k_pct":  # Lower K% is better for batters
            raw_dev = -raw_dev
        sustained = raw_dev * weight

        metrics[metric] = {
            "current":             round(curr_val, 3),
            "career":              round(career_val, 3),
            "reliability_pct":     round(weight * 100, 1),
            "raw_deviation":       round(raw_dev, 4),
            "sustained_deviation": round(sustained, 4),
        }
        total_w += weight
        n += 1

    if n < 2:  # Need at least 2 metrics
        return None

    overall_confidence = round((total_w / n) * 100, 1)

    # Normalize each metric to its typical range so no single metric dominates
    # Metric weights: productive output >> discipline metrics
    # OPS+/xwOBA/EV/Barrel% are the signal; K%/BB% are early-season noise
    BATTER_RANGES  = {
        "k_pct":        15.0,
        "bb_pct":       10.0,
        "xwoba":        0.15,
        "barrel_pct":   12.0,
        "hard_hit_pct": 25.0,
        "opsplus":      80.0,
        "ev":           8.0,
    }
    BATTER_WEIGHTS = {
        "opsplus":      3.0,   # Primary output signal
        "xwoba":        3.0,   # Primary output signal
        "barrel_pct":   2.0,   # Quality of contact — predictive
        "hard_hit_pct": 2.0,   # Quality of contact
        "ev":           1.5,   # Contact quality proxy
        "bb_pct":       0.75,  # Discipline — noisier early
        "k_pct":        0.5,   # Most volatile early-season stat
    }
    normalized_devs = []
    weight_sum = 0.0
    for key, m in metrics.items():
        rang   = BATTER_RANGES.get(key, 1.0)
        weight = BATTER_WEIGHTS.get(key, 1.0)
        norm_dev = m["sustained_deviation"] / rang
        normalized_devs.append(norm_dev * weight)
        weight_sum += weight
        metrics[key]["normalized_deviation"] = round(norm_dev, 4)

    net_sdi = round(sum(normalized_devs) / weight_sum, 4) if weight_sum > 0 else 0

    if net_sdi > 0.02:
        signal = "breakout"
    elif net_sdi < -0.02:
        signal = "regression"
    else:
        signal = "stable"

    return {
        "archetype":          archetype,
        "overall_confidence": overall_confidence,
        "signal":             signal,
        "metrics":            metrics,
        "net_sdi":            net_sdi,
        "career_pa":          career["career_pa"],
        "career_seasons":     career["seasons"],
    }


def compute_pitcher_sdi(conn, row, season):
    name   = row["name"]
    curr_ip = row.get("ip") or 0
    if curr_ip < 5:
        return None

    career = conn.execute("""
        SELECT
            -- IP-weighted averages: full seasons count more than partial seasons
            -- For rate stats, we aggregate totals then compute rate (more accurate than avg of rates)
            SUM(so) * 9.0 / NULLIF(SUM(ip),0)                                          k_9,
            SUM(bb) * 9.0 / NULLIF(SUM(ip),0)                                          bb_9,
            SUM(er) * 9.0 / NULLIF(SUM(ip),0)                                          era,
            (SUM(h) + SUM(bb)) * 1.0 / NULLIF(SUM(ip),0)                              whip,
            SUM(ip) career_ip,
            COUNT(season) seasons
        FROM pitching
        WHERE LOWER(name) = LOWER(?) AND season < ?
    """, (name, season)).fetchone()

    if not career or not career["career_ip"] or career["career_ip"] < 10:
        return None

    career = dict(career)

    k9_career  = safe_float(career.get("k_9")) or 7
    archetype  = "power" if k9_career > 9 else "finesse"
    s_map      = PITCHER_S[archetype]
    curr_bf    = curr_ip * 3.7  # Estimate batters faced from IP

    metrics = {}
    total_w = 0
    n = 0

    # Compute current k_9 / bb_9 / whip from raw totals for accuracy
    curr_row_full = conn.execute("""
        SELECT SUM(so) so, SUM(bb) bb, SUM(h) h, SUM(er) er, SUM(ip) ip
        FROM pitching WHERE LOWER(name)=LOWER(?) AND season=?
    """, (name, season)).fetchone()
    if curr_row_full and curr_row_full["ip"] and curr_row_full["ip"] > 0:
        ip_ = curr_row_full["ip"]
        row = dict(row)
        row["k_9"]  = round(curr_row_full["so"] * 9.0 / ip_, 2)
        row["bb_9"] = round(curr_row_full["bb"] * 9.0 / ip_, 2)
        row["whip"] = round((curr_row_full["h"] + curr_row_full["bb"]) / ip_, 3)
        row["era"]  = round(curr_row_full["er"] * 9.0 / ip_, 2)

    for metric, s_val in s_map.items():
        curr_val   = safe_float(row.get(metric))
        career_val = safe_float(career.get(metric))
        if curr_val is None or career_val is None:
            continue

        weight  = curr_bf / (curr_bf + s_val)
        raw_dev = curr_val - career_val
        # Invert: lower ERA/WHIP/BB9 = better
        if metric in ("era", "whip", "bb_9"):
            raw_dev = -raw_dev
        sustained = raw_dev * weight

        metrics[metric] = {
            "current":             round(curr_val, 3),
            "career":              round(career_val, 3),
            "reliability_pct":     round(weight * 100, 1),
            "raw_deviation":       round(raw_dev, 4),
            "sustained_deviation": round(sustained, 4),
        }
        total_w += weight
        n += 1

    if n == 0:
        return None

    overall_confidence = round((total_w / n) * 100, 1)
    pos_sdi = sum(1 for m in metrics.values() if m["sustained_deviation"] > 0.005)
    neg_sdi = sum(1 for m in metrics.values() if m["sustained_deviation"] < -0.005)

    pos_raw_devs = [abs(m["raw_deviation"]) for m in metrics.values() if m["raw_deviation"] > 0.01]
    avg_pos_raw  = sum(pos_raw_devs) / len(pos_raw_devs) if pos_raw_devs else 0

    PITCHER_RANGES  = {
        "k_9":  3.0,
        "bb_9": 2.0,
        "era":  2.5,
        "whip": 0.4,
    }
    PITCHER_WEIGHTS = {
        "era":  3.0,   # Primary outcome — but high noise early
        "k_9":  2.5,   # Stabilizes faster than ERA, strong signal
        "whip": 2.0,   # Composite contact+control quality
        "bb_9": 1.0,   # Control metric — noisier early
    }
    normalized_devs = []
    weight_sum = 0.0
    for key, m in metrics.items():
        rang   = PITCHER_RANGES.get(key, 1.0)
        weight = PITCHER_WEIGHTS.get(key, 1.0)
        norm_dev = m["sustained_deviation"] / rang
        normalized_devs.append(norm_dev * weight)
        weight_sum += weight
        metrics[key]["normalized_deviation"] = round(norm_dev, 4)

    net_sdi = round(sum(normalized_devs) / weight_sum, 4) if weight_sum > 0 else 0

    pos_sdi = sum(1 for v in normalized_devs if v > 0.01)
    neg_sdi = sum(1 for v in normalized_devs if v < -0.01)

    if net_sdi > 0.02:
        signal = "breakout"
    elif net_sdi < -0.02:
        signal = "regression"
    else:
        signal = "stable"


    return {
        "archetype":          archetype,
        "overall_confidence": overall_confidence,
        "signal":             signal,
        "metrics":            metrics,
        "net_sdi":           net_sdi,
        "career_ip":          career["career_ip"],
        "career_seasons":     career["seasons"],
    }


def main(season):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")

    create_sdi_table(conn)

    # Clear existing data for this season
    conn.execute("DELETE FROM sdi_2026 WHERE season = ?", (season,))
    conn.commit()

    # ── Batters ──
    log.info(f"Computing batter SDI for {season}...")
    batters = conn.execute("""
        SELECT name, team, pa, hr, so, bb, ab,
               COALESCE(k_pct, CASE WHEN pa > 0 THEN ROUND(CAST(so AS REAL)/pa*100,1) END) k_pct,
               COALESCE(bb_pct, CASE WHEN pa > 0 THEN ROUND(CAST(bb AS REAL)/pa*100,1) END) bb_pct,
               xwoba, ev, barrel_pct, hard_hit_pct, bwar, opsplus,
               avg, obp, slg, ops
        FROM batting WHERE season = ? AND pa >= 20
        ORDER BY pa DESC
    """, (season,)).fetchall()

    # Deduplicate batters:
    # 1. Prefer 2TM/3TM/4TM aggregate row (full season stats for traded players)
    # 2. Fall back to single-team row with most PA
    # 3. Skip blank "" team rows (BRef artifacts, not real aggregates)
    seen = {}
    for row in [dict(r) for r in batters]:
        team = (row.get("team") or "").strip()
        if team == "":  # skip blank-team artifacts only
            continue
        key = row["name"].lower().strip()
        is_aggregate = team in ("2TM", "3TM", "4TM")
        existing = seen.get(key)
        if existing is None:
            seen[key] = row
        elif is_aggregate:
            seen[key] = row  # aggregate always wins
        elif (existing.get("team") or "") not in ("2TM", "3TM", "4TM"):
            if (row.get("pa") or 0) > (existing.get("pa") or 0):
                seen[key] = row  # keep highest PA single-team row
    batters_deduped = list(seen.values())


    b_inserted = 0
    for row in batters_deduped:
        result = compute_batter_sdi(conn, row, season)
        if not result:
            continue
        conn.execute("""
            INSERT OR REPLACE INTO sdi_2026
                (name, season, team, role, archetype, overall_confidence,
                 signal, metrics_json, career_pa, career_ip, career_seasons, net_sdi, computed_at)
            VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?,?)
        """, (
            row["name"], season, row["team"], "batter",
            result["archetype"], result["overall_confidence"],
            result["signal"], json.dumps(result["metrics"]),
            result.get("career_pa"), result.get("career_seasons"), result.get("net_sdi"), TODAY
        ))
        b_inserted += 1

    conn.commit()
    log.info(f"  Inserted {b_inserted} batter SDI rows")

    # ── Pitchers ──
    log.info(f"Computing pitcher SDI for {season}...")
    pitchers = conn.execute("""
        SELECT name, team, ip, era, whip, eraplus, bwar, so, bb, h, er, g, gs,
               k_pct, bb_pct
        FROM pitching WHERE season = ? AND ip >= 5
        ORDER BY ip DESC
    """, (season,)).fetchall()

    # Deduplicate pitchers: prefer 2TM/3TM aggregates, skip blank team only
    seen_p = {}
    for _r in [dict(r) for r in pitchers]:
        _team = (_r.get("team") or "").strip()
        if _team == "":  # skip blank-team artifacts only
            continue
        _key = _r["name"].lower().strip()
        _is_agg = _team in ("2TM", "3TM", "4TM")
        _existing = seen_p.get(_key)
        if _existing is None:
            seen_p[_key] = _r
        elif _is_agg:
            seen_p[_key] = _r
        elif (_existing.get("team") or "") not in ("2TM", "3TM", "4TM"):
            if (_r.get("ip") or 0) > (_existing.get("ip") or 0):
                seen_p[_key] = _r
    pitchers_deduped = list(seen_p.values())


    p_inserted = 0
    for row in pitchers_deduped:
        result = compute_pitcher_sdi(conn, row, season)
        if not result:
            continue
        conn.execute("""
            INSERT OR REPLACE INTO sdi_2026
                (name, season, team, role, archetype, overall_confidence,
                 signal, metrics_json, career_pa, career_ip, career_seasons, net_sdi, computed_at)
            VALUES (?,?,?,?,?,?,?,?,NULL,?,?,?,?)
        """, (
            row["name"], season, row["team"], "pitcher",
            result["archetype"], result["overall_confidence"],
            result["signal"], json.dumps(result["metrics"]),
            result.get("career_ip"), result.get("career_seasons"), result.get("net_sdi"), TODAY
        ))
        p_inserted += 1

    conn.commit()
    log.info(f"  Inserted {p_inserted} pitcher SDI rows")

    # Spot check
    log.info("\nTop 5 breakout batters:")
    for r in conn.execute("""
        SELECT name, team, overall_confidence, signal, net_sdi FROM sdi_2026
        WHERE season=? AND role='batter' AND signal='breakout'
        ORDER BY net_sdi DESC LIMIT 10
    """, (season,)).fetchall():
        log.info(f"  {r[0]} ({r[1]}): net_sdi={r[4]:.3f}, conf={r[2]}% — {r[3]}")

    log.info("\nTop 5 regression pitchers:")
    for r in conn.execute("""
        SELECT name, team, overall_confidence, signal, net_sdi FROM sdi_2026
        WHERE season=? AND role='pitcher' AND signal='regression'
        ORDER BY ABS(net_sdi) DESC LIMIT 10
    """, (season,)).fetchall():
        log.info(f"  {r[0]} ({r[1]}): net_sdi={r[4]:.3f}, conf={r[2]}% — {r[3]}")

    conn.close()
    log.info("\nDone.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int, default=datetime.now().year)
    args = parser.parse_args()
    main(args.year)
