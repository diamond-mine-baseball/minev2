import sqlite3

DB_PATH = "/Users/euno/Desktop/DiamondMine/baseball.db"

conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

cur.execute("""
    SELECT p.name, p.season, p.team, p.war, p.era, p.fip, p.kpct, p.bbpct,
           pl.headshot
    FROM pitching p
    LEFT JOIN player pl ON p.player_id = pl.player_id
    WHERE p.age = 24
      AND p.season >= 1948
      AND p.gs >= 15
    ORDER BY p.war DESC
    LIMIT 50
""")

rows = cur.fetchall()
conn.close()

for r in rows:
    name, season, team, war, era, fip, kpct, bbpct, hs = r
    hs_val = f'"{hs}"' if hs and hs.startswith("http") else "null"
    print(f'  {{n:"{name}",y:{season},t:"{team}",war:{war},era:{era},fip:{fip},k:{round(kpct*100,1)},bb:{round(bbpct*100,1)},hs:{hs_val}}},')
