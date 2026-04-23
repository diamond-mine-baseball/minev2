#!/usr/bin/env python3
"""
load_player_salaries.py
Loads Cot's per-player payroll data into player_salaries table.

Sources:
  --xlsx   cots_payroll_output.xlsx  (TEAM_YEAR sheets from Apps Script)
  --json   cots_payroll_all.json     (6 teams from browser scraper)

Column layouts confirmed from source inspection:
  Format A (2009-2019): col[0]=name, [1]=pos, [2]=mls, [3]=agent,
                         [4]=contract, [5]=salary_this_year
  Format BC (2020+):    col[0]=name, [1]=pos, [2]=draft_yr, [3]=round(NaN=intl),
                         [4]=pick_or_country, [5]=age, [6]=mls, [7]=opts,
                         [8]=agent, [9]=NaN, [10]=contract, [11]=NaN,
                         [12]=26man_salary, [18]=cbt_aav
"""

import sqlite3, json, csv, io, re, argparse, unicodedata
import pandas as pd
from pathlib import Path
from datetime import datetime

INTL_COUNTRIES = {
    'VEN','DR','DOM','KOR','JPN','CUB','MEX','PAN','COL','AUS',
    'NCA','NIC','CUR','ARU','BAH','CAN','BRA','NET','TWN','CHN',
    'NPB','KBO','PR','CUW','VN','ISR','GER','ITA','NED'
}

NON_SALARY = {
    'FA','Arb 1','Arb 2','Arb 3','Arb 4','Ret','Min','MiLB','opt',
    'v opt','cl opt','p opt','','n/a','N/A','DFA','Minors','nan',
    'A1','A2','A3','A4',
}


def normalize_name(raw):
    s = str(raw).strip().strip('"')
    parts = s.split(',', 1)
    return f"{parts[1].strip()} {parts[0].strip()}" if len(parts) == 2 else s


def strip_accents(s):
    return unicodedata.normalize('NFKD', str(s)).encode('ASCII', 'ignore').decode().lower().strip()


def is_player_row(v):
    s = str(v).strip().strip('"')
    return bool(re.match(r'^[A-ZÁÉÍÓÚÜÑ][a-zA-Záéíóúüñ\-\'\.]+,\s+\S', s))


def parse_salary(v):
    if v is None: return None
    s = str(v).strip().replace(',', '').replace('$', '')
    if s.upper() in NON_SALARY or not s or s == 'nan': return None
    if re.search(r'[A-Za-z]', s): return None
    m = re.search(r'^([\d.]+)', s)
    if not m: return None
    try:
        val = float(m.group(1))
        if val < 500: val *= 1_000_000
        if val < 10_000: return None
        return round(val)
    except ValueError:
        return None


def parse_mls(v):
    if v is None or str(v).strip() in ('nan', '', 'N/A'): return None
    m = re.search(r'(\d+\.?\d*)', re.sub(r'[^\d.]', '', str(v)))
    if not m: return None
    try: return float(m.group(1))
    except: return None


def parse_contract_years(notes):
    if not notes or str(notes) == 'nan': return None, None, None, None
    notes = str(notes)
    years = total = t_start = t_end = None
    m = re.search(r'(\d+)\s*(?:yr|y(?:ear)?)\b', notes, re.I)
    if m: years = int(m.group(1))
    m = re.search(r'\$\s*([\d.]+)\s*[Mm]\b', notes)
    if m: total = float(m.group(1)) * 1_000_000
    m = re.search(r'\((\d{2,4})-(\d{2,4})\)', notes)
    if m:
        s, e = int(m.group(1)), int(m.group(2))
        t_start = (s + 2000) if s < 100 else s
        t_end   = (e + 2000) if e < 100 else e
    return years, total, t_start, t_end


def service_buckets(mls_float, contract_years):
    if mls_float is None or contract_years is None: return None, None, None
    pre_arb = arb = fa = 0
    cur = mls_float
    for _ in range(contract_years):
        if cur < 3.0:   pre_arb += 1
        elif cur < 6.0: arb += 1
        else:           fa += 1
        cur += 1.0
    return pre_arb, arb, fa


def build_fa_lookup(conn):
    lookup = {}
    for row in conn.execute(
        "SELECT name, new_team, term_start, term_end, aav, years FROM contracts WHERE is_mlb=1"
    ):
        lookup.setdefault(strip_accents(row[0]), []).append({
            'new_team': row[1], 'term_start': row[2],
            'term_end': row[3], 'aav': row[4], 'years': row[5]
        })
    return lookup


def classify(name, team, season, mls, contract_notes, is_intl, fa_lookup):
    for fa in fa_lookup.get(strip_accents(name), []):
        if fa['term_start'] and fa['term_end']:
            if fa['term_start'] <= season <= fa['term_end']:
                return 'fa' if fa['new_team'] == team else 'trade'
    if is_intl: return 'international'
    mls_f = mls or 0.0
    yrs, *_ = parse_contract_years(contract_notes)
    if mls_f < 3.0: return 'extension' if (yrs and yrs > 1) else 'pre_arb'
    if mls_f < 6.0: return 'extension' if (yrs and yrs > 1) else 'arb'
    return 'extension' if (yrs and yrs > 1) else 'unknown'


