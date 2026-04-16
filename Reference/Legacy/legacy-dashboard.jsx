import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const API = "http://localhost:5000";

const ACCENT = "#C8F135";
const DIM = "#8a9a6a";
const BG = "#0a0c08";
const CARD = "#111408";
const BORDER = "#1e2410";

const KEY_BATTING_STATS = ["bwar","wrcplus","avg","obp","slg","hr","rbi","bb","so","babip"];
const KEY_BATTING_LABELS = {"bwar":"WAR","wrcplus":"wRC+","avg":"AVG","obp":"OBP","slg":"SLG","hr":"HR","rbi":"RBI","bb":"BB","so":"SO","babip":"BABIP"};

const TABS = ["Scoreboard", "MLB 2026", "Leaderboard", "Player Career", "Compare Players", "Fantasy Points", "DRS"];

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:wght@400;500&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${BG}; color: #d4e89a; font-family: 'DM Mono', monospace; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${BG}; }
  ::-webkit-scrollbar-thumb { background: ${BORDER}; border-radius: 2px; }
  input, select { background: #0d1009; border: 1px solid ${BORDER}; color: #d4e89a;
    font-family: 'DM Mono', monospace; font-size: 12px; padding: 8px 12px; outline: none;
    border-radius: 2px; transition: border-color 0.2s; }
  input:focus, select:focus { border-color: ${ACCENT}; }
  input::placeholder { color: #3a4a2a; }
  button { cursor: pointer; font-family: 'DM Mono', monospace; transition: all 0.15s; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { color: ${DIM}; font-weight: 500; text-align: left; padding: 8px 12px;
    border-bottom: 1px solid ${BORDER}; letter-spacing: 0.08em; font-size: 10px; }
  td { padding: 7px 12px; border-bottom: 1px solid #0f1409; color: #c8dfa0; }
  tr:hover td { background: #111c06; }
  .stat-pill { background: #0f1a06; border: 1px solid #1e2e0e; border-radius: 2px;
    padding: 2px 7px; font-size: 10px; color: ${DIM}; display: inline-block; }
`;

function Spinner() {
  return <div style={{display:"flex",alignItems:"center",gap:8,color:DIM,fontSize:11}}>
    <div style={{width:12,height:12,border:`2px solid ${BORDER}`,borderTopColor:ACCENT,
      borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
    loading...
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>;
}

function StatBadge({label, value}) {
  return <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:60}}>
    <span style={{fontSize:9,color:DIM,letterSpacing:"0.1em"}}>{label}</span>
    <span style={{fontSize:18,fontFamily:"'Bebas Neue'",color:ACCENT,letterSpacing:"0.05em"}}>{value ?? "—"}</span>
  </div>;
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

// ── MLB 2026 Season — Standings + Leaders ─────────────────────────────────────
const YEAR = 2026;
const MLB_API = "https://statsapi.mlb.com/api/v1";

const LEADER_CATS = [
  { key: "battingAverage",       label: "AVG",   fmt: v => Number(v).toFixed(3) },
  { key: "homeRuns",             label: "HR",    fmt: v => v },
  { key: "runsBattedIn",         label: "RBI",   fmt: v => v },
  { key: "onBasePlusSlugging",   label: "OPS",   fmt: v => Number(v).toFixed(3) },
  { key: "stolenBases",          label: "SB",    fmt: v => v },
  { key: "earnedRunAverage",     label: "ERA",   fmt: v => Number(v).toFixed(2) },
  { key: "strikeouts",           label: "K",     fmt: v => v },
  { key: "wins",                 label: "W",     fmt: v => v },
  { key: "saves",                label: "SV",    fmt: v => v },
  { key: "whip",                 label: "WHIP",  fmt: v => Number(v).toFixed(3) },
];

const DIV_ORDER = [
  ["American League East",    "AL East"],
  ["American League Central", "AL Central"],
  ["American League West",    "AL West"],
  ["National League East",    "NL East"],
  ["National League Central", "NL Central"],
  ["National League West",    "NL West"],
];

function MLBSeason() {
  const [standings, setStandings] = useState({});
  const [leaders, setLeaders]     = useState({});
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeCat, setActiveCat] = useState("homeRuns");

  const fetchAll = async () => {
    try {
      const catList = LEADER_CATS.map(c => c.key).join(",");
      const [standRes, leadRes] = await Promise.all([
        fetch(`${MLB_API}/standings?leagueId=103,104&season=${YEAR}&hydrate=team`),
        fetch(`${MLB_API}/stats/leaders?leaderCategories=${catList}&season=${YEAR}&sportId=1&limit=10`),
      ]);
      const standData = await standRes.json();
      const leadData  = await leadRes.json();

      // Parse standings
      const divMap = {};
      for (const record of standData.records || []) {
        const lg  = record.league?.name || "";
        const div = record.division?.name || "";
        const key = `${lg} ${div}`.replace("American League American League","American League").replace("National League National League","National League");
        // Try to match to our DIV_ORDER keys
        const match = DIV_ORDER.find(([full]) => div.includes(full.split(" ").slice(-1)[0]) && lg.includes(full.split(" ")[0]));
        const mapKey = match ? match[0] : key;
        divMap[mapKey] = record.teamRecords?.map(t => ({
          abbr:    t.team?.abbreviation,
          name:    t.team?.teamName,
          w:       t.wins,
          l:       t.losses,
          pct:     t.winningPercentage,
          gb:      t.gamesBack === "-" ? "—" : t.gamesBack,
          streak:  t.streak?.streakCode || "—",
          rs:      t.runsScored,
          ra:      t.runsAllowed,
        })) || [];
      }
      setStandings(divMap);

      // Parse leaders
      const leadMap = {};
      for (const cat of leadData.leagueLeaders || []) {
        leadMap[cat.leaderCategory] = cat.leaders?.map(l => ({
          rank:   l.rank,
          name:   l.person?.fullName || l.person?.firstLastName || "—",
          team:   l.team?.abbreviation || "—",
          value:  l.value,
        })) || [];
      }
      setLeaders(leadMap);
      setLastRefresh(new Date());
    } catch(e) {
      console.error("MLBSeason fetch error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, []);

  const activeDef = LEADER_CATS.find(c => c.key === activeCat);

  if (loading) return <Spinner/>;

  return <div>
    {/* Header */}
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
      <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color:ACCENT,letterSpacing:"0.08em"}}>
        {YEAR} SEASON
      </div>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <span style={{fontSize:9,color:DIM}}>
          {lastRefresh ? `UPDATED ${lastRefresh.toLocaleTimeString()}` : ""}
        </span>
        <button onClick={fetchAll}
          style={{background:"transparent",border:`1px solid ${BORDER}`,color:DIM,
            padding:"4px 12px",fontSize:9,letterSpacing:"0.08em",cursor:"pointer",borderRadius:2}}>
          REFRESH
        </button>
      </div>
    </div>

    {/* ── Standings ── */}
    <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:12}}>STANDINGS</div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:10,marginBottom:32}}>
      {DIV_ORDER.map(([fullKey, shortKey]) => {
        const teams = standings[fullKey] || [];
        if (!teams.length) return null;
        return (
          <div key={fullKey} style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:2,overflow:"hidden"}}>
            <div style={{padding:"7px 12px",borderBottom:`1px solid ${BORDER}`,
              fontSize:9,color:ACCENT,letterSpacing:"0.12em",fontWeight:500}}>
              {shortKey}
            </div>
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                  {["TEAM","W","L","PCT","GB","STRK"].map(h=>(
                    <th key={h} style={{padding:"5px 8px",fontSize:8,color:DIM,
                      letterSpacing:"0.08em",fontWeight:500,
                      textAlign:h==="TEAM"?"left":"right"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {teams.map((t,i)=>(
                  <tr key={t.abbr} style={{borderBottom:i<teams.length-1?`1px solid ${BORDER}`:"none"}}>
                    <td style={{padding:"5px 8px",fontSize:12,fontFamily:"'Bebas Neue'",
                      letterSpacing:"0.05em",color:i===0?ACCENT:"#c8dfa0"}}>{t.abbr}</td>
                    <td style={{padding:"5px 8px",fontSize:11,color:"#c8dfa0",textAlign:"right"}}>{t.w}</td>
                    <td style={{padding:"5px 8px",fontSize:11,color:DIM,textAlign:"right"}}>{t.l}</td>
                    <td style={{padding:"5px 8px",fontSize:11,color:DIM,textAlign:"right"}}>{t.pct}</td>
                    <td style={{padding:"5px 8px",fontSize:11,color:DIM,textAlign:"right"}}>{t.gb}</td>
                    <td style={{padding:"5px 8px",fontSize:11,textAlign:"right",
                      color:t.streak?.startsWith("W")?ACCENT:t.streak?.startsWith("L")?"#e74c3c":DIM}}>
                      {t.streak}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>

    {/* ── Leaders ── */}
    <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:12}}>SEASON LEADERS</div>
    {/* Category pills */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
      {LEADER_CATS.map(c=>(
        <button key={c.key} onClick={()=>setActiveCat(c.key)}
          style={{background:activeCat===c.key?ACCENT:"transparent",
            color:activeCat===c.key?BG:DIM,
            border:`1px solid ${activeCat===c.key?ACCENT:BORDER}`,
            borderRadius:2,padding:"4px 12px",fontSize:10,cursor:"pointer",
            letterSpacing:"0.06em",fontFamily:"'DM Mono'"}}>
          {c.label}
        </button>
      ))}
    </div>

    {/* Leader table */}
    {(() => {
      const rows = leaders[activeCat] || [];
      if (!rows.length) return (
        <div style={{color:DIM,fontSize:12}}>No data yet — season may be early or stats not yet populated.</div>
      );
      return (
        <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:2,overflow:"hidden",maxWidth:480}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr style={{borderBottom:`1px solid ${BORDER}`}}>
                {["#","PLAYER","TEAM",activeDef?.label||""].map(h=>(
                  <th key={h} style={{padding:"7px 12px",fontSize:9,color:DIM,
                    letterSpacing:"0.08em",fontWeight:500,
                    textAlign:h==="PLAYER"?"left":"right"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>(
                <tr key={i} style={{borderBottom:i<rows.length-1?`1px solid ${BORDER}`:"none"}}>
                  <td style={{padding:"7px 12px",fontSize:12,fontFamily:"'Bebas Neue'",
                    color:i===0?ACCENT:DIM,textAlign:"right"}}>{r.rank}</td>
                  <td style={{padding:"7px 12px",fontSize:12,color:"#d4e89a"}}>{r.name}</td>
                  <td style={{padding:"7px 12px",fontSize:11,color:DIM,textAlign:"right"}}>{r.team}</td>
                  <td style={{padding:"7px 12px",fontSize:14,fontFamily:"'Bebas Neue'",
                    color:i===0?ACCENT:ACCENT+"aa",textAlign:"right",letterSpacing:"0.03em"}}>
                    {activeDef?.fmt(r.value) ?? r.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    })()}
  </div>;
}

// ── Scoreboard ────────────────────────────────────────────────────────────────
const MLB_API = "https://statsapi.mlb.com/api/v1";

const DIVISION_ORDER = [
  "American League East", "American League Central", "American League West",
  "National League East", "National League Central", "National League West",
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function Scoreboard() {
  const [games, setGames]         = useState([]);
  const [standings, setStandings] = useState({});
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeDiv, setActiveDiv] = useState(null);

  const fetchAll = async () => {
    try {
      const today = todayStr();
      const [schedRes, standRes] = await Promise.all([
        fetch(`${MLB_API}/schedule?sportId=1&date=${today}&hydrate=linescore,team`),
        fetch(`${MLB_API}/standings?leagueId=103,104&season=${new Date().getFullYear()}&hydrate=team`),
      ]);
      const schedData = await schedRes.json();
      const standData = await standRes.json();

      // Parse games
      const allGames = schedData.dates?.[0]?.games || [];
      setGames(allGames);

      // Parse standings into division map
      const divMap = {};
      for (const record of standData.records || []) {
        const div = record.division?.nameShort;
        const league = record.sport?.name === "Major League Baseball" ? record.league?.name : "";
        const key = `${league} ${div}`;
        divMap[key] = record.teamRecords.map(t => ({
          name: t.team.teamName,
          abbr: t.team.abbreviation,
          w: t.wins,
          l: t.losses,
          pct: t.winningPercentage,
          gb: t.gamesBack === "-" ? "—" : t.gamesBack,
          streak: t.streak?.streakCode || "",
          l10: t.records?.splitRecords?.find(r=>r.type==="lastTen")?.wins + "-" + t.records?.splitRecords?.find(r=>r.type==="lastTen")?.losses || "",
        }));
      }
      setStandings(divMap);
      setLastRefresh(new Date());
    } catch(e) {
      console.error("Scoreboard fetch error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (s) => {
    const code = s?.codedGameState || s?.abstractGameCode;
    if (code === "I") return "#C8F135"; // live
    if (code === "F") return "#8a9a6a"; // final
    return "#4a7a9b";                   // scheduled
  };

  const statusLabel = (game) => {
    const s = game.status;
    if (s?.abstractGameState === "Live") {
      const inn = game.linescore?.currentInningOrdinal || "";
      const half = game.linescore?.inningHalf === "Top" ? "▲" : "▼";
      return `${half} ${inn}`;
    }
    if (s?.abstractGameState === "Final") return "F";
    return game.gameDate ? new Date(game.gameDate).toLocaleTimeString("en-US",
      {hour:"numeric",minute:"2-digit",timeZoneName:"short"}) : "TBD";
  };

  const liveGames   = games.filter(g => g.status?.abstractGameState === "Live");
  const finalGames  = games.filter(g => g.status?.abstractGameState === "Final");
  const upcomingGames = games.filter(g => g.status?.abstractGameState === "Preview");

  const GameCard = ({game}) => {
    const away = game.teams?.away;
    const home = game.teams?.home;
    const ls   = game.linescore;
    const isLive = game.status?.abstractGameState === "Live";
    const isFinal = game.status?.abstractGameState === "Final";
    const awayScore = isFinal || isLive ? away?.score : null;
    const homeScore = isFinal || isLive ? home?.score : null;
    const awayWin = isFinal && awayScore > homeScore;
    const homeWin = isFinal && homeScore > awayScore;

    return (
      <div style={{background:CARD, border:`1px solid ${isLive ? ACCENT+'60' : BORDER}`,
        borderRadius:2, padding:"10px 14px", minWidth:200,
        boxShadow: isLive ? `0 0 12px ${ACCENT}18` : undefined}}>
        {/* Status */}
        <div style={{fontSize:9, color:statusColor(game.status),
          letterSpacing:"0.1em", marginBottom:8, fontWeight:500}}>
          {statusLabel(game)}
          {isLive && <span style={{display:"inline-block",width:6,height:6,
            borderRadius:"50%",background:ACCENT,marginLeft:6,
            animation:"pulse 1.2s infinite"}}/>}
        </div>
        {/* Teams */}
        {[["away", away, awayWin], ["home", home, homeWin]].map(([side, t, won]) => (
          <div key={side} style={{display:"flex",justifyContent:"space-between",
            alignItems:"center", marginBottom:4}}>
            <span style={{fontSize:13, fontFamily:"'Bebas Neue'",
              letterSpacing:"0.06em",
              color: won ? "#fff" : (isFinal ? DIM : "#c8dfa0")}}>
              {t?.team?.abbreviation || "—"}
            </span>
            {(isLive || isFinal) && (
              <span style={{fontSize:16, fontFamily:"'Bebas Neue'",
                color: won ? ACCENT : (isFinal ? DIM : "#c8dfa0"), minWidth:24, textAlign:"right"}}>
                {t?.score ?? "—"}
              </span>
            )}
          </div>
        ))}
        {/* Inning detail */}
        {isLive && ls && (
          <div style={{fontSize:9, color:DIM, marginTop:6,
            borderTop:`1px solid ${BORDER}`, paddingTop:6}}>
            {ls.balls != null && `${ls.balls}-${ls.strikes} · `}
            {ls.outs != null && `${ls.outs} out`}
          </div>
        )}
      </div>
    );
  };

  const StandingsTable = ({divKey}) => {
    const teams = standings[divKey] || [];
    if (!teams.length) return null;
    return (
      <div style={{background:CARD, border:`1px solid ${BORDER}`, borderRadius:2, overflow:"hidden"}}>
        <div style={{padding:"8px 12px", borderBottom:`1px solid ${BORDER}`,
          fontSize:9, color:ACCENT, letterSpacing:"0.12em", fontWeight:500}}>
          {divKey.replace("American League","AL").replace("National League","NL")}
        </div>
        <table style={{width:"100%", borderCollapse:"collapse"}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${BORDER}`}}>
              {["TEAM","W","L","PCT","GB","STRK"].map(h=>(
                <th key={h} style={{padding:"5px 8px", fontSize:9, color:DIM,
                  letterSpacing:"0.08em", fontWeight:500,
                  textAlign: h==="TEAM" ? "left" : "right"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => (
              <tr key={t.abbr} style={{borderBottom: i < teams.length-1 ? `1px solid ${BORDER}` : "none"}}>
                <td style={{padding:"5px 8px", fontSize:12, fontFamily:"'Bebas Neue'",
                  letterSpacing:"0.05em", color: i===0 ? ACCENT : "#c8dfa0"}}>{t.abbr}</td>
                <td style={{padding:"5px 8px", fontSize:11, color:"#c8dfa0", textAlign:"right"}}>{t.w}</td>
                <td style={{padding:"5px 8px", fontSize:11, color:DIM, textAlign:"right"}}>{t.l}</td>
                <td style={{padding:"5px 8px", fontSize:11, color:DIM, textAlign:"right"}}>{t.pct}</td>
                <td style={{padding:"5px 8px", fontSize:11, color:DIM, textAlign:"right"}}>{t.gb}</td>
                <td style={{padding:"5px 8px", fontSize:11, textAlign:"right",
                  color: t.streak?.startsWith("W") ? ACCENT : t.streak?.startsWith("L") ? "#e74c3c" : DIM}}>
                  {t.streak}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) return <Spinner/>;

  const divKeys = DIVISION_ORDER.filter(d => standings[d]);

  return <div>
    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>

    {/* Header row */}
    <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20}}>
      <div style={{fontSize:9, color:DIM, letterSpacing:"0.1em"}}>
        {lastRefresh ? `UPDATED ${lastRefresh.toLocaleTimeString()}` : "LOADING…"}
        <span style={{marginLeft:8, color:BORDER}}>· AUTO-REFRESH 30s</span>
      </div>
      <button onClick={fetchAll}
        style={{background:"transparent", border:`1px solid ${BORDER}`, color:DIM,
          padding:"4px 12px", fontSize:9, letterSpacing:"0.08em", cursor:"pointer", borderRadius:2}}>
        REFRESH
      </button>
    </div>

    {/* Live games */}
    {liveGames.length > 0 && <>
      <div style={{fontSize:9,color:ACCENT,letterSpacing:"0.12em",marginBottom:10}}>
        ● LIVE
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:24}}>
        {liveGames.map(g => <GameCard key={g.gamePk} game={g}/>)}
      </div>
    </>}

    {/* Today's schedule */}
    {upcomingGames.length > 0 && <>
      <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:10}}>
        TODAY · {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:24}}>
        {upcomingGames.map(g => <GameCard key={g.gamePk} game={g}/>)}
      </div>
    </>}

    {/* Final games */}
    {finalGames.length > 0 && <>
      <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:10}}>
        FINAL
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:28}}>
        {finalGames.map(g => <GameCard key={g.gamePk} game={g}/>)}
      </div>
    </>}

    {/* Standings */}
    {divKeys.length > 0 && <>
      <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:12}}>
        STANDINGS
      </div>
      {/* Division tab filters */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {["ALL","AL East","AL Central","AL West","NL East","NL Central","NL West"].map(d=>(
          <button key={d} onClick={()=>setActiveDiv(activeDiv===d?null:d)}
            style={{background: activeDiv===d ? ACCENT : "transparent",
              color: activeDiv===d ? BG : DIM,
              border:`1px solid ${activeDiv===d ? ACCENT : BORDER}`,
              borderRadius:2, padding:"3px 10px", fontSize:9,
              letterSpacing:"0.06em", cursor:"pointer"}}>
            {d}
          </button>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:12}}>
        {divKeys
          .filter(d => {
            if (!activeDiv || activeDiv === "ALL") return true;
            return d.replace("American League","AL").replace("National League","NL").includes(activeDiv);
          })
          .map(d => <StandingsTable key={d} divKey={d}/>)
        }
      </div>
    </>}

    {games.length === 0 && <div style={{color:DIM,fontSize:13}}>No games scheduled today.</div>}
  </div>;
}

