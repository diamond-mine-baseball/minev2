// ─────────────────────────────────────────────────────────────────────────────
// LeaderboardTV.jsx  —  Drop into dashboard/src/
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';

const MLB   = 'https://statsapi.mlb.com/api/v1';
const YEAR  = new Date().getFullYear();
const TICK  = 12_000;
const LIME  = '#C8F135';
const FONT_H = "'Bebas Neue', 'Arial Narrow', Impact, sans-serif";
const FONT_M = "'DM Mono', 'Fira Mono', 'Courier New', monospace";

// ─── Stable MLB team ID → info ────────────────────────────────────────────────
// Official logo: https://www.mlbstatic.com/team-logos/{id}.svg  (never breaks)
const TEAM_BY_ID = {
  108:{a:'LAA',n:'Angels'},    109:{a:'ARI',n:'D-backs'},   110:{a:'BAL',n:'Orioles'},
  111:{a:'BOS',n:'Red Sox'},   112:{a:'CHC',n:'Cubs'},      113:{a:'CIN',n:'Reds'},
  114:{a:'CLE',n:'Guardians'}, 115:{a:'COL',n:'Rockies'},   116:{a:'DET',n:'Tigers'},
  117:{a:'HOU',n:'Astros'},    118:{a:'KC', n:'Royals'},    119:{a:'LAD',n:'Dodgers'},
  120:{a:'WSH',n:'Nationals'}, 121:{a:'NYM',n:'Mets'},      133:{a:'ATH',n:'Athletics'},
  134:{a:'PIT',n:'Pirates'},   135:{a:'SD', n:'Padres'},    136:{a:'SEA',n:'Mariners'},
  137:{a:'SF', n:'Giants'},    138:{a:'STL',n:'Cardinals'}, 139:{a:'TB', n:'Rays'},
  140:{a:'TEX',n:'Rangers'},   141:{a:'TOR',n:'Blue Jays'}, 142:{a:'MIN',n:'Twins'},
  143:{a:'PHI',n:'Phillies'},  144:{a:'ATL',n:'Braves'},    145:{a:'CWS',n:'White Sox'},
  146:{a:'MIA',n:'Marlins'},   147:{a:'NYY',n:'Yankees'},   158:{a:'MIL',n:'Brewers'},
};

const TEAM_COLOR = {
  LAA:'#ba0021', ARI:'#a71930', BAL:'#df4601', BOS:'#bd3039', CHC:'#0e3386',
  CIN:'#c6011f', CLE:'#00385d', COL:'#333366', DET:'#0c2340', HOU:'#eb6e1f',
  KC: '#004687', LAD:'#005a9c', WSH:'#ab0003', NYM:'#002d72', ATH:'#003831',
  PIT:'#fdb827', SD: '#2f241d', SEA:'#005c5c', SF: '#fd5a1e', STL:'#c41e3a',
  TB: '#092c5c', TEX:'#003278', TOR:'#134ac0', MIN:'#002b5c', PHI:'#e81828',
  ATL:'#ce1141', CWS:'#555',   MIA:'#00a3e0', NYY:'#444',    MIL:'#ffc52f',
};

const teamLogo = id  => `https://www.mlbstatic.com/team-logos/${id}.svg`;
const headshot = id  => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`;

// ─── Injected CSS ─────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap');
.ldr-page { height:100%; display:flex; flex-direction:column; animation: ldrPage 0.55s cubic-bezier(.25,.46,.45,.94) both; }
.ldr-feat { animation: ldrFeat 0.5s cubic-bezier(.34,1.36,.64,1) both; }
.ldr-row  { animation: ldrRow  0.38s ease both; }
@keyframes ldrPage { from { transform:translateX(3%); opacity:0; } to { transform:translateX(0); opacity:1; } }
@keyframes ldrFeat { from { transform:scale(.82) translateY(-8px); opacity:0; } to { transform:scale(1) translateY(0); opacity:1; } }
@keyframes ldrRow  { from { transform:translateY(10px); opacity:0; } to { transform:translateY(0); opacity:1; } }
@keyframes ldrSpin { to { transform:rotate(360deg); } }
`;

