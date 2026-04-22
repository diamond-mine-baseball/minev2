import { useState, useEffect, useCallback, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

// ── Theme tokens (matches DiamondMine v2 theme.js) ──────────────────────────
const T = {
  bg:       "#07060f",
  bgCard:   "#0d0b1a",
  bgDeep:   "#050409",
  border:   "#1c1838",
  accent:   "#c084fc",
  accentMid:"#a855f7",
  textHi:   "#f5f0ff",
  textMid:  "#c4b5e8",
  textLow:  "#6b5fa0",
  gold:     "#f59e0b",
  red:      "#f87171",
  green:    "#4ade80",
  blue:     "#818cf8",
};

const API = import.meta.env.VITE_API_URL || "https://minev2-production-84a2.up.railway.app";

const fmt = {
  dollars: (n) => n == null ? "—" : `$${(n / 1e6).toFixed(1)}M`,
  pct:     (n) => n == null ? "—" : `${n.toFixed(1)}%`,
  war:     (n) => n == null ? "—" : n.toFixed(1),
  rate:    (n) => n == null ? "—" : `$${(n / 1e6).toFixed(2)}M`,
};

const POSITIONS = ["ALL","SP","RP","C","1B","2B","3B","SS","OF","DH"];
const TEAM_MAP = {
  NYA:"NYY", LAN:"LAD", BOS:"BOS", CHN:"CHC", SFN:"SFG",
  PHI:"PHI", HOU:"HOU", ATL:"ATL", NYN:"NYM", SLN:"STL",
  MIN:"MIN", SEA:"SEA", TEX:"TEX", SDN:"SDP", ARI:"ARI",
  TOR:"TOR", CLE:"CLE", DET:"DET", MIL:"MIL", TBA:"TBR",
  BAL:"BAL", KCA:"KCR", CIN:"CIN", PIT:"PIT", COL:"COL",
  OAK:"OAK", ATH:"ATH", ANA:"LAA", MIA:"MIA", WAS:"WSN", CHA:"CWS",
};
const abbr = (t) => TEAM_MAP[t] || t;

// ── Surplus bar (zero-centered) ──────────────────────────────────────────────
function SurplusBar({ value, max }) {
  if (value == null) return <span style={{ color: T.textLow, fontFamily: "DM Mono, monospace" }}>—</span>;
  const pct = Math.min(Math.abs(value) / max, 1) * 45;
  const pos = value >= 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "DM Mono, monospace", fontSize: 12 }}>
      <div style={{ width: 90, display: "flex", justifyContent: "flex-end" }}>
        {!pos && (
          <div style={{ width: `${pct}%`, height: 6, background: T.red, borderRadius: "3px 0 0 3px", minWidth: 2 }} />
        )}
      </div>
      <div style={{ width: 2, height: 14, background: T.border }} />
      <div style={{ width: 90 }}>
        {pos && (
          <div style={{ width: `${pct}%`, height: 6, background: T.green, borderRadius: "0 3px 3px 0", minWidth: 2 }} />
        )}
      </div>
      <span style={{ color: pos ? T.green : T.red, minWidth: 60, textAlign: "right" }}>
        {pos ? "+" : ""}{fmt.dollars(value)}
      </span>
    </div>
  );
}

// ── WAR sparkline ────────────────────────────────────────────────────────────
function WarSparkline({ data }) {
  if (!data || Object.keys(data).length === 0) return null;
  const entries = Object.entries(data).sort((a, b) => a[0] - b[0]);
  const vals = entries.map(([, v]) => v);
  const max = Math.max(...vals.map(Math.abs), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 28 }}>
      {entries.map(([yr, v]) => {
        const h = Math.max(Math.abs(v) / max * 24, 2);
        const col = v >= 4 ? T.accent : v >= 2 ? T.blue : v >= 0 ? T.textLow : T.red;
        return (
          <div key={yr} title={`${yr}: ${v} WAR`} style={{ position: "relative" }}>
            <div style={{
              width: 6, height: h, background: col,
              borderRadius: 2, marginBottom: v < 0 ? 0 : undefined,
            }} />
          </div>
        );
      })}
    </div>
  );
}