function Leaderboard({seasons}) {
  const [season, setSeason] = useState("2022");
  const [table, setTable] = useState("batting");
  const [stat, setStat] = useState("bwar");
  const [limit, setLimit] = useState(20);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  const statOptions = table === "batting"
    ? KEY_BATTING_STATS
    : table === "pitching"
      ? ["bwar","era","so","bb","ip","whip","fip","kpct","bbpct"]
      : ["bwar","def","fld","drs","uzr"];

  const fetch_ = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/leaderboard?season=${season}&table=${table}&stat=${stat}&limit=${limit}`);
      setData(await r.json());
    } catch(e) { setData([]); }
    setLoading(false);
  }, [season, table, stat, limit]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const cols = data[0] ? Object.keys(data[0]).filter(k =>
    ["name","team","season","bwar","wrcplus","avg","obp","slg","hr","rbi","era","so","ip","whip","fip","def","fld"].includes(k)
  ) : [];

  return <div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
      <select value={season} onChange={e=>setSeason(e.target.value)}>
        {seasons.map(s=><option key={s}>{s}</option>)}
      </select>
      <select value={table} onChange={e=>{setTable(e.target.value);setStat("bwar");}}>
        {["batting","pitching","fielding"].map(t=><option key={t}>{t}</option>)}
      </select>
      <select value={stat} onChange={e=>setStat(e.target.value)}>
        {statOptions.map(s=><option key={s}>{s.toUpperCase()}</option>).map((o,i)=>
          <option key={statOptions[i]} value={statOptions[i]}>{statOptions[i].toUpperCase()}</option>
        )}
      </select>
      <select value={limit} onChange={e=>setLimit(e.target.value)}>
        {[10,20,50].map(n=><option key={n} value={n}>TOP {n}</option>)}
      </select>
    </div>
    {loading ? <Spinner/> : data.length === 0 ? <span style={{color:DIM,fontSize:11}}>no data</span> :
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr>
            <th>#</th>
            {cols.map(c=><th key={c}>{c.toUpperCase()}</th>)}
          </tr></thead>
          <tbody>
            {data.map((row,i)=><tr key={i}>
              <td style={{color:i<3?ACCENT:DIM,fontFamily:"'Bebas Neue'",fontSize:14}}>{i+1}</td>
              {cols.map(c=><td key={c} style={{
                color: c===stat ? ACCENT : c==="name" ? "#d4e89a" : "#8a9a6a",
                fontWeight: c===stat ? 500 : 400
              }}>{row[c] ?? "—"}</td>)}
            </tr>)}
          </tbody>
        </table>
      </div>
    }
  </div>;
}

// ── Career ───────────────────────────────────────────────────────────────────

function Career() {
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("batting");

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const r = await fetch(`${API}/career/${encodeURIComponent(query)}`);
      const d = await r.json();
      setData(d);
    } catch(e) { setData(null); }
    setLoading(false);
  };

  const rows = data?.[tab] ?? [];
  const chartStats = tab === "batting"
    ? ["bwar","wrcplus","hr","avg"]
    : tab === "pitching"
      ? ["bwar","era","so","whip"]
      : ["bwar","def","fld"];

  const COLORS = [ACCENT, "#7ec8e3", "#ff9f43", "#ee5a24"];

  return <div>
    <div style={{display:"flex",gap:8,marginBottom:20}}>
      <input value={query} onChange={e=>setQuery(e.target.value)}
        onKeyDown={e=>e.key==="Enter"&&search()}
        placeholder="player name e.g. Mike Trout" style={{flex:1}}/>
      <button onClick={search} style={{background:ACCENT,color:BG,border:"none",
        padding:"8px 16px",fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:"0.05em"}}>
        SEARCH
      </button>
    </div>
    {loading && <Spinner/>}
    {data && <>
      <div style={{display:"flex",gap:4,marginBottom:16}}>
        {["batting","pitching","fielding"].map(t=><button key={t}
          onClick={()=>setTab(t)}
          style={{background:tab===t?ACCENT:"transparent",color:tab===t?BG:DIM,
            border:`1px solid ${tab===t?ACCENT:BORDER}`,padding:"5px 12px",
            fontSize:10,letterSpacing:"0.08em"}}>
          {t.toUpperCase()}
        </button>)}
      </div>
      {rows.length === 0
        ? <span style={{color:DIM,fontSize:11}}>no {tab} data found</span>
        : <>
          {/* Key stats badges for most recent season */}
          <div style={{display:"flex",gap:20,flexWrap:"wrap",
            background:CARD,border:`1px solid ${BORDER}`,padding:"16px 20px",
            marginBottom:16,borderRadius:2}}>
            {chartStats.map(s=><StatBadge key={s}
              label={KEY_BATTING_LABELS[s]||s.toUpperCase()}
              value={rows[rows.length-1]?.[s]}/>)}
            <StatBadge label="SEASONS" value={rows.length}/>
          </div>
          {/* Career trend chart */}
          <div style={{marginBottom:16,background:CARD,border:`1px solid ${BORDER}`,
            padding:"16px",borderRadius:2}}>
            <div style={{fontSize:9,color:DIM,letterSpacing:"0.1em",marginBottom:12}}>
              CAREER TREND
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" stroke={BORDER}/>
                <XAxis dataKey="season" stroke={DIM} tick={{fontSize:10,fill:DIM}}/>
                <YAxis stroke={DIM} tick={{fontSize:10,fill:DIM}}/>
                <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,
                  fontSize:11,fontFamily:"'DM Mono'"}}/>
                <Legend wrapperStyle={{fontSize:10}}/>
                {chartStats.slice(0,2).map((s,i)=>
                  <Line key={s} type="monotone" dataKey={s} stroke={COLORS[i]}
                    dot={{r:3,fill:COLORS[i]}} strokeWidth={2}/>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Table */}
          <div style={{overflowX:"auto"}}>
            <table>
              <thead><tr>
                {Object.keys(rows[0]).filter(k=>
                  ["season","team","g","bwar","wrcplus","avg","obp","slg","hr","rbi","bb","so",
                   "era","ip","whip","fip","so","def","fld"].includes(k)
                ).map(c=><th key={c}>{c.toUpperCase()}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((row,i)=>{
                  const cols = Object.keys(row).filter(k=>
                    ["season","team","g","bwar","wrcplus","avg","obp","slg","hr","rbi","bb","so",
                     "era","ip","whip","fip","so","def","fld"].includes(k));
                  return <tr key={i}>
                    {cols.map(c=><td key={c} style={{
                      color:c==="season"?ACCENT:c==="bwar"?ACCENT:"#8a9a6a"
                    }}>{row[c]??'—'}</td>)}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      }
    </>}
  </div>;
}

// ── Compare ──────────────────────────────────────────────────────────────────

// ── Compare constants ─────────────────────────────────────────────────────────
const PCT_STATS = new Set(["kpct","bbpct"]);

const HITTER_CARD_STATS   = ["bwar","wrcplus","hr","wpa","kpct","bbpct","ops"];
const HITTER_CARD_LABELS  = {"bwar":"WAR","wrcplus":"wRC+","hr":"HR","wpa":"WPA","kpct":"K%","bbpct":"BB%","ops":"OPS"};
const HITTER_RADAR_STATS  = ["bwar","wrcplus","hr","clutch","xwoba"];
const HITTER_RADAR_MAXES  = {war:12,wrcplus:200,hr:65,clutch:3,xwoba:0.5};
const HITTER_BAR_STATS    = ["bwar","wrcplus","hr","wpa","bb","so"];
const HITTER_BAR_LABELS   = {"bwar":"WAR","wrcplus":"wRC+","hr":"HR","wpa":"WPA","bb":"BB","so":"SO"};

const PITCHER_CARD_STATS  = ["bwar","era","so","ip","whip","fip","kpct","bbpct"];
const PITCHER_CARD_LABELS = {"bwar":"WAR","era":"ERA","so":"SO","ip":"IP","whip":"WHIP","fip":"FIP","kpct":"K%","bbpct":"BB%"};
const PITCHER_RADAR_STATS = ["bwar","era","fip","whip","so","kpct"];
const PITCHER_RADAR_MAXES = {war:10,era:5,fip:5,whip:1.8,so:300,kpct:0.4};
const PITCHER_BAR_STATS   = ["bwar","era","so","ip","whip","fip"];
const PITCHER_BAR_LABELS  = {"bwar":"WAR","era":"ERA","so":"SO","ip":"IP","whip":"WHIP","fip":"FIP"};

// ── AutoSuggest input ─────────────────────────────────────────────────────────
function AutoInput({value, onChange, onSelect, placeholder, endpoint, season, color="#d4e89a"}) {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow]     = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (value.length < 4) { setSuggestions([]); setShow(false); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/${endpoint}?q=${encodeURIComponent(value)}&season=${season||""}`);
        const results = await r.json();
        setSuggestions(results);
        setShow(results.length > 0);
      } catch(e) { setSuggestions([]); setShow(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [value, season, endpoint]);

  const handleSelect = (item) => {
    // item may be a string (legacy) or {name, idfg, team, position}
    const name = typeof item === "string" ? item : item.name;
    onChange(name);
    if (onSelect) onSelect(item);
    setShow(false);
    setSuggestions([]);
  };

  return <div style={{position:"relative",width:"100%"}}>
    <input value={value} onChange={e=>onChange(e.target.value)}
      onFocus={()=>setFocused(true)}
      onBlur={()=>{setFocused(false);setTimeout(()=>setShow(false),200);}}
      placeholder={placeholder} style={{width:"100%",color,boxSizing:"border-box"}}
      autoComplete="off"/>
    {show && focused && suggestions.length > 0 && (
      <div style={{position:"absolute",top:"calc(100% + 2px)",left:0,right:0,
        zIndex:9999,background:"#0d1009",border:`1px solid ${ACCENT}`,
        borderRadius:"0 0 2px 2px",maxHeight:200,overflowY:"auto",
        boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
        {suggestions.map((item, i) => {
          const name = typeof item === "string" ? item : item.name;
          const meta = typeof item === "object"
            ? [item.position, item.team].filter(Boolean).join(" · ")
            : null;
          return <div key={i}
            onMouseDown={e=>{e.preventDefault();handleSelect(item);}}
            style={{padding:"8px 12px",fontSize:11,cursor:"pointer",
              borderBottom:`1px solid ${BORDER}`,display:"flex",
              justifyContent:"space-between",alignItems:"center"}}
            onMouseEnter={e=>e.currentTarget.style.background="#111c06"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <span style={{color:"#c8dfa0"}}>{name}</span>
            {meta && <span style={{color:DIM,fontSize:10}}>{meta}</span>}
          </div>;
        })}
      </div>
    )}
  </div>;
}

// ── Career aggregation helper ─────────────────────────────────────────────────
async function fetchPlayerData(name, season, type, idfg) {
  if (!name.trim()) return null;
  const idfgParam = idfg ? `&idfg=${idfg}` : "";
  if (season === "Career") {
    const endpoint = type === "batter" ? "career-stats/batter" : "career-stats/pitcher";
    const r = await fetch(`${API}/${endpoint}?name=${encodeURIComponent(name)}${idfgParam}`);
    return await r.json();
  }
  const compareEndpoint = type === "batter" ? "compare" : "compare/pitchers";
  const r = await fetch(`${API}/${compareEndpoint}?player1=${encodeURIComponent(name)}&player2=${encodeURIComponent(name)}&season=${season}&stat=${type === "batter" ? "batting" : "pitching"}`);
  const rows = await r.json();
  return rows?.find(d => d.name?.toLowerCase().includes(name.toLowerCase())) || null;
}

// ── PlayerInput: name autosuggest + individual year selector ─────────────────
function PlayerInput({name, onName, onIdfg, season, onSeason, seasons, endpoint, color, label}) {
  return <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:2,padding:"12px 14px",flex:1,minWidth:200}}>
    <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:8}}>{label}</div>
    <AutoInput value={name} onChange={onName}
      onSelect={item => { if (item?.idfg && onIdfg) onIdfg(item.idfg); }}
      placeholder="Player name"
      endpoint={endpoint} season={season === "Career" ? "" : season} color={color}/>
    <select value={season} onChange={e=>onSeason(e.target.value)}
      style={{width:"100%",marginTop:6}}>
      <option value="Career">Career</option>
      {seasons.map(s=><option key={s} value={String(s)}>{s}</option>)}
    </select>
  </div>;
}