def detect_format(header_row):
    c2 = str(header_row[2]).strip().lower() if len(header_row) > 2 else ''
    return 'BC' if 'year' in c2 else 'A'


def parse_sheet(arr, season):
    """
    arr: 2D list/array of cell values.
    Returns list of player dicts.
    """
    players = []
    fmt = 'A'
    hdr_row = None

    for i, row in enumerate(arr):
        if str(row[0]).strip().lower().startswith('player'):
            hdr_row = i
            fmt = detect_format(row)
            break
    if hdr_row is None:
        return players

    for i in range(hdr_row + 1, len(arr)):
        row = list(arr[i])
        if not is_player_row(row[0]):
            continue

        name = normalize_name(row[0])

        def cell(idx, default=''):
            v = row[idx] if idx < len(row) else default
            return '' if str(v) == 'nan' else str(v).strip()

        if fmt == 'A':
            pos      = cell(1)
            mls      = parse_mls(cell(2))
            agent    = cell(3) or None
            contract = cell(4) or None
            salary   = parse_salary(cell(5))
            cbt_aav  = None
            age      = None
            draft_yr = draft_rd = draft_pk = None
            is_intl  = False

        else:  # BC
            pos      = cell(1)
            draft_yr_raw = cell(2)
            col3     = cell(3)
            col4     = cell(4)
            age      = parse_mls(cell(5))
            mls      = parse_mls(cell(6))
            agent    = cell(8) or None
            contract = cell(10) or None
            salary   = parse_salary(cell(12))
            cbt_aav  = parse_salary(cell(18))

            col3_empty  = col3 in ('', 'nan', 'None')
            col4_intl   = col4.upper() in INTL_COUNTRIES
            col3_intl   = col3.upper() in INTL_COUNTRIES

            if (col3_empty and col4_intl) or col3_intl:
                is_intl  = True
                draft_yr = draft_rd = draft_pk = None
            else:
                is_intl = False
                try: draft_yr = int(float(draft_yr_raw)) if draft_yr_raw.isdigit() else None
                except: draft_yr = None
                try: draft_rd = int(re.sub(r'[^0-9]', '', col3)) if re.match(r'^\d+s?$', col3) else None
                except: draft_rd = None
                try: draft_pk = int(col4) if col4.isdigit() else None
                except: draft_pk = None

        players.append({
            'name': name, 'season': season,
            'salary': salary, 'cbt_aav': cbt_aav,
            'position': pos,
            'ml_service': f"{mls:.3f}" if mls is not None else None,
            'age': age, 'agent': agent,
            'contract_notes': contract,
            'draft_year': draft_yr, 'draft_round': draft_rd, 'draft_pick': draft_pk,
            'is_international': 1 if is_intl else 0,
        })

    return players