// ─── Tie / overflow logic ─────────────────────────────────────────────────────
function applyTies(sorted, limit = 10) {
  if (!sorted.length) return [];
  const groups = [];
  for (const item of sorted) {
    const g = groups[groups.length - 1];
    if (g && g.v === item.v) g.list.push(item);
    else groups.push({ v: item.v, list: [item] });
  }
  const rows = [];
  let base = 1;
  for (const { v, list } of groups) {
    if (rows.length >= limit) break;
    const alpha = [...list].sort((a, b) =>
      (a.name || '').split(' ')[0].localeCompare((b.name || '').split(' ')[0])
    );
    const room = limit - rows.length;
    if (alpha.length <= room) {
      alpha.forEach((p, i) => rows.push({ ...p, v, rank: base + i }));
    } else if (room === 1) {
      rows.push({ name: `${alpha.length} tied`, v, rank: base, overflow: true });
    } else {
      for (let i = 0; i < room - 1; i++) rows.push({ ...alpha[i], v, rank: base + i });
      rows.push({ name: `${alpha.length - room + 1} others tied`, v, rank: base + room - 1, overflow: true });
    }
    base += list.length;
  }
  return rows;
}

// ─── Data helpers ─────────────────────────────────────────────────────────────
function toPlayer(s, v) {
  const abbr = s.team?.abbreviation || TEAM_BY_ID[s.team?.id]?.a || '?';
  return { id: s.player?.id, name: s.player?.fullName || '?', team: abbr, pos: s.position?.abbreviation || '—', v };
}
function toTeam(s, v) {
  const tid  = s.team?.id;
  const info = TEAM_BY_ID[tid] || {};
  const abbr = info.a || s.team?.abbreviation || '?';
  const name = info.n || s.team?.name || '?';
  return { id: tid, name, abbrev: abbr, logo: tid ? teamLogo(tid) : null, color: TEAM_COLOR[abbr] || '#333', v, isTeam: true };
}

function rankPlayers(splits, getValue, asc = false) {
  const items = splits.map(s => toPlayer(s, getValue(s))).filter(x => x.v != null && !isNaN(x.v));
  items.sort((a, b) => asc ? a.v - b.v : b.v - a.v);
  return applyTies(items);
}
function rankTeams(splits, getValue, asc = false) {
  const items = splits.map(s => toTeam(s, getValue(s))).filter(x => x.v != null && !isNaN(x.v));
  items.sort((a, b) => asc ? a.v - b.v : b.v - a.v);
  return applyTies(items);
}