// ── PlayerCard ────────────────────────────────────────────────────────────────
function PlayerCard({pdata, color, cardStats, cardLabels}) {
  if (!pdata) return null;
  return <div style={{background:CARD,border:`1px solid ${BORDER}`,padding:"16px",borderRadius:2}}>
    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
      {pdata.headshot
        ? <img src={`${API}/headshot?path=${encodeURIComponent(pdata.headshot)}`} alt={pdata.name}
            style={{width:56,height:56,borderRadius:"50%",objectFit:"cover",
              border:`2px solid ${color}`,flexShrink:0}}
            onError={e=>{e.target.style.display="none";e.target.nextSibling.style.display="flex";}}/>
        : null}
      <div style={{width:56,height:56,borderRadius:"50%",background:BORDER,flexShrink:0,
        display:pdata.headshot?"none":"flex",alignItems:"center",justifyContent:"center",
        fontSize:18,fontFamily:"'Bebas Neue'",color:DIM}}>
        {pdata.name?.[0]}
      </div>
      <div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:20,color,letterSpacing:"0.05em",lineHeight:1}}>
          {pdata.name}
        </div>
        <div style={{fontSize:10,color:DIM,marginTop:3}}>
          {pdata.team} · {pdata.season === "Career" ? "Career" : pdata.season}
        </div>
      </div>
    </div>
    <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
      {cardStats.map(s=>{
        const raw = pdata[s];
        const display = PCT_STATS.has(s) && raw != null ? `${(raw*100).toFixed(1)}%` : raw;
        return <StatBadge key={s} label={cardLabels[s]||s.toUpperCase()} value={display}/>;
      })}
    </div>
  </div>;
}