def create_tables(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS player_salaries (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            name             TEXT NOT NULL,
            team             TEXT NOT NULL,
            season           INTEGER NOT NULL,
            salary           REAL,
            cbt_aav          REAL,
            position         TEXT,
            ml_service       TEXT,
            age              REAL,
            agent            TEXT,
            contract_notes   TEXT,
            contract_type    TEXT,
            draft_year       INTEGER,
            draft_round      INTEGER,
            draft_pick       INTEGER,
            is_international INTEGER DEFAULT 0,
            UNIQUE(name, team, season)
        );
        CREATE INDEX IF NOT EXISTS idx_ps_name    ON player_salaries(name);
        CREATE INDEX IF NOT EXISTS idx_ps_team_yr ON player_salaries(team, season);
    """)
    conn.commit()


def upsert(players, team, fa_lookup, conn, dry_run):
    n = 0
    for p in players:
        ctype = classify(
            p['name'], team, p['season'],
            parse_mls(p['ml_service']),
            p['contract_notes'],
            bool(p['is_international']),
            fa_lookup
        )
        p['team'] = team
        p['contract_type'] = ctype
        if dry_run:
            n += 1
            continue
        try:
            conn.execute("""
                INSERT OR IGNORE INTO player_salaries
                  (name,team,season,salary,cbt_aav,position,ml_service,age,agent,
                   contract_notes,contract_type,draft_year,draft_round,
                   draft_pick,is_international)
                VALUES
                  (:name,:team,:season,:salary,:cbt_aav,:position,:ml_service,
                   :age,:agent,:contract_notes,:contract_type,:draft_year,
                   :draft_round,:draft_pick,:is_international)
            """, p)
            n += conn.execute("SELECT changes()").fetchone()[0]
        except Exception as e:
            print(f"    ERR {p['name']} {team} {p['season']}: {e}")
    if not dry_run:
        conn.commit()
    return n


def maybe_insert_extension(p, team, conn):
    if p.get('contract_type') not in ('extension', 'international'):
        return
    contract = p.get('contract_notes') or ''
    yrs, total, t_start, t_end = parse_contract_years(contract)
    if not yrs or yrs < 2: return
    season = p['season']
    if not t_start: t_start = season
    if not t_end:   t_end = t_start + yrs - 1
    aav = round(total / yrs) if total and yrs else p.get('salary')
    mls_f = parse_mls(p.get('ml_service'))
    pre_arb, arb, fa_yrs = service_buckets(mls_f, yrs)
    try: age_int = int(float(str(p.get('age')))) if p.get('age') else None
    except: age_int = None
    try:
        conn.execute("""
            INSERT OR IGNORE INTO contracts
              (name,signing_class,new_team,old_team,position,age_at_signing,
               years,guarantee,aav,term_start,term_end,is_mlb,
               contract_type,ml_service_at_signing,
               pre_arb_years,arb_years,fa_years,extension_signed_year,agent)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)
        """, (
            p['name'], season, team, team, p.get('position'), age_int,
            yrs, total, aav, t_start, t_end,
            p['contract_type'], p.get('ml_service'),
            pre_arb, arb, fa_yrs, season, p.get('agent')
        ))
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db',   default=str(Path.home()/'Desktop/DiamondMinev2/diamondmine.db'))
    parser.add_argument('--xlsx', default=str(Path.home()/'Desktop/DiamondMinev2/Data/cots_payroll_output.xlsx'))
    parser.add_argument('--json', default=str(Path.home()/'Desktop/DiamondMinev2/Data/cots_payroll_all.json'))
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    create_tables(conn)
    fa_lookup = build_fa_lookup(conn)
    print(f"FA lookup: {sum(len(v) for v in fa_lookup.values())} contracts")
    if args.dry_run: print("DRY RUN — no DB writes\n")

    total_p = total_n = total_ext = 0
    type_counts = {}

    # ── XLSX ───────────────────────────────────────────────────────────────────
    xlsx_path = Path(args.xlsx)
    if xlsx_path.exists():
        print(f"\nLoading XLSX: {xlsx_path.name}")
        xl = pd.read_excel(str(xlsx_path), sheet_name=None, header=None)
        for sheet_name in sorted(xl.keys()):
            if '_' not in sheet_name: continue
            parts = sheet_name.rsplit('_', 1)
            if len(parts) != 2: continue
            team, yr_s = parts
            try: season = int(yr_s)
            except: continue

            arr = xl[sheet_name].values.tolist()
            players = parse_sheet(arr, season)
            n = upsert(players, team, fa_lookup, conn, args.dry_run)
            total_p += len(players)
            total_n += n

            for p in players:
                ct = p.get('contract_type', 'unknown')
                type_counts[ct] = type_counts.get(ct, 0) + 1
                if not args.dry_run and ct in ('extension', 'international'):
                    maybe_insert_extension(p, team, conn)
                    total_ext += 1

            if players:
                print(f"  {sheet_name}: {len(players)} players, {n} new")
    else:
        print(f"XLSX not found: {xlsx_path}")

    # ── JSON ───────────────────────────────────────────────────────────────────
    json_path = Path(args.json)
    if json_path.exists():
        print(f"\nLoading JSON: {json_path.name}")
        payload = json.load(open(str(json_path)))
        print(f"  {payload['success']} sheets — {payload['scraped_at'][:10]}")
        for team in sorted(payload['data'].keys()):
            for yr_s, csv_text in sorted(payload['data'][team].items()):
                season = int(yr_s)
                rows = list(csv.reader(io.StringIO(csv_text)))
                if not rows: continue
                max_len = max(len(r) for r in rows)
                arr = [r + [''] * (max_len - len(r)) for r in rows]
                players = parse_sheet(arr, season)
                n = upsert(players, team, fa_lookup, conn, args.dry_run)
                total_p += len(players)
                total_n += n
                for p in players:
                    ct = p.get('contract_type', 'unknown')
                    type_counts[ct] = type_counts.get(ct, 0) + 1
                    if not args.dry_run and ct in ('extension', 'international'):
                        maybe_insert_extension(p, team, conn)
                        total_ext += 1
                if players:
                    print(f"  {team} {season}: {len(players)} players, {n} new")
    else:
        print(f"JSON not found: {json_path}")

    # ── Summary ────────────────────────────────────────────────────────────────
    print(f"\n{'='*52}")
    print(f"Total parsed    : {total_p:,}")
    print(f"New rows in DB  : {total_n:,}")
    print(f"Ext/Intl added  : {total_ext:,}")
    print(f"\nContract type breakdown:")
    for t, n in sorted(type_counts.items(), key=lambda x: -x[1]):
        pct = n / total_p * 100 if total_p else 0
        print(f"  {t:<16} {n:>6}  ({pct:.1f}%)")

    if not args.dry_run:
        total_rows = conn.execute("SELECT COUNT(*) FROM player_salaries").fetchone()[0]
        conn.execute("""
            INSERT OR REPLACE INTO data_freshness
              (source,table_name,last_updated,rows_affected,notes)
            VALUES ('cots_payroll','player_salaries',?,?,
                    'Opening day per-player salaries — Cot Baseball Contracts')
        """, (datetime.now().isoformat(), total_rows))
        conn.commit()
        print(f"\nTotal rows in player_salaries: {total_rows:,}")

    conn.close()
    print("Done.")


if __name__ == '__main__':
    main()