// ─── Data builder ─────────────────────────────────────────────────────────────
function buildData(hs, ps, tbs, tps) {
  const f = parseFloat;

  const sp = ps.filter(s => {
    const gp = Math.max(s.stat.gamesPlayed || 1, 1);
    return (s.stat.gamesStarted || 0) / gp >= 0.5 && (s.stat.gamesStarted || 0) >= 1;
  });
  const rp = ps.filter(s => {
    const gp = Math.max(s.stat.gamesPlayed || 1, 1);
    return (s.stat.gamesStarted || 0) / gp < 0.5;
  });

  const maxGP  = Math.max(...hs.map(s => s.stat.gamesPlayed || 0), 1);
  const qH     = hs.filter(s => (s.stat.plateAppearances || 0) >= maxGP * 3.1);
  const spMaxGP = Math.max(...sp.map(s => s.stat.gamesPlayed || 0), 1);
  const qSP    = sp.filter(s => f(s.stat.inningsPitched || 0) >= spMaxGP * 1.0);

  return {
    p1_hr:    rankPlayers(hs,  s => s.stat.homeRuns),
    p1_sb:    rankPlayers(hs,  s => s.stat.stolenBases),
    p1_h:     rankPlayers(hs,  s => s.stat.hits),
    p1_rbi:   rankPlayers(hs,  s => s.stat.rbi ?? s.stat.runsBattedIn),

    p2_ops:   rankPlayers(qH,  s => f(s.stat.ops) || 0),
    p2_hrPct: rankPlayers(hs.filter(s => (s.stat.atBats||0) >= 20),
                s => s.stat.atBats ? (s.stat.homeRuns / s.stat.atBats) * 100 : null),
    p2_kPct:  rankPlayers(hs.filter(s => (s.stat.plateAppearances||0) >= 20),
                s => s.stat.plateAppearances ? ((s.stat.strikeOuts||s.stat.strikeouts||0) / s.stat.plateAppearances) * 100 : null),
    p2_bbPct: rankPlayers(hs.filter(s => (s.stat.plateAppearances||0) >= 20),
                s => s.stat.plateAppearances ? (s.stat.baseOnBalls / s.stat.plateAppearances) * 100 : null),

    p3_wins:  rankPlayers(sp,  s => s.stat.wins),
    p3_k:     rankPlayers(sp,  s => s.stat.strikeOuts || s.stat.strikeouts),
    p3_bb:    rankPlayers(sp,  s => s.stat.baseOnBalls),
    p3_er:    rankPlayers(sp,  s => s.stat.earnedRuns),

    p4_era:   rankPlayers(qSP, s => f(s.stat.era),               true),
    p4_k9:    rankPlayers(qSP, s => f(s.stat.strikeoutsPer9Inn)      ),
    p4_bb9:   rankPlayers(qSP, s => f(s.stat.walksPer9Inn),       true),
    p4_whip:  rankPlayers(qSP, s => f(s.stat.whip),               true),

    p5_sv:    rankPlayers(rp,  s => s.stat.saves),
    p5_hld:   rankPlayers(rp,  s => s.stat.holds),
    p5_bs:    rankPlayers(rp,  s => s.stat.blownSaves),
    p5_k:     rankPlayers(rp,  s => s.stat.strikeOuts || s.stat.strikeouts),

    p6_rg:    rankTeams(tbs, s => s.stat.gamesPlayed ? s.stat.runs       / s.stat.gamesPlayed : null),
    p6_ops:   rankTeams(tbs, s => f(s.stat.ops) || 0),
    p6_hrg:   rankTeams(tbs, s => s.stat.gamesPlayed ? s.stat.homeRuns   / s.stat.gamesPlayed : null),
    p6_lob:   rankTeams(tbs, s => s.stat.gamesPlayed ? s.stat.leftOnBase / s.stat.gamesPlayed : null),

    p7_rag:   rankTeams(tps, s => s.stat.gamesPlayed ? s.stat.runs       / s.stat.gamesPlayed : null, true),
    p7_k9:    rankTeams(tps, s => f(s.stat.strikeoutsPer9Inn)                                        ),
    p7_era:   rankTeams(tps, s => f(s.stat.era),                                                 true),
    p7_bb9:   rankTeams(tps, s => f(s.stat.walksPer9Inn),                                        true),
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fN    = (v, d = 0) => (v == null || isNaN(+v)) ? '—' : (+v).toFixed(d);
const fRate = v => fN(v, 3).replace(/^0\./, '.');
const fPct  = v => fN(v, 1) + '%';
const fD    = d => v => fN(v, d);

// ─── Page definitions ─────────────────────────────────────────────────────────
const buildPages = d => [
  { title:'BATTING LEADERS',       badge:'Individual — All Hitters', cols:[
    { label:'HOME RUNS',    rows:d.p1_hr,    fv:fD(0) },
    { label:'STOLEN BASES', rows:d.p1_sb,    fv:fD(0) },
    { label:'HITS',         rows:d.p1_h,     fv:fD(0) },
    { label:'RBI',          rows:d.p1_rbi,   fv:fD(0) },
  ]},
  { title:'BATTING RATE LEADERS',  badge:'Individual — Min. Qualifying PA', cols:[
    { label:'OPS',  rows:d.p2_ops,   fv:fRate },
    { label:'HR %', rows:d.p2_hrPct, fv:fPct  },
    { label:'K %',  rows:d.p2_kPct,  fv:fPct  },
    { label:'BB %', rows:d.p2_bbPct, fv:fPct  },
  ]},
  { title:'PITCHING LEADERS',      badge:'Starting Pitchers', cols:[
    { label:'WINS',          rows:d.p3_wins, fv:fD(0) },
    { label:'STRIKEOUTS',    rows:d.p3_k,    fv:fD(0) },
    { label:'WALKS',         rows:d.p3_bb,   fv:fD(0) },
    { label:'EARNED RUNS ↑', rows:d.p3_er,   fv:fD(0) },
  ]},
  { title:'PITCHING RATE LEADERS', badge:'Starting Pitchers — Qualified', cols:[
    { label:'ERA ↓',    rows:d.p4_era,  fv:fD(2) },
    { label:'K / 9',    rows:d.p4_k9,   fv:fD(1) },
    { label:'BB / 9 ↓', rows:d.p4_bb9,  fv:fD(2) },
    { label:'WHIP ↓',   rows:d.p4_whip, fv:fRate  },
  ]},
  { title:'PITCHING LEADERS',      badge:'Relief Pitchers', cols:[
    { label:'SAVES',       rows:d.p5_sv,  fv:fD(0) },
    { label:'HOLDS',       rows:d.p5_hld, fv:fD(0) },
    { label:'BLOWN SAVES', rows:d.p5_bs,  fv:fD(0) },
    { label:'STRIKEOUTS',  rows:d.p5_k,   fv:fD(0) },
  ]},
  { title:'TEAM BATTING',          badge:`${YEAR} Season`, isTeam:true, cols:[
    { label:'R / GAME',   rows:d.p6_rg,  fv:fD(2) },
    { label:'TEAM OPS',   rows:d.p6_ops, fv:fRate  },
    { label:'HR / GAME',  rows:d.p6_hrg, fv:fD(2) },
    { label:'LOB / GAME', rows:d.p6_lob, fv:fD(1) },
  ]},
  { title:'TEAM PITCHING',         badge:`${YEAR} Season`, isTeam:true, cols:[
    { label:'RA / GAME ↓',  rows:d.p7_rag, fv:fD(2) },
    { label:'K / 9 IP',     rows:d.p7_k9,  fv:fD(1) },
    { label:'TEAM ERA ↓',   rows:d.p7_era, fv:fD(2) },
    { label:'BB / 9 IP ↓',  rows:d.p7_bb9, fv:fD(2) },
  ]},
];

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LeaderboardTV() {
  const [data,     setData    ] = useState(null);
  const [loading,  setLoading ] = useState(true);
  const [error,    setError   ] = useState(null);
  const [page,     setPage    ] = useState(0);
  const [animKey,  setAnimKey ] = useState(0);
  const [progress, setProgress] = useState(100);
  const timerRef = useRef(null);
  const progRef  = useRef(null);
  const t0Ref    = useRef(null);

  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = GLOBAL_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);

  useEffect(() => {
    Promise.all([
      fetch(`${MLB}/stats?stats=season&group=hitting&season=${YEAR}&sportId=1&limit=500&sortStat=plateAppearances`).then(r => r.json()),
      fetch(`${MLB}/stats?stats=season&group=pitching&season=${YEAR}&sportId=1&limit=300&sortStat=inningsPitched`).then(r => r.json()),
      fetch(`${MLB}/teams/stats?stats=season&group=hitting&season=${YEAR}&sportId=1`).then(r => r.json()),
      fetch(`${MLB}/teams/stats?stats=season&group=pitching&season=${YEAR}&sportId=1`).then(r => r.json()),
    ])
      .then(([h, p, tb, tp]) => setData(buildData(
        h.stats?.[0]?.splits  || [],
        p.stats?.[0]?.splits  || [],
        tb.stats?.[0]?.splits || [],
        tp.stats?.[0]?.splits || [],
      )))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!data) return;
    t0Ref.current = Date.now();
    setProgress(100);
    progRef.current = setInterval(() => {
      setProgress(Math.max(0, 100 - ((Date.now() - t0Ref.current) / TICK) * 100));
    }, 50);
    timerRef.current = setTimeout(() => {
      setPage(p => (p + 1) % 7);
      setAnimKey(k => k + 1);
    }, TICK);
    return () => { clearTimeout(timerRef.current); clearInterval(progRef.current); };
  }, [page, data]);

  if (loading) return <LoadingScreen />;
  if (error)   return <ErrorScreen msg={error} />;
  if (!data)   return null;

  const pages = buildPages(data);
  const pg    = pages[page];

  return (
    <div style={css.outer}>
      <div style={css.screen}>
        <div key={animKey} className="ldr-page">
          <PageHeader title={pg.title} badge={pg.badge} pageNum={page} />
          <div style={css.grid}>
            {pg.cols.map((col, ci) => (
              <LeaderColumn key={ci} col={col} colIdx={ci} isTeam={!!pg.isTeam} />
            ))}
          </div>
          <ProgressBar pct={progress} pageNum={page} />
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function PageHeader({ title, badge, pageNum }) {
  return (
    <div style={css.header}>
      <div>
        <div style={{ fontSize:'0.52em', color:LIME, letterSpacing:'0.18em', opacity:0.8, fontFamily:FONT_M }}>{badge}</div>
        <div style={{ fontSize:'2em', fontFamily:FONT_H, letterSpacing:'0.05em', lineHeight:1, marginTop:'0.05em' }}>{title}</div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'0.4em' }}>
        <div style={{ fontSize:'0.45em', color:'rgba(255,255,255,0.35)', letterSpacing:'0.14em', fontFamily:FONT_M }}>{YEAR} · MLB SEASON</div>
        <PagePips total={7} current={pageNum} />
      </div>
    </div>
  );
}