// ── DRS Compare Row ───────────────────────────────────────────────────────────
function DRSCompareRow({name1, idfg1, season1, name2, idfg2, season2, color1, color2}) {
  const [drs1, setDrs1] = useState(null);
  const [drs2, setDrs2] = useState(null);

  const fetchDRS = async (name, idfg) => {
    const p = idfg ? `&idfg=${idfg}` : "";
    const r = await fetch(`${API}/drs/player?name=${encodeURIComponent(name)}${p}`);
    const rows = await r.json();
    return rows;
  };

  useEffect(() => {
    if (name1) fetchDRS(name1, idfg1).then(setDrs1);
    if (name2) fetchDRS(name2, idfg2).then(setDrs2);
  }, [name1, name2, idfg1, idfg2]);

  const seasonDRS = (rows, season) => {
    if (!rows || !rows.length) return null;
    if (season === "Career") {
      const total = rows.reduce((s,r) => s + (r.total||0), 0);
      return { total, seasons: rows.length };
    }
    return rows.find(r => String(r.season) === String(season)) || null;
  };

  const d1 = seasonDRS(drs1, season1);
  const d2 = seasonDRS(drs2, season2);
  if (!d1 && !d2) return null;

  const t1 = d1?.total ?? null;
  const t2 = d2?.total ?? null;
  const winner = t1 != null && t2 != null ? (t1 > t2 ? 1 : t2 > t1 ? 2 : 0) : 0;

  const DRSStat = ({label, val, color, isWinner}) => (
    <div style={{textAlign:"center",padding:"8px 16px",
      background: isWinner ? `${color}18` : "transparent",
      borderRadius:2, border: isWinner ? `1px solid ${color}40` : `1px solid transparent`}}>
      <div style={{fontSize:9,color:DIM,letterSpacing:"0.1em",marginBottom:4}}>{label}</div>
      <div style={{fontSize:22,fontFamily:"'Bebas Neue'",
        color: isWinner ? color : val != null && val > 0 ? "#a8d060" : val < 0 ? "#e74c3c" : DIM}}>
        {val != null ? (val > 0 ? `+${val}` : val) : "—"}
      </div>
    </div>
  );

  return (
    <div style={{background:CARD,border:`1px solid ${BORDER}`,borderRadius:2,
      padding:"14px 16px",marginBottom:16}}>
      <div style={{fontSize:9,color:DIM,letterSpacing:"0.1em",marginBottom:12}}>
        DEFENSIVE RUNS SAVED (DRS)
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:8,alignItems:"center"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end"}}>
          {d1 && <>
            <DRSStat label="DRS" val={d1.total} color={color1} isWinner={winner===1}/>
            {d1.art  != null && <DRSStat label="PART" val={d1.art} color={color1} isWinner={false}/>}
            {d1.gfpdm!= null && <DRSStat label="GFP/DME" val={d1.gfpdm} color={color1} isWinner={false}/>}
            {d1.of_arm!=null && <DRSStat label="OF ARM" val={d1.of_arm} color={color1} isWinner={false}/>}
          </>}
        </div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:16,color:BORDER,textAlign:"center"}}>VS</div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-start"}}>
          {d2 && <>
            <DRSStat label="DRS" val={d2.total} color={color2} isWinner={winner===2}/>
            {d2.art  != null && <DRSStat label="PART" val={d2.art} color={color2} isWinner={false}/>}
            {d2.gfpdm!= null && <DRSStat label="GFP/DME" val={d2.gfpdm} color={color2} isWinner={false}/>}
            {d2.of_arm!=null && <DRSStat label="OF ARM" val={d2.of_arm} color={color2} isWinner={false}/>}
          </>}
        </div>
      </div>
    </div>
  );
}