// ── Expandable contract row ──────────────────────────────────────────────────
function ContractRow({ c, maxSurplus, idx }) {
  const [open, setOpen] = useState(false);
  const isActive = c.contract_status !== "complete";
  const surplus = c.realized_surplus;
  const posColor = {SP:T.accent, RP:T.blue, C:"#fb923c", "1B":"#34d399",
    "2B":"#34d399", "3B":"#34d399", SS:"#34d399", OF:"#facc15", DH:T.textMid};

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        style={{
          background: idx % 2 === 0 ? T.bgCard : T.bg,
          cursor: "pointer",
          transition: "background 0.15s",
          borderBottom: open ? "none" : `1px solid ${T.border}`,
        }}
        onMouseEnter={e => e.currentTarget.style.background = "#1a1535"}
        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? T.bgCard : T.bg}
      >
        <td style={td}>{idx + 1}</td>
        <td style={{ ...td, fontFamily: "Bebas Neue, sans-serif", fontSize: 15, letterSpacing: "0.04em", color: T.textHi }}>
          {c.name}
          {isActive && <span style={{ marginLeft: 6, fontSize: 9, background: T.accentMid, color: "#fff", padding: "1px 5px", borderRadius: 3, letterSpacing: "0.08em" }}>ACTIVE</span>}
        </td>
        <td style={{ ...td, color: T.textLow }}>{c.signing_class}</td>
        <td style={{ ...td, color: T.textMid, fontFamily: "DM Mono, monospace" }}>{abbr(c.new_team)}</td>
        <td style={td}>
          <span style={{ background: (posColor[c.position_group] || T.textLow) + "22", color: posColor[c.position_group] || T.textLow, padding: "2px 7px", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace", fontWeight: 600 }}>
            {c.position_group}
          </span>
        </td>
        <td style={{ ...td, color: T.textMid, fontFamily: "DM Mono, monospace" }}>{c.age_at_signing}</td>
        <td style={{ ...td, fontFamily: "DM Mono, monospace", color: T.textMid }}>{c.years}yr / {fmt.dollars(c.aav)}</td>
        <td style={{ ...td, fontFamily: "DM Mono, monospace", color: c.total_realized_war >= 3 ? T.accent : T.textMid }}>
          {fmt.war(c.total_realized_war)}
        </td>
        <td style={td}>
          <SurplusBar value={surplus} max={maxSurplus} />
        </td>
        <td style={{ ...td, fontFamily: "DM Mono, monospace", color: T.textLow, fontSize: 11 }}>
          {fmt.pct(c.pct_of_cbt)}
        </td>
      </tr>
      {open && (
        <tr style={{ background: "#0f0c20", borderBottom: `1px solid ${T.border}` }}>
          <td colSpan={10} style={{ padding: "12px 20px 16px" }}>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: T.textLow, fontSize: 10, letterSpacing: "0.1em", fontFamily: "DM Mono, monospace", marginBottom: 6 }}>WAR BY SEASON</div>
                <WarSparkline data={c.war_by_season} />
                {c.war_by_season && (
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    {Object.entries(c.war_by_season).sort((a,b)=>a[0]-b[0]).map(([yr, v]) => (
                      <div key={yr} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textLow }}>{yr}</div>
                        <div style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: v >= 3 ? T.accent : v >= 0 ? T.textMid : T.red }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                {[
                  ["Guarantee", fmt.dollars(c.guarantee)],
                  ["AAV", fmt.dollars(c.aav)],
                  ["% of CBT", fmt.pct(c.pct_of_cbt)],
                  ["% of Payroll", fmt.pct(c.pct_of_payroll)],
                  ["Baseline WAR", fmt.war(c.baseline_war)],
                  ["Expected WAR", fmt.war(c.expected_war_total)],
                  ["Market Rate", fmt.rate(c.market_rate_at_signing)],
                  ["Realized Surplus", fmt.dollars(c.realized_surplus)],
                  ["Expected Surplus", fmt.dollars(c.expected_surplus)],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ color: T.textLow, fontSize: 9, letterSpacing: "0.1em", fontFamily: "DM Mono, monospace" }}>{label.toUpperCase()}</div>
                    <div style={{ color: T.textHi, fontFamily: "DM Mono, monospace", fontSize: 13, marginTop: 2 }}>{val}</div>
                  </div>
                ))}
              </div>
              {isActive && (
                <div style={{ background: T.gold + "18", border: `1px solid ${T.gold}44`, borderRadius: 6, padding: "6px 12px", fontSize: 11, color: T.gold, fontFamily: "DM Mono, monospace", maxWidth: 280 }}>
                  ⚠ Active contract — surplus reflects seasons played to date only
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const td = { padding: "10px 12px", fontSize: 13, color: T.textMid, whiteSpace: "nowrap" };
const th = { padding: "8px 12px", fontSize: 10, letterSpacing: "0.1em", color: T.textLow, fontFamily: "DM Mono, monospace", textAlign: "left", borderBottom: `1px solid ${T.border}`, userSelect: "none" };

// ── LEADERBOARD VIEW ─────────────────────────────────────────────────────────
function LeaderboardView() {
  const [contracts, setContracts]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [pos, setPos]               = useState("ALL");
  const [status, setStatus]         = useState("complete");
  const [sortBy, setSortBy]         = useState("realized_surplus");
  const [order, setOrder]           = useState("desc");
  const [minYears, setMinYears]     = useState(2);
  const [eraStart, setEraStart]     = useState("");
  const [eraEnd, setEraEnd]         = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort_by: sortBy, order, min_years: minYears, limit: 100,
        ...(pos !== "ALL" && { position_group: pos }),
        ...(status !== "ALL" && { status }),
        ...(eraStart && { era_start: eraStart }),
        ...(eraEnd && { era_end: eraEnd }),
      });
      const res = await fetch(`${API}/economics/leaderboard?${params}`);
      setContracts(await res.json());
    } catch { setContracts([]); }
    setLoading(false);
  }, [pos, status, sortBy, order, minYears, eraStart, eraEnd]);

  useEffect(() => { load(); }, [load]);

  const maxSurplus = Math.max(...contracts.map(c => Math.abs(c.realized_surplus || 0)), 1);

  const sortOptions = [
    { val: "realized_surplus", label: "Surplus" },
    { val: "aav", label: "AAV" },
    { val: "total_realized_war", label: "WAR" },
    { val: "pct_of_cbt", label: "% of CBT" },
  ];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 16, padding: "12px 16px", background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}` }}>
        {/* Position */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {POSITIONS.map(p => (
            <button key={p} onClick={() => setPos(p)} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace",
              cursor: "pointer", border: pos === p ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
              background: pos === p ? T.accent + "22" : "transparent",
              color: pos === p ? T.accent : T.textLow, transition: "all 0.15s",
            }}>{p}</button>
          ))}
        </div>
        <div style={{ width: 1, height: 24, background: T.border }} />
        {/* Status */}
        {["ALL","complete","active"].map(s => (
          <button key={s} onClick={() => setStatus(s)} style={{
            padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace",
            cursor: "pointer", border: status === s ? `1px solid ${T.gold}` : `1px solid ${T.border}`,
            background: status === s ? T.gold + "22" : "transparent",
            color: status === s ? T.gold : T.textLow,
          }}>{s.toUpperCase()}</button>
        ))}
        <div style={{ width: 1, height: 24, background: T.border }} />
        {/* Sort */}
        <div style={{ display: "flex", gap: 4 }}>
          {sortOptions.map(o => (
            <button key={o.val} onClick={() => setSortBy(o.val)} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace",
              cursor: "pointer", border: sortBy === o.val ? `1px solid ${T.blue}` : `1px solid ${T.border}`,
              background: sortBy === o.val ? T.blue + "22" : "transparent",
              color: sortBy === o.val ? T.blue : T.textLow,
            }}>{o.label}</button>
          ))}
        </div>
        <button onClick={() => setOrder(o => o === "desc" ? "asc" : "desc")} style={{
          padding: "4px 10px", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace",
          cursor: "pointer", border: `1px solid ${T.border}`, background: "transparent", color: T.textMid,
        }}>{order === "desc" ? "▼ Best first" : "▲ Worst first"}</button>
        {/* Era */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.textLow, fontFamily: "DM Mono, monospace" }}>ERA</span>
          <input type="number" placeholder="1991" value={eraStart}
            onChange={e => setEraStart(e.target.value)}
            style={{ width: 54, background: T.bg, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "DM Mono, monospace" }} />
          <span style={{ color: T.textLow }}>–</span>
          <input type="number" placeholder="2026" value={eraEnd}
            onChange={e => setEraEnd(e.target.value)}
            style={{ width: 54, background: T.bg, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "DM Mono, monospace" }} />
        </div>
        {/* Min years */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontSize: 10, color: T.textLow, fontFamily: "DM Mono, monospace" }}>MIN YRS</span>
          <select value={minYears} onChange={e => setMinYears(Number(e.target.value))}
            style={{ background: T.bg, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 4, padding: "3px 6px", fontSize: 11, fontFamily: "DM Mono, monospace" }}>
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}+</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 48, color: T.textLow, fontFamily: "DM Mono, monospace", letterSpacing: "0.1em" }}>LOADING…</div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${T.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: T.bgDeep }}>
                <th style={th}>#</th>
                <th style={th}>PLAYER</th>
                <th style={th}>CLASS</th>
                <th style={th}>TEAM</th>
                <th style={th}>POS</th>
                <th style={th}>AGE</th>
                <th style={th}>CONTRACT</th>
                <th style={th}>WAR</th>
                <th style={{ ...th, minWidth: 260 }}>SURPLUS</th>
                <th style={th}>CBT%</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => (
                <ContractRow key={`${c.name}-${c.signing_class}-${c.new_team}`} c={c} maxSurplus={maxSurplus} idx={i} />
              ))}
              {contracts.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 32, textAlign: "center", color: T.textLow, fontFamily: "DM Mono, monospace" }}>NO CONTRACTS FOUND</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11, color: T.textLow, fontFamily: "DM Mono, monospace" }}>
        {contracts.length} contracts · Click any row to expand · Surplus = (WAR × $/WAR at signing) − salary paid
      </div>
    </div>
  );
}

// ── MARKET RATE VIEW ─────────────────────────────────────────────────────────
function MarketRateView() {
  const [rates, setRates] = useState([]);

  useEffect(() => {
    fetch(`${API}/economics/market-rates`)
      .then(r => r.json())
      .then(setRates)
      .catch(() => setRates([]));
  }, []);

  if (!rates.length) return (
    <div style={{ textAlign: "center", padding: 48, color: T.textLow, fontFamily: "DM Mono, monospace" }}>LOADING…</div>
  );

  const labels = rates.map(r => r.season);
  const values = rates.map(r => r.dollars_per_war / 1e6);
  const latestRate = rates[rates.length - 1];
  const firstRate  = rates[0];
  const peakRate   = rates.reduce((a, b) => a.dollars_per_war > b.dollars_per_war ? a : b);
  const inflation  = ((latestRate.dollars_per_war - firstRate.dollars_per_war) / firstRate.dollars_per_war * 100).toFixed(0);

  const chartData = {
    labels,
    datasets: [{
      label: "$/WAR",
      data: values,
      borderColor: T.accent,
      backgroundColor: T.accent + "18",
      pointBackgroundColor: T.accent,
      pointRadius: 3,
      pointHoverRadius: 6,
      fill: true,
      tension: 0.3,
      borderWidth: 2,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: T.bgCard,
        borderColor: T.border,
        borderWidth: 1,
        titleColor: T.accent,
        bodyColor: T.textMid,
        callbacks: {
          title: ([item]) => `${item.label} FA Class`,
          label: (item) => ` $${item.raw.toFixed(2)}M per WAR`,
        },
      },
    },
    scales: {
      x: { ticks: { color: T.textLow, font: { family: "DM Mono, monospace", size: 10 } }, grid: { color: T.border + "66" } },
      y: {
        ticks: { color: T.textLow, font: { family: "DM Mono, monospace", size: 10 }, callback: v => `$${v.toFixed(1)}M` },
        grid: { color: T.border + "66" },
      },
    },
  };

  const statCard = (label, value, sub) => (
    <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "16px 20px", minWidth: 140 }}>
      <div style={{ fontSize: 10, color: T.textLow, fontFamily: "DM Mono, monospace", letterSpacing: "0.1em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontFamily: "Bebas Neue, sans-serif", color: T.accent, letterSpacing: "0.04em" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.textLow, fontFamily: "DM Mono, monospace", marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
        {statCard("2024 MARKET RATE", fmt.rate(latestRate.dollars_per_war), `${latestRate.sample_size} contracts`)}
        {statCard("PEAK RATE", fmt.rate(peakRate.dollars_per_war), `${peakRate.season} FA class`)}
        {statCard("INFLATION 1991→NOW", `+${inflation}%`, "nominal $/WAR growth")}
        {statCard("1991 BASELINE", fmt.rate(firstRate.dollars_per_war), `${firstRate.sample_size} contracts`)}
      </div>
      <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: 20, height: 340 }}>
        <Line data={chartData} options={chartOptions} />
      </div>
      <div style={{ marginTop: 16, padding: "12px 16px", background: T.bgCard, borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 12, color: T.textMid, fontFamily: "DM Mono, monospace", lineHeight: 1.7 }}>
        <span style={{ color: T.accent }}>HOW TO READ THIS</span> · Each point is the implied market price of one WAR
        for that free agent class, derived from completed contracts with ≥0.5 WAR/season.
        Spikes in <span style={{ color: T.gold }}>2016</span> and <span style={{ color: T.gold }}>2022</span> correspond
        to new CBAs where thresholds and spending expectations reset upward.
        Use this to contextualize any contract — a $10M AAV deal in 1998 was equivalent
        to ~{fmt.rate(10e6 / (rates.find(r=>r.season===1998)?.dollars_per_war||4e6))} WAR/yr expected.
      </div>
    </div>
  );
}

// ── TEAM VIEW ────────────────────────────────────────────────────────────────
const TEAMS_LIST = [
  ["NYA","Yankees"],["LAN","Dodgers"],["BOS","Red Sox"],["NYN","Mets"],["CHN","Cubs"],
  ["SFN","Giants"],["PHI","Phillies"],["HOU","Astros"],["ATL","Braves"],["SLN","Cardinals"],
  ["MIN","Twins"],["SEA","Mariners"],["TEX","Rangers"],["SDN","Padres"],["ARI","D-backs"],
  ["TOR","Blue Jays"],["CLE","Guardians"],["DET","Tigers"],["MIL","Brewers"],["TBA","Rays"],
  ["BAL","Orioles"],["KCA","Royals"],["CIN","Reds"],["PIT","Pirates"],["COL","Rockies"],
  ["ATH","Athletics"],["ANA","Angels"],["MIA","Marlins"],["WAS","Nationals"],["CHA","White Sox"],
];

function TeamView() {
  const [team, setTeam] = useState("LAN");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/economics/team?team=${t}&sort_by=signing_class&order=desc`);
      setData(await res.json());
    } catch { setData(null); }
    setLoading(false);
  }, []);

  useEffect(() => { load(team); }, [team, load]);

  const s = data?.summary;
  const surplusColor = s?.total_surplus >= 0 ? T.green : T.red;

  return (
    <div>
      {/* Team selector */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {TEAMS_LIST.map(([code, name]) => (
          <button key={code} onClick={() => setTeam(code)} style={{
            padding: "5px 11px", borderRadius: 4, fontSize: 11, fontFamily: "DM Mono, monospace",
            cursor: "pointer", transition: "all 0.15s",
            border: team === code ? `1px solid ${T.accent}` : `1px solid ${T.border}`,
            background: team === code ? T.accent + "22" : "transparent",
            color: team === code ? T.accent : T.textLow,
          }} title={name}>{abbr(code)}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 48, color: T.textLow, fontFamily: "DM Mono, monospace" }}>LOADING…</div>}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            {[
              ["TOTAL SPENT", fmt.dollars(s.total_spent), "in FA guarantees"],
              ["TOTAL SURPLUS", fmt.dollars(s.total_surplus), s.total_surplus >= 0 ? "net team win" : "net overpay"],
              ["WIN RATE", `${s.win_rate}%`, `${s.wins}W ${s.losses}L (completed)`],
              ["BEST SIGNING", s.best_contract, "by realized surplus"],
              ["WORST SIGNING", s.worst_contract, "by realized surplus"],
            ].map(([label, val, sub]) => (
              <div key={label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "14px 18px", minWidth: 140, flex: 1 }}>
                <div style={{ fontSize: 10, color: T.textLow, fontFamily: "DM Mono, monospace", letterSpacing: "0.1em", marginBottom: 4 }}>{label}</div>
                <div style={{
                  fontSize: label.includes("SPENDING") || label.includes("SURPLUS") ? 20 : 15,
                  fontFamily: "Bebas Neue, sans-serif",
                  color: label === "TOTAL SURPLUS" ? surplusColor : label === "WIN RATE" ? T.gold : T.textHi,
                  letterSpacing: "0.04em", lineHeight: 1.2,
                }}>{val}</div>
                <div style={{ fontSize: 11, color: T.textLow, fontFamily: "DM Mono, monospace", marginTop: 3 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Payroll history mini */}
          {data.payroll_history?.length > 0 && (
            <div style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: T.textLow, fontFamily: "DM Mono, monospace", letterSpacing: "0.1em", marginBottom: 10 }}>OPENING DAY PAYROLL HISTORY</div>
              <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 40, overflowX: "auto" }}>
                {[...data.payroll_history].reverse().map(p => {
                  const maxP = Math.max(...data.payroll_history.map(x => x.opening_day_payroll || 0));
                  const h = p.opening_day_payroll ? Math.max((p.opening_day_payroll / maxP) * 36, 3) : 3;
                  return (
                    <div key={p.season} title={`${p.season}: ${fmt.dollars(p.opening_day_payroll)}`}
                      style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <div style={{ width: 8, height: h, background: T.accentMid + "99", borderRadius: "2px 2px 0 0" }} />
                      <div style={{ fontSize: 8, color: T.textLow, fontFamily: "DM Mono, monospace", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
                        {p.season}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Contract list */}
          <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${T.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.bgDeep }}>
                  {["PLAYER","CLASS","POS","AGE","CONTRACT","WAR","SURPLUS","CBT%","PAYROLL%"].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.contracts.map((c, i) => {
                  const isActive = c.contract_status !== "complete";
                  const sp = c.realized_surplus;
                  return (
                    <tr key={`${c.name}-${c.signing_class}`}
                      style={{ background: i % 2 === 0 ? T.bgCard : T.bg, borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ ...td, fontFamily: "Bebas Neue, sans-serif", fontSize: 14, color: T.textHi }}>
                        {c.name}
                        {isActive && <span style={{ marginLeft: 6, fontSize: 9, background: T.accentMid, color: "#fff", padding: "1px 5px", borderRadius: 3 }}>ACTIVE</span>}
                      </td>
                      <td style={{ ...td, color: T.textLow }}>{c.signing_class}</td>
                      <td style={{ ...td, fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textLow }}>{c.position_group}</td>
                      <td style={{ ...td, fontFamily: "DM Mono, monospace", color: T.textLow }}>{c.age_at_signing}</td>
                      <td style={{ ...td, fontFamily: "DM Mono, monospace", color: T.textMid }}>{c.years}yr / {fmt.dollars(c.aav)}</td>
                      <td style={{ ...td, fontFamily: "DM Mono, monospace", color: c.total_realized_war >= 3 ? T.accent : T.textMid }}>
                        {fmt.war(c.total_realized_war)}
                      </td>
                      <td style={{ ...td, fontFamily: "DM Mono, monospace", color: sp == null ? T.textLow : sp >= 0 ? T.green : T.red }}>
                        {sp == null ? "—" : `${sp >= 0 ? "+" : ""}${fmt.dollars(sp)}`}
                      </td>
                      <td style={{ ...td, fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textLow }}>{fmt.pct(c.pct_of_cbt)}</td>
                      <td style={{ ...td, fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textLow }}>{fmt.pct(c.pct_of_payroll)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function ContractEconomics() {
  const [view, setView] = useState("leaderboard");

  const views = [
    { id: "leaderboard", label: "⚾ LEADERBOARD" },
    { id: "market",      label: "📈 MARKET RATE" },
    { id: "team",        label: "🏟 BY TEAM" },
  ];

  return (
    <div style={{ background: T.bg, minHeight: "100vh", padding: "0 0 48px" }}>
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.border}`, padding: "20px 24px 0", background: T.bgCard }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontFamily: "Bebas Neue, sans-serif", fontSize: 32, letterSpacing: "0.06em", color: T.accent, margin: 0 }}>
            CONTRACT ECONOMICS
          </h1>
          <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textLow, letterSpacing: "0.1em" }}>
            1991 – 2026 · FA CLASS ANALYSIS
          </span>
        </div>
        <p style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textLow, margin: "0 0 16px", maxWidth: 600 }}>
          Era-normalized contract value using implied $/WAR market rates. Surplus = market value of WAR delivered minus salary paid — positive means the team won.
        </p>
        {/* Sub-nav */}
        <div style={{ display: "flex", gap: 0 }}>
          {views.map(v => (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              padding: "8px 18px", fontFamily: "DM Mono, monospace", fontSize: 11, letterSpacing: "0.08em",
              cursor: "pointer", border: "none", background: "transparent",
              color: view === v.id ? T.accent : T.textLow,
              borderBottom: view === v.id ? `2px solid ${T.accent}` : "2px solid transparent",
              transition: "all 0.15s",
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px" }}>
        {view === "leaderboard" && <LeaderboardView />}
        {view === "market"      && <MarketRateView />}
        {view === "team"        && <TeamView />}
      </div>
    </div>
  );
}