function PagePips({ total, current }) {
  return (
    <div style={{ display:'flex', gap:'0.35em', alignItems:'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          height:'0.35em', width: i === current ? '1.6em' : '0.35em',
          borderRadius:'9999px', background: i === current ? LIME : 'rgba(255,255,255,0.18)',
          transition:'all 0.35s ease', boxShadow: i === current ? `0 0 6px ${LIME}88` : 'none',
        }} />
      ))}
    </div>
  );
}

function LeaderColumn({ col, colIdx, isTeam }) {
  const rows   = col.rows || [];
  const leader = rows[0];
  return (
    <div style={css.col}>
      <div style={css.colLabel}>{col.label}</div>
      <div style={{ flexShrink:0 }}>
        {leader
          ? <FeaturedCard row={leader} isTeam={isTeam} colIdx={colIdx} />
          : <div style={{ height:'4em', display:'flex', alignItems:'center', color:'rgba(255,255,255,0.2)', fontSize:'0.6em', fontFamily:FONT_M }}>No data</div>
        }
      </div>
      <div style={{ height:'1px', background:`${LIME}22`, margin:'0.25em 0 0.1em', flexShrink:0 }} />
      <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        {rows.slice(0, 10).map((row, ri) => (
          <RankRow key={ri} row={row} fv={col.fv} rowIdx={ri} colIdx={colIdx} isTeam={isTeam} />
        ))}
        {rows.length === 0 && (
          <div style={{ fontSize:'0.55em', color:'rgba(255,255,255,0.2)', padding:'0.4em 0', fontFamily:FONT_M }}>Season not started</div>
        )}
      </div>
    </div>
  );
}