// ── DRS Leaderboard tab ───────────────────────────────────────────────────────
const DRS_COLS = [
  {key:"rank",   label:"#"},
  {key:"player", label:"PLAYER"},
  {key:"g",      label:"G"},
  {key:"inn",    label:"INN"},
  {key:"total",  label:"DRS", accent:true},
  {key:"art",    label:"PART"},
  {key:"gfpdm",  label:"GFP/DME"},
  {key:"sb",     label:"SB"},
  {key:"of_arm", label:"OF ARM"},
  {key:"bunt",   label:"BUNT"},
  {key:"gdp",    label:"GDP"},
  {key:"adj_er", label:"ADJ ER"},
];

function DRSLeaderboard({seasons}) {
  const [season, setSeason] = useState(2024);
  const [limit, setLimit]   = useState(50);
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortKey, setSortKey] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/drs/leaderboard?season=${season}&limit=${limit}`)
      .then(r=>r.json())
      .then(d=>{ setData(d); setLoading(false); })
      .catch(()=>setLoading(false));
  }, [season, limit]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir(key === "player" ? "asc" : "desc"); }
  };

  const sorted = [...data].sort((a,b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1; if (bv == null) return -1;
    if (typeof av === "number") return sortDir === "asc" ? av-bv : bv-av;
    return sortDir === "asc"
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const SortIcon = ({col}) => sortKey !== col
    ? <span style={{color:BORDER,marginLeft:3}}>⇅</span>
    : <span style={{color:ACCENT,marginLeft:3}}>{sortDir==="desc"?"↓":"↑"}</span>;

  return <div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
      <select value={season} onChange={e=>setSeason(Number(e.target.value))}>
        {seasons.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      <select value={limit} onChange={e=>setLimit(Number(e.target.value))}>
        {[25,50,100,200].map(n=><option key={n} value={n}>TOP {n}</option>)}
      </select>
    </div>

    {loading ? <Spinner/> :
      <div style={{overflowX:"auto"}}>
        <table>
          <thead><tr>
            {DRS_COLS.map(c=>(
              <th key={c.key} onClick={()=>handleSort(c.key)}
                style={{cursor:"pointer",userSelect:"none",whiteSpace:"nowrap",
                  color:sortKey===c.key?ACCENT:undefined}}>
                {c.label}<SortIcon col={c.key}/>
              </th>
            ))}
          </tr></thead>
          <tbody>
            {sorted.map((row,i)=>(
              <tr key={i}>
                {DRS_COLS.map(c=>{
                  let val = c.key === "rank" ? i+1 : row[c.key];
                  if (c.key === "inn" && val) val = Number(val).toFixed(1);
                  const isPos = typeof val === "number" && val > 0;
                  const isNeg = typeof val === "number" && val < 0;
                  return <td key={c.key} style={{
                    color: c.accent
                      ? (isPos ? ACCENT : isNeg ? "#e74c3c" : DIM)
                      : c.key === "player" ? "#d4e89a"
                      : c.key === "rank" ? (i < 3 ? ACCENT : DIM)
                      : (isPos ? "#a8d060" : isNeg ? "#e74c3c" : DIM),
                    fontWeight: c.accent ? 500 : undefined,
                  }}>{val ?? "—"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    }
  </div>;
}

// ── CompareSection ────────────────────────────────────────────────────────────
function CompareSection({type, endpoint, seasons, cardStats, cardLabels,
  radarStats, radarMaxes, barStats, barLabels, accentColor}) {

  const [p1, setP1]       = useState("");
  const [p2, setP2]       = useState("");
  const [idfg1, setIdfg1] = useState(null);
  const [idfg2, setIdfg2] = useState(null);
  const [s1, setS1]       = useState("Career");
  const [s2, setS2]       = useState("Career");
  const [p1data, setP1data] = useState(null);
  const [p2data, setP2data] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  const compare = async () => {
    if (!p1.trim() || !p2.trim()) return;
    setLoading(true); setError("");
    try {
      const [d1, d2] = await Promise.all([
        fetchPlayerData(p1, s1, type, idfg1),
        fetchPlayerData(p2, s2, type, idfg2),
      ]);
      if (!d1 && !d2) { setError("No data found — check player names"); setP1data(null); setP2data(null); }
      else { setP1data(d1); setP2data(d2); }
    } catch(e) { setError("Error fetching data"); }
    setLoading(false);
  };

  const normalize = (val, stat) =>
    radarMaxes[stat] ? Math.min(100, ((val||0)/radarMaxes[stat])*100) : 0;

  const radarData = (p1data && p2data) ? radarStats.map(stat => ({
    stat: stat.toUpperCase(),
    [p1data.name]: Math.round(normalize(p1data[stat], stat)),
    [p2data.name]: Math.round(normalize(p2data[stat], stat)),
  })) : [];

  return <div>
    {/* Player inputs */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12,alignItems:"flex-end"}}>
      <PlayerInput name={p1} onName={setP1} onIdfg={setIdfg1} season={s1} onSeason={setS1}
        seasons={seasons} endpoint={endpoint} color={accentColor} label="PLAYER 1"/>
      <PlayerInput name={p2} onName={setP2} onIdfg={setIdfg2} season={s2} onSeason={setS2}
        seasons={seasons} endpoint={endpoint} color="#7ec8e3" label="PLAYER 2"/>
      <button onClick={compare} style={{background:accentColor,color:BG,border:"none",
        padding:"10px 20px",fontFamily:"'Bebas Neue'",fontSize:15,letterSpacing:"0.05em",
        alignSelf:"flex-end",height:38}}>
        COMPARE
      </button>
    </div>

    {loading && <Spinner/>}
    {error && <span style={{color:DIM,fontSize:11}}>{error}</span>}

    {p1data && p2data && <>
      {/* Cards */}
      <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",
        gap:8,marginBottom:16,alignItems:"center"}}>
        <PlayerCard pdata={p1data} color={accentColor} cardStats={cardStats} cardLabels={cardLabels}/>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:24,color:DIM,padding:"0 8px"}}>VS</div>
        <PlayerCard pdata={p2data} color="#7ec8e3" cardStats={cardStats} cardLabels={cardLabels}/>
      </div>

      {/* DRS Row */}
      {type === "batter" &&
        <DRSCompareRow
          name1={p1data.name} idfg1={idfg1} season1={s1}
          name2={p2data.name} idfg2={idfg2} season2={s2}
          color1={accentColor} color2="#7ec8e3"
        />
      }

      {/* Radar */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,padding:"16px",
        borderRadius:2,marginBottom:16}}>
        <div style={{fontSize:9,color:DIM,letterSpacing:"0.1em",marginBottom:12}}>
          PERFORMANCE RADAR (NORMALIZED)
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarData}>
            <PolarGrid stroke={BORDER}/>
            <PolarAngleAxis dataKey="stat" tick={{fontSize:10,fill:DIM}}/>
            <Radar name={p1data.name} dataKey={p1data.name}
              stroke={accentColor} fill={accentColor} fillOpacity={0.15} strokeWidth={2}/>
            <Radar name={p2data.name} dataKey={p2data.name}
              stroke="#7ec8e3" fill="#7ec8e3" fillOpacity={0.15} strokeWidth={2}/>
            <Legend wrapperStyle={{fontSize:10}}/>
            <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,
              fontSize:11,fontFamily:"'DM Mono'"}}/>
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Bar chart */}
      <div style={{background:CARD,border:`1px solid ${BORDER}`,padding:"16px",borderRadius:2}}>
        <div style={{fontSize:9,color:DIM,letterSpacing:"0.1em",marginBottom:12}}>
          KEY STATS COMPARISON
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={barStats.map(s=>({
            stat: barLabels[s]||s.toUpperCase(),
            [p1data.name]: p1data[s],
            [p2data.name]: p2data[s],
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER}/>
            <XAxis dataKey="stat" stroke={DIM} tick={{fontSize:10,fill:DIM}}/>
            <YAxis stroke={DIM} tick={{fontSize:10,fill:DIM}}/>
            <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,
              fontSize:11,fontFamily:"'DM Mono'"}}/>
            <Legend wrapperStyle={{fontSize:10}}/>
            <Bar dataKey={p1data.name} fill={accentColor} fillOpacity={0.8}/>
            <Bar dataKey={p2data.name} fill="#7ec8e3" fillOpacity={0.8}/>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </>}
  </div>;
}

// ── Compare (main tab with sub-tabs) ─────────────────────────────────────────
function Compare({seasons}) {
  const [subTab, setSubTab] = useState(0);
  const seasonStrings = seasons.map(String);
  const subTabs = ["BATTERS", "PITCHERS"];

  return <div>
    {/* Sub-tabs */}
    <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:`1px solid ${BORDER}`}}>
      {subTabs.map((t,i)=><button key={t} onClick={()=>setSubTab(i)}
        style={{background:"transparent",border:"none",
          borderBottom:subTab===i?`2px solid ${ACCENT}`:"2px solid transparent",
          color:subTab===i?ACCENT:DIM,padding:"10px 20px",fontSize:11,
          letterSpacing:"0.1em",marginBottom:-1,cursor:"pointer"}}>
        {t}
      </button>)}
    </div>

    {subTab === 0 && <CompareSection
      type="batter"
      endpoint="search/batters"
      seasons={seasonStrings}
      cardStats={HITTER_CARD_STATS}
      cardLabels={HITTER_CARD_LABELS}
      radarStats={HITTER_RADAR_STATS}
      radarMaxes={HITTER_RADAR_MAXES}
      barStats={HITTER_BAR_STATS}
      barLabels={HITTER_BAR_LABELS}
      accentColor={ACCENT}
    />}

    {subTab === 1 && <CompareSection
      type="pitcher"
      endpoint="search/pitchers"
      seasons={seasonStrings}
      cardStats={PITCHER_CARD_STATS}
      cardLabels={PITCHER_CARD_LABELS}
      radarStats={PITCHER_RADAR_STATS}
      radarMaxes={PITCHER_RADAR_MAXES}
      barStats={PITCHER_BAR_STATS}
      barLabels={PITCHER_BAR_LABELS}
      accentColor="#ff9f43"
    />}
  </div>;
}

// ── Fantasy Points ────────────────────────────────────────────────────────────

const FP_COLORS = {
  win:  ACCENT,
  lose: "#ee5a24",
  tie:  "#7ec8e3",
};

function fpColor(a, b, lowerBetter = false) {
  if (a == null || b == null) return DIM;
  if (a === b) return FP_COLORS.tie;
  return (lowerBetter ? a < b : a > b) ? FP_COLORS.win : FP_COLORS.lose;
}

function FPBadge({label, value, winColor}) {
  return <div style={{display:"flex",flexDirection:"column",gap:2,minWidth:70}}>
    <span style={{fontSize:9,color:DIM,letterSpacing:"0.1em"}}>{label}</span>
    <span style={{fontSize:20,fontFamily:"'Bebas Neue'",color:winColor||ACCENT,
      letterSpacing:"0.04em"}}>{value ?? "—"}</span>
  </div>;
}

function PlayerProfile({data, color}) {
  if (!data) return <div style={{background:CARD,border:`1px solid ${BORDER}`,
    borderRadius:2,padding:20,display:"flex",alignItems:"center",
    justifyContent:"center",color:DIM,fontSize:11,minHeight:100}}>
    Search a player above
  </div>;

  return <div style={{background:CARD,border:`1px solid ${BORDER}`,
    borderRadius:2,padding:"16px"}}>
    <div style={{display:"flex",alignItems:"center",gap:12}}>
      {data.headshot
        ? <img src={`${API}/headshot?path=${encodeURIComponent(data.headshot)}`}
            alt={data.name} style={{width:56,height:56,borderRadius:"50%",
              objectFit:"cover",border:`2px solid ${color}`,flexShrink:0}}
            onError={e=>e.target.style.display="none"}/>
        : <div style={{width:56,height:56,borderRadius:"50%",background:BORDER,
            flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:20,fontFamily:"'Bebas Neue'",color:DIM}}>{data.name?.[0]}</div>}
      <div>
        <div style={{fontFamily:"'Bebas Neue'",fontSize:22,color,
          letterSpacing:"0.05em",lineHeight:1}}>{data.name}</div>
        <div style={{fontSize:10,color:DIM,marginTop:3}}>
          {data.position || "—"} · {data.seasons?.[data.seasons.length-1]?.team || "—"}
        </div>
      </div>
    </div>
  </div>;
}

function CareerStatsRow({d1, d2}) {
  if (!d1) return null;
  return <div style={{background:CARD,border:`1px solid ${BORDER}`,
    borderRadius:2,padding:"16px",marginBottom:8}}>
    <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:12}}>
      CAREER FANTASY POINTS
    </div>
    <div style={{display:"grid",gridTemplateColumns:d2?"1fr 1fr":"1fr",gap:16}}>
      {[d1, d2].filter(Boolean).map((d, i) => {
        const color = i === 0 ? ACCENT : "#7ec8e3";
        const other = i === 0 ? d2 : d1;
        return <div key={i} style={{display:"flex",gap:20,flexWrap:"wrap"}}>
          <FPBadge label="CAREER PTS"
            value={d.career_total?.toLocaleString()}
            winColor={fpColor(d.career_total, other?.career_total)}/>
          <FPBadge label="AVG PTS/G"
            value={d.career_avg_per_game}
            winColor={fpColor(d.career_avg_per_game, other?.career_avg_per_game)}/>
          <FPBadge label="CAREER G"
            value={d.career_games?.toLocaleString()}
            winColor={color}/>
        </div>;
      })}
    </div>
  </div>;
}

function PeakSeasonRow({d1, d2}) {
  if (!d1) return null;
  return <div style={{background:CARD,border:`1px solid ${BORDER}`,
    borderRadius:2,padding:"16px",marginBottom:8}}>
    <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:12}}>
      PEAK SEASON
    </div>
    <div style={{display:"grid",gridTemplateColumns:d2?"1fr 1fr":"1fr",gap:16}}>
      {[d1, d2].filter(Boolean).map((d, i) => {
        const other = i === 0 ? d2 : d1;
        return <div key={i} style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"flex-end"}}>
          <FPBadge label="PEAK PTS"
            value={d.peak_season?.total_points?.toLocaleString()}
            winColor={fpColor(d.peak_season?.total_points, other?.peak_season?.total_points)}/>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <span style={{fontSize:9,color:DIM,letterSpacing:"0.1em"}}>YEAR</span>
            <span style={{fontSize:20,fontFamily:"'Bebas Neue'",color:ACCENT}}>
              {d.peak_season?.season}
            </span>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function Peak3YrRow({d1, d2}) {
  if (!d1) return null;
  return <div style={{background:CARD,border:`1px solid ${BORDER}`,
    borderRadius:2,padding:"16px",marginBottom:8}}>
    <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:12}}>
      BEST CONSECUTIVE 3-YEAR PEAK
    </div>
    <div style={{display:"grid",gridTemplateColumns:d2?"1fr 1fr":"1fr",gap:16}}>
      {[d1, d2].filter(Boolean).map((d, i) => {
        const other = i === 0 ? d2 : d1;
        const b3 = d.best_3yr;
        return <div key={i} style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"flex-end"}}>
          <FPBadge label="3-YR TOTAL"
            value={b3?.total?.toLocaleString()}
            winColor={fpColor(b3?.total, (i===0?d2:d1)?.best_3yr?.total)}/>
          <FPBadge label="3-YR AVG"
            value={b3?.avg}
            winColor={fpColor(b3?.avg, (i===0?d2:d1)?.best_3yr?.avg)}/>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            <span style={{fontSize:9,color:DIM,letterSpacing:"0.1em"}}>YEARS</span>
            <span style={{fontSize:14,fontFamily:"'Bebas Neue'",color:ACCENT}}>
              {b3?.seasons?.join("–") || "—"}
            </span>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function LastYearRow({ly1, ly2}) {
  if (!ly1) return null;
  const fields = [
    {key:"total_points",  label:"2025 PTS",       fmt: v => v?.toLocaleString()},
    {key:"fp_per_game",   label:"PTS/G",           fmt: v => v},
    {key:"pos_rank",      label:"POS RANK",        fmt: v => `#${v}`, lower:true},
    {key:"premium_pct",   label:"VS TOP 12 AVG",   fmt: v => v != null ? `${v > 0 ? "+" : ""}${v}%` : "—"},
    {key:"g",             label:"G PLAYED",        fmt: v => v},
    {key:"games_missed",  label:"G MISSED",        fmt: v => v, lower:true},
    {key:"pct_played",    label:"% PLAYED",        fmt: v => v != null ? `${v}%` : "—"},
  ];

  return <div style={{background:CARD,border:`1px solid ${BORDER}`,
    borderRadius:2,padding:"16px",marginBottom:8}}>
    <div style={{fontSize:9,color:DIM,letterSpacing:"0.12em",marginBottom:12}}>
      2025 SEASON
    </div>
    {/* Position context */}
    {ly1 && <div style={{fontSize:10,color:DIM,marginBottom:12}}>
      Compared against Top 12 {ly1.position || ""}s · Mean: {ly1.top12_mean?.toLocaleString()} pts
      {ly2 && ` / ${ly2.top12_mean?.toLocaleString()} pts`}
    </div>}
    <div style={{display:"flex",flexWrap:"wrap",gap:20}}>
      {fields.map(f => {
        const v1 = ly1?.[f.key];
        const v2 = ly2?.[f.key];
        return <div key={f.key} style={{display:"flex",flexDirection:"column",gap:4,minWidth:80}}>
          <span style={{fontSize:9,color:DIM,letterSpacing:"0.1em"}}>{f.label}</span>
          <div style={{display:"flex",gap:10,alignItems:"baseline"}}>
            <span style={{fontSize:18,fontFamily:"'Bebas Neue'",
              color:fpColor(v1,v2,f.lower)}}>
              {f.fmt(v1)}
            </span>
            {ly2 && <span style={{fontSize:18,fontFamily:"'Bebas Neue'",
              color:fpColor(v2,v1,f.lower)}}>
              {f.fmt(v2)}
            </span>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function FPSearchInput({value, onChange, onSelect, placeholder, color}) {
  const [suggestions, setSuggestions] = useState([]);
  const [show, setShow]     = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (value.length < 4) { setSuggestions([]); setShow(false); return; }
    const timer = setTimeout(async () => {
      try {
        const [rb, rp] = await Promise.all([
          fetch(`${API}/search/batters?q=${encodeURIComponent(value)}`).then(r=>r.json()),
          fetch(`${API}/search/pitchers?q=${encodeURIComponent(value)}`).then(r=>r.json()),
        ]);
        // Deduplicate by idfg
        const seen = new Set();
        const all = [...rb, ...rp].filter(item => {
          const key = item.idfg || item.name;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        }).sort((a,b) => a.name.localeCompare(b.name));
        setSuggestions(all); setShow(all.length > 0);
      } catch(e) { setSuggestions([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [value]);

  return <div style={{position:"relative",flex:1,minWidth:160}}>
    <input value={value} onChange={e=>onChange(e.target.value)}
      onFocus={()=>setFocused(true)}
      onBlur={()=>{setFocused(false);setTimeout(()=>setShow(false),200);}}
      placeholder={placeholder} style={{width:"100%",color,boxSizing:"border-box"}}
      autoComplete="off"/>
    {show && focused && <div style={{position:"absolute",top:"calc(100% + 2px)",
      left:0,right:0,zIndex:9999,background:"#0d1009",
      border:`1px solid ${ACCENT}`,borderRadius:"0 0 2px 2px",
      maxHeight:200,overflowY:"auto",boxShadow:"0 8px 24px rgba(0,0,0,0.6)"}}>
      {suggestions.map((item,i)=>{
        const meta = [item.position, item.team].filter(Boolean).join(" · ");
        return <div key={i}
          onMouseDown={e=>{e.preventDefault();onChange(item.name);if(onSelect)onSelect(item);setShow(false);}}
          style={{padding:"8px 12px",fontSize:11,cursor:"pointer",
            borderBottom:`1px solid ${BORDER}`,display:"flex",
            justifyContent:"space-between",alignItems:"center"}}
          onMouseEnter={e=>e.currentTarget.style.background="#111c06"}
          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
          <span style={{color:"#c8dfa0"}}>{item.name}</span>
          {meta && <span style={{color:DIM,fontSize:10}}>{meta}</span>}
        </div>;
      })}
    </div>}
  </div>;
}

// ── 2026 Projections sub-tab ─────────────────────────────────────────────────

const BAT_POSITIONS = ["ALL","C","1B","2B","3B","SS","OF","DH"];
const PITCH_ROLES   = ["ALL","SP","RP"];

const PROJ_BAT_COLS = [
  {key:"rank",      label:"#"},
  {key:"name",      label:"PLAYER"},
  {key:"team",      label:"TEAM"},
  {key:"proj_position",  label:"POS"},
  {key:"fantasy_pts", label:"FPTS", accent:true},
  {key:"fpts_plus", label:"FPTS+", fpts_plus:true},
  {key:"g",         label:"G"},
  {key:"hr",        label:"HR"},
  {key:"r",         label:"R"},
  {key:"rbi",       label:"RBI"},
  {key:"sb",        label:"SB"},
  {key:"bb",        label:"BB"},
  {key:"so",        label:"SO"},
  {key:"avg",       label:"AVG"},
];

const PROJ_PIT_COLS = [
  {key:"rank",        label:"#"},
  {key:"name",        label:"PLAYER"},
  {key:"team",        label:"TEAM"},
  {key:"role",        label:"ROLE"},
  {key:"fantasy_pts", label:"FPTS", accent:true},
  {key:"fpts_plus",   label:"FPTS+", fpts_plus:true},
  {key:"w",           label:"W"},
  {key:"l",           label:"L"},
  {key:"era",         label:"ERA"},
  {key:"ip",          label:"IP"},
  {key:"so",          label:"SO"},
  {key:"sv",          label:"SV"},
  {key:"hld",         label:"HLD"},
  {key:"bb",          label:"BB"},
  {key:"h",           label:"H"},
];

function ProjectionsView() {
  const [type, setType]         = useState("batters");
  const [position, setPosition] = useState("ALL");
  const [role, setRole]         = useState("ALL");
  const [limit, setLimit]       = useState(50);
  const [data, setData]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [sortKey, setSortKey]   = useState("fantasy_pts");
  const [sortDir, setSortDir]   = useState("desc");

  const fetchData = async () => {
    setLoading(true);
    try {
      const url = type === "batters"
        ? `${API}/projections/2026/batters?position=${position}&limit=${limit}`
        : `${API}/projections/2026/pitchers?role=${role}&limit=${limit}`;
      const r = await fetch(url);
      setData(await r.json());
    } catch(e) { setData([]); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [type, position, role, limit]);

  // Reset sort when type changes
  useEffect(() => { setSortKey("fantasy_pts"); setSortDir("desc"); }, [type]);

  const handleSort = (key) => {
    if (key === "rank" || key === "name" || key === "team" || key === "proj_position" || key === "role") {
      // For text cols, toggle or set asc
      if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
      else { setSortKey(key); setSortDir("asc"); }
    } else {
      if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
      else { setSortKey(key); setSortDir("desc"); }
    }
  };

  const sortedData = [...data].sort((a, b) => {
    let av = sortKey === "role" ? (a.gs > 0 ? "SP" : "RP") : a[sortKey];
    let bv = sortKey === "role" ? (b.gs > 0 ? "SP" : "RP") : b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    const isNum = typeof av === "number" || (!isNaN(Number(av)) && av !== "");
    if (isNum) { av = Number(av); bv = Number(bv); }
    else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const cols = type === "batters" ? PROJ_BAT_COLS : PROJ_PIT_COLS;

  const SortIcon = ({col}) => {
    if (sortKey !== col) return <span style={{color:BORDER,marginLeft:3}}>⇅</span>;
    return <span style={{color:ACCENT,marginLeft:3}}>{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  return <div>
    {/* Controls */}
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16,alignItems:"center"}}>
      <div style={{display:"flex",borderRadius:2,overflow:"hidden",border:`1px solid ${BORDER}`}}>
        {["batters","pitchers"].map(t=>(
          <button key={t} onClick={()=>{setType(t);setPosition("ALL");setRole("ALL");}}
            style={{background:type===t?ACCENT:"transparent",color:type===t?BG:DIM,
              border:"none",padding:"6px 14px",fontSize:10,letterSpacing:"0.08em",
              cursor:"pointer",fontFamily:"'DM Mono'"}}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {type === "batters" && <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
        {BAT_POSITIONS.map(p=>(
          <button key={p} onClick={()=>setPosition(p)}
            style={{background:position===p?ACCENT:"transparent",
              color:position===p?BG:DIM,
              border:`1px solid ${position===p?ACCENT:BORDER}`,
              borderRadius:2,padding:"4px 10px",fontSize:10,cursor:"pointer",
              fontFamily:"'DM Mono'",letterSpacing:"0.06em"}}>
            {p}
          </button>
        ))}
      </div>}

      {type === "pitchers" && <div style={{display:"flex",gap:4}}>
        {PITCH_ROLES.map(r=>(
          <button key={r} onClick={()=>setRole(r)}
            style={{background:role===r?"#ff9f43":"transparent",
              color:role===r?BG:DIM,
              border:`1px solid ${role===r?"#ff9f43":BORDER}`,
              borderRadius:2,padding:"4px 14px",fontSize:10,cursor:"pointer",
              fontFamily:"'DM Mono'",letterSpacing:"0.06em"}}>
            {r === "ALL" ? "ALL" : r === "SP" ? "STARTERS" : "RELIEVERS"}
          </button>
        ))}
      </div>}

      <select value={limit} onChange={e=>setLimit(Number(e.target.value))}
        style={{marginLeft:"auto"}}>
        {[25,50,100,200].map(n=><option key={n} value={n}>TOP {n}</option>)}
      </select>
    </div>

    {loading ? <Spinner/> : data.length === 0
      ? <div style={{color:DIM,fontSize:11}}>No projection data — run the loaders first</div>
      : <div style={{overflowX:"auto"}}>
          <table>
            <thead><tr>
              {cols.map(c=>(
                <th key={c.key}
                  onClick={()=>handleSort(c.key)}
                  style={{cursor:"pointer",userSelect:"none",
                    color: sortKey===c.key ? ACCENT : undefined,
                    whiteSpace:"nowrap"}}>
                  {c.label}<SortIcon col={c.key}/>
                </th>
              ))}
            </tr></thead>
            <tbody>
              {sortedData.map((row, i) => {
                const roleLabel = row.gs > 0 ? "SP" : "RP";
                return <tr key={i}>
                  {cols.map(c => {
                    let val = c.key === "role" ? roleLabel : row[c.key];
                    if (c.key === "avg" && val) val = Number(val).toFixed(3);
                    if (c.key === "era" && val) val = Number(val).toFixed(2);
                    if (c.key === "ip"  && val) val = Number(val).toFixed(1);
                    if (c.key === "fantasy_pts" && val != null) val = Number(val).toFixed(1);
                    if (c.key === "fpts_plus"   && val != null) val = (Number(val) >= 0 ? "+" : "") + Number(val).toFixed(1);
                    const fplusVal = c.key === "fpts_plus" ? row[c.key] : null;
                    const fplusColor = fplusVal == null ? DIM
                      : fplusVal >= 50  ? "#00ff88"
                      : fplusVal >= 20  ? ACCENT
                      : fplusVal >= 0   ? "#a8d060"
                      : fplusVal >= -20 ? "#ff9f43"
                      : "#ee5a24";
                    return <td key={c.key} style={{
                      color: c.fpts_plus ? fplusColor
                           : c.accent ? ACCENT
                           : c.key === "name" ? "#d4e89a"
                           : c.key === "rank" ? (i < 3 ? ACCENT : DIM)
                           : "#8a9a6a",
                      fontFamily:  c.key === "rank" ? "'Bebas Neue'" : undefined,
                      fontSize:    c.key === "rank" ? 14 : undefined,
                      fontWeight:  c.accent || c.fpts_plus || sortKey===c.key ? 500 : undefined,
                      background:  c.fpts_plus && fplusVal != null
                        ? `${fplusColor}18` : undefined,
                    }}>{val ?? "—"}</td>;
                  })}
                </tr>;
              })}
            </tbody>
          </table>
        </div>
    }
  </div>;
}

// ── Fantasy history sub-tab ───────────────────────────────────────────────────
function FantasyHistoryView() {
  const [p1, setP1]       = useState("");
  const [p2, setP2]       = useState("");
  const [idfg1, setIdfg1] = useState(null);
  const [idfg2, setIdfg2] = useState(null);
  const [d1, setD1]   = useState(null);
  const [d2, setD2]   = useState(null);
  const [ly1, setLy1] = useState(null);
  const [ly2, setLy2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState([]);
  const [settingsId, setSettingsId] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/fantasy/settings`)
      .then(r=>r.json()).then(d=>setSettings(d)).catch(()=>{});
  }, []);

  const fetchPlayer = async (name, idfg, settId) => {
    const idfgParam = idfg ? `&idfg=${idfg}` : "";
    const [r1, r2] = await Promise.all([
      fetch(`${API}/fantasy/player?name=${encodeURIComponent(name)}&settings_id=${settId}${idfgParam}`),
      fetch(`${API}/fantasy/last-year?name=${encodeURIComponent(name)}&settings_id=${settId}${idfgParam}`)
    ]);
    const career   = await r1.json();
    const lastYear = await r2.json();
    return { career: career.error ? null : career,
             lastYear: lastYear.error ? null : lastYear };
  };

  const compare = async () => {
    if (!p1.trim()) return;
    setLoading(true); setError("");
    try {
      const res1 = await fetchPlayer(p1, idfg1, settingsId);
      setD1(res1.career); setLy1(res1.lastYear);
      if (p2.trim()) {
        const res2 = await fetchPlayer(p2, idfg2, settingsId);
        setD2(res2.career); setLy2(res2.lastYear);
      } else { setD2(null); setLy2(null); }
    } catch(e) { setError("Failed to fetch fantasy data"); }
    setLoading(false);
  };

  return <div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20,alignItems:"center"}}>
      <select value={settingsId} onChange={e=>setSettingsId(e.target.value)}
        style={{minWidth:220}}>
        {settings.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <FPSearchInput value={p1} onChange={v=>{setP1(v);setIdfg1(null);}}
        onSelect={item=>setIdfg1(item?.idfg)} placeholder="Player 1" color={ACCENT}/>
      <FPSearchInput value={p2} onChange={v=>{setP2(v);setIdfg2(null);}}
        onSelect={item=>setIdfg2(item?.idfg)} placeholder="Player 2 (optional)" color="#7ec8e3"/>
      <button onClick={compare} style={{background:ACCENT,color:BG,border:"none",
        padding:"8px 16px",fontFamily:"'Bebas Neue'",fontSize:14,letterSpacing:"0.05em"}}>
        COMPARE
      </button>
    </div>

    {loading && <Spinner/>}
    {error && <div style={{color:DIM,fontSize:11}}>{error}</div>}

    {(d1 || d2) && <>
      <div style={{display:"grid",gridTemplateColumns:d2?"1fr 1fr":"1fr",gap:8,marginBottom:8}}>
        <PlayerProfile data={d1} color={ACCENT}/>
        {d2 && <PlayerProfile data={d2} color="#7ec8e3"/>}
      </div>
      <CareerStatsRow d1={d1} d2={d2}/>
      <PeakSeasonRow  d1={d1} d2={d2}/>
      <Peak3YrRow     d1={d1} d2={d2}/>
      <LastYearRow    ly1={ly1} ly2={ly2}/>
      {d1 && <div style={{background:CARD,border:`1px solid ${BORDER}`,
        borderRadius:2,padding:"16px",marginTop:8}}>
        <div style={{fontSize:9,color:DIM,letterSpacing:"0.1em",marginBottom:12}}>
          FANTASY POINTS BY SEASON
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart>
            <CartesianGrid strokeDasharray="3 3" stroke={BORDER}/>
            <XAxis dataKey="season" type="number" domain={["auto","auto"]}
              allowDuplicatedCategory={false} stroke={DIM} tick={{fontSize:10,fill:DIM}}/>
            <YAxis stroke={DIM} tick={{fontSize:10,fill:DIM}}/>
            <Tooltip contentStyle={{background:CARD,border:`1px solid ${BORDER}`,
              fontSize:11,fontFamily:"'DM Mono'"}}/>
            <Legend wrapperStyle={{fontSize:10}}/>
            <Line data={d1.seasons} type="monotone" dataKey="total_points"
              name={d1.name} stroke={ACCENT} dot={{r:3}} strokeWidth={2}/>
            {d2 && <Line data={d2.seasons} type="monotone" dataKey="total_points"
              name={d2.name} stroke="#7ec8e3" dot={{r:3}} strokeWidth={2}/>}
          </LineChart>
        </ResponsiveContainer>
      </div>}
    </>}
  </div>;
}

// ── FantasyPoints (main tab with sub-tabs) ────────────────────────────────────
function FantasyPoints() {
  const [subTab, setSubTab] = useState(0);
  const subTabs = ["2026 PROJECTIONS", "FANTASY HISTORY"];

  return <div>
    <div style={{display:"flex",gap:0,marginBottom:20,borderBottom:`1px solid ${BORDER}`}}>
      {subTabs.map((t,i)=>(
        <button key={t} onClick={()=>setSubTab(i)}
          style={{background:"transparent",border:"none",
            borderBottom:subTab===i?`2px solid ${ACCENT}`:"2px solid transparent",
            color:subTab===i?ACCENT:DIM,padding:"10px 20px",fontSize:11,
            letterSpacing:"0.1em",marginBottom:-1,cursor:"pointer"}}>
          {t}
        </button>
      ))}
    </div>
    {subTab === 0 && <ProjectionsView/>}
    {subTab === 1 && <FantasyHistoryView/>}
  </div>;
}

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState(0);
  const [seasons, setSeasons] = useState([]);
  const [apiOk, setApiOk] = useState(null);

  useEffect(() => {
    fetch(`${API}/`)
      .then(r=>r.json())
      .then(()=>setApiOk(true))
      .catch(()=>setApiOk(false));
    fetch(`${API}/seasons`)
      .then(r=>r.json())
      .then(d=>setSeasons(d.reverse()))
      .catch(()=>{});
  }, []);

  return <>
    <style>{css}</style>
    <div style={{minHeight:"100vh",background:BG}}>
      {/* Header */}
      <div style={{borderBottom:`1px solid ${BORDER}`,padding:"0 32px",
        display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
        <div style={{display:"flex",alignItems:"baseline",gap:12}}>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:28,color:ACCENT,
            letterSpacing:"0.08em"}}>DIAMOND</span>
          <span style={{fontFamily:"'Bebas Neue'",fontSize:14,color:DIM,
            letterSpacing:"0.2em"}}>STATS</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:DIM}}>
          <div style={{width:6,height:6,borderRadius:"50%",
            background:apiOk===null?"#555":apiOk?ACCENT:"#e74c3c",
            boxShadow:apiOk?`0 0 8px ${ACCENT}`:undefined}}/>
          {apiOk===null?"connecting…":apiOk?"API CONNECTED":"API OFFLINE — run api.py"}
        </div>
      </div>
      {/* Tabs */}
      <div style={{borderBottom:`1px solid ${BORDER}`,padding:"0 32px",
        display:"flex",gap:0}}>
        {TABS.map((t,i)=><button key={t} onClick={()=>setTab(i)}
          style={{background:"transparent",border:"none",borderBottom:tab===i?`2px solid ${ACCENT}`:"2px solid transparent",
            color:tab===i?ACCENT:DIM,padding:"14px 20px",fontSize:11,
            letterSpacing:"0.08em",marginBottom:-1}}>
          {t.toUpperCase()}
        </button>)}
      </div>
      {/* Content */}
      <div style={{padding:"28px 32px",maxWidth:1100}}>
        {tab===0 && <Scoreboard/>}
        {tab===1 && <MLBSeason/>}
        {tab===2 && <Leaderboard seasons={seasons}/>}
        {tab===3 && <Career/>}
        {tab===4 && <Compare seasons={seasons}/>}
        {tab===5 && <FantasyPoints/>}
        {tab===6 && <DRSLeaderboard seasons={seasons}/>}
      </div>
    </div>
  </>;
}