function FeaturedCard({ row, isTeam, colIdx }) {
  const accentColor = isTeam ? (row.color || '#333') : (TEAM_COLOR[row.team] || '#333');
  const imgSrc      = isTeam ? row.logo : headshot(row.id);
  return (
    <div className="ldr-feat" style={{ animationDelay:`${colIdx * 0.07}s`, display:'flex', alignItems:'center', gap:'0.55em', padding:'0.35em 0.15em' }}>
      <div style={{
        width:'3em', height:'3em', flexShrink:0,
        borderRadius: isTeam ? '0.3em' : '50%',
        border:`1.5px solid ${LIME}44`, background:`${accentColor}28`,
        overflow:'hidden', boxShadow:`0 2px 14px ${accentColor}55`,
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <img src={imgSrc} alt={row.name}
          style={{ width:'100%', height:'100%', objectFit: isTeam ? 'contain' : 'cover' }}
          onError={e => { e.target.style.opacity = '0'; }} />
      </div>
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ fontFamily:FONT_H, letterSpacing:'0.04em', lineHeight:1.05, fontSize:'0.86em', color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {row.name}
        </div>
        <div style={{ fontSize:'0.56em', color:LIME, opacity:0.85, letterSpacing:'0.12em', marginTop:'0.15em', fontFamily:FONT_M }}>
          {isTeam ? row.abbrev : `${row.pos} · ${row.team}`}
        </div>
      </div>
    </div>
  );
}

function RankRow({ row, fv, rowIdx, colIdx, isTeam }) {
  const delay = `${(colIdx * 0.04 + rowIdx * 0.028).toFixed(3)}s`;
  const even  = rowIdx % 2 === 0;
  return (
    <div className="ldr-row" style={{
      animationDelay: delay, display:'flex', alignItems:'center',
      padding:'0.08em 0.35em', background: even ? 'rgba(255,255,255,0.022)' : 'transparent',
      borderRadius:'0.15em', flex:'0 0 auto', opacity: row.overflow ? 0.55 : 1,
    }}>
      <span style={{ width:'1.5em', flexShrink:0, textAlign:'right', paddingRight:'0.35em', fontSize:'0.65em', color:LIME, opacity:0.65, fontFamily:FONT_M, fontWeight:500 }}>
        {row.rank}
      </span>
      <span style={{ flex:1, minWidth:0, fontFamily:FONT_M, fontSize:'0.64em', color: row.overflow ? 'rgba(255,255,255,0.45)' : '#f0f0f0', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontStyle: row.overflow ? 'italic' : 'normal' }}>
        {row.name}
      </span>
      {!isTeam && !row.overflow && (
        <span style={{ flexShrink:0, fontSize:'0.46em', fontFamily:FONT_M, color:'rgba(255,255,255,0.32)', paddingLeft:'0.2em', paddingRight:'0.1em', letterSpacing:'0.04em', whiteSpace:'nowrap' }}>
          {row.pos}&nbsp;{row.team}
        </span>
      )}
      {!row.overflow && (
        <span style={{ flexShrink:0, minWidth:'2.2em', textAlign:'right', fontSize:'0.66em', fontFamily:FONT_M, fontWeight:500, color:LIME, paddingLeft:'0.25em' }}>
          {fv(row.v)}
        </span>
      )}
    </div>
  );
}

function ProgressBar({ pct, pageNum }) {
  const colors = ['#C8F135','#F1D235','#F19035','#F15535','#C835F1','#3580F1','#35F195'];
  const color  = colors[pageNum % colors.length];
  return (
    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'3px', background:'rgba(255,255,255,0.05)' }}>
      <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, ${color}55, ${color})`, boxShadow:`0 0 8px ${color}88`, transition:'width 0.08s linear' }} />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'50vh', gap:'1.2em' }}>
      <div style={{ width:'36px', height:'36px', border:`2.5px solid ${LIME}33`, borderTop:`2.5px solid ${LIME}`, borderRadius:'50%', animation:'ldrSpin 0.9s linear infinite' }} />
      <span style={{ color:LIME, fontFamily:FONT_M, fontSize:'13px', opacity:0.7, letterSpacing:'0.1em' }}>LOADING {YEAR} MLB DATA…</span>
    </div>
  );
}
function ErrorScreen({ msg }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'50vh', color:'#ff5555', fontFamily:FONT_M, fontSize:'13px' }}>
      Failed to load MLB data: {msg}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const css = {
  outer: {
    width:          '100%',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    background:     '#020302',
    padding:        '12px 0',
    boxSizing:      'border-box',
  },
  screen: {
    width:        '100%',
    aspectRatio:  '16 / 9',
    background:   '#080a06',
    borderRadius: '4px',
    boxShadow:    `0 0 0 1px ${LIME}18, 0 0 60px #00000099`,
    overflow:     'hidden',
    position:     'relative',
    fontSize:     'clamp(10px, 1.32vw, 21px)',
    color:        '#fff',
    fontFamily:   FONT_M,
  },
  header: {
    display:'flex', justifyContent:'space-between', alignItems:'center',
    padding:'0.65em 1.1em 0.5em',
    borderBottom:`1px solid ${LIME}0C`,
    background:'rgba(0,0,0,0.18)',
    flexShrink:0,
  },
  grid: {
    display:'grid', gridTemplateColumns:'repeat(4, 1fr)',
    flex:1, overflow:'hidden',
  },
  col: {
    display:'flex', flexDirection:'column',
    padding:'0.45em 0.6em 0.5em',
    borderRight:`1px solid rgba(255,255,255,0.045)`,
    overflow:'hidden',
  },
  colLabel: {
    fontSize:'0.78em', fontFamily:FONT_H,
    letterSpacing:'0.22em', color:LIME,
    textTransform:'uppercase', marginBottom:'0.1em', flexShrink:0,
  },
};
