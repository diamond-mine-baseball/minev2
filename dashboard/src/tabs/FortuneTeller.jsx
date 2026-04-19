import React, { useState, useEffect } from 'react'
import Headshot from '../components/ui/Headshot'

// Theme tokens
const T = {
  bgPage:'#0a0e0a',bgCard:'#0f1a0f',bgCardHi:'#132013',
  border:'#1e2e1e',borderHi:'#2a4a2a',
  green:'#39ff14',greenDim:'#1a6e00',
  textHi:'#e8f5e8',textMid:'#8aab8a',textLow:'#4a664a',
  gold:'#d4a800',goldDim:'#6b5200',
  red:'#ff4444',redDim:'#6b1414',
  blue:'#4488ff',blueDim:'#1a3366',
  font:'"DM Mono", monospace',
  fontDisp:'"Bebas Neue", sans-serif',
}

const SIGNAL = {
  breakout:   { label:'BREAKOUT',    color:T.green, bg:T.greenDim, icon:'⚡' },
  regression: { label:'BOUNCE BACK', color:T.gold,  bg:T.goldDim,  icon:'📈' },
  stable:     { label:'WATCH',       color:T.blue,  bg:T.blueDim,  icon:'👁'  },
  noise:      { label:'LUCKY',       color:T.red,   bg:T.redDim,   icon:'🎲' },
}

const METRIC_LABELS = {
  k_pct:'K%', bb_pct:'BB%', xwoba:'xwOBA', barrel_pct:'Barrel%',
  hard_hit_pct:'HardHit%', k_9:'K/9', bb_9:'BB/9', era:'ERA', whip:'WHIP',
}

function ConfidenceBar({ pct }) {
  const color = pct >= 60 ? T.green : pct >= 40 ? T.gold : T.red
  return (
    <div style={{position:'relative',height:4,background:T.border,borderRadius:2,overflow:'hidden'}}>
      <div style={{
        position:'absolute',left:0,top:0,bottom:0,
        width:`${pct}%`,background:color,borderRadius:2,
        transition:'width 0.6s ease',boxShadow:`0 0 6px ${color}88`,
      }}/>
    </div>
  )
}

function MetricPill({ label, current, career, reliability, sustained }) {
  const up = sustained > 0
  const color = up ? T.green : T.red
  const fmt = v => v == null ? '—' : Math.abs(v) < 1 ? Number(v).toFixed(3) : Number(v).toFixed(1)
  return (
    <div style={{
      background:T.bgPage,border:`1px solid ${up?T.greenDim:T.redDim}`,
      borderRadius:4,padding:'4px 8px',display:'flex',flexDirection:'column',gap:2,minWidth:80,
    }}>
      <div style={{fontSize:9,color:T.textLow,fontFamily:T.font,letterSpacing:'0.05em'}}>{label}</div>
      <div style={{display:'flex',alignItems:'center',gap:4}}>
        <span style={{fontSize:12,color:T.textHi,fontFamily:T.font}}>{fmt(current)}</span>
        <span style={{fontSize:9,color:T.textLow}}>vs</span>
        <span style={{fontSize:11,color:T.textMid,fontFamily:T.font}}>{fmt(career)}</span>
        <span style={{fontSize:11,color,marginLeft:'auto',fontWeight:700}}>
          {up?'+':''}{fmt(sustained)}
        </span>
      </div>
      <div style={{height:2,background:T.border,borderRadius:1,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${reliability}%`,background:color,borderRadius:1,opacity:0.7}}/>
      </div>
    </div>
  )
}

function PlayerCard({ player, rank }) {
  const [expanded, setExpanded] = useState(false)
  const sig = SIGNAL[player.signal] || SIGNAL.stable
  const confidence = player.overall_confidence || 0
  const metrics = player.sdi_metrics || {}

  return (
    <div
      onClick={() => setExpanded(e=>!e)}
      style={{
        background:expanded?T.bgCardHi:T.bgCard,
        border:`1px solid ${expanded?sig.color+'44':T.border}`,
        borderLeft:`3px solid ${sig.color}`,
        borderRadius:6,padding:'12px 14px',cursor:'pointer',
        transition:'all 0.2s ease',userSelect:'none',
      }}
    >
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{fontSize:10,color:T.textLow,fontFamily:T.fontDisp,width:20,textAlign:'center',flexShrink:0}}>
          {rank}
        </div>
        <Headshot
          player={{name:player.name,headshot:player.headshot,mlbam_id:player.mlbam_id}}
          size={36}
        />
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            <span style={{fontFamily:T.fontDisp,fontSize:16,color:T.textHi,letterSpacing:'0.05em'}}>
              {player.name}
            </span>
            <span style={{
              fontSize:10,padding:'1px 6px',borderRadius:3,
              background:sig.bg,color:sig.color,
              fontFamily:T.font,letterSpacing:'0.05em',
            }}>
              {sig.icon} {sig.label}
            </span>
            <span style={{fontSize:10,color:T.textLow,fontFamily:T.font}}>
              {player.team} · {(player.archetype||'').toUpperCase()}
            </span>
          </div>
          <div style={{marginTop:6}}><ConfidenceBar pct={confidence}/></div>
          <div style={{marginTop:4,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{
              fontSize:13,color:sig.color,fontFamily:T.font,fontWeight:700,
              letterSpacing:'0.02em'
            }}>
              {player.net_sdi > 0 ? '+' : ''}{(player.net_sdi||0).toFixed(3)} SDI
            </span>
            <span style={{fontSize:9,color:T.textLow,fontFamily:T.font}}>
              {confidence}% confidence · {player.career_seasons} seasons ·{' '}
              {player.career_pa
                ? `${Math.round(player.career_pa).toLocaleString()} career PA`
                : player.career_ip
                ? `${Math.round(player.career_ip)} career IP`
                : ''}
            </span>
          </div>
        </div>
        <div style={{fontSize:9,color:T.textLow,fontFamily:T.font,flexShrink:0}}>
          {expanded?'▲':'▼'}
        </div>
      </div>

      {expanded && (
        <div style={{marginTop:12,display:'flex',flexWrap:'wrap',gap:6}}>
          {Object.entries(metrics).map(([key,m])=>(
            <MetricPill
              key={key}
              label={METRIC_LABELS[key]||key}
              current={m.current} career={m.career}
              reliability={m.reliability_pct}
              sustained={m.sustained_deviation}
            />
          ))}
          <div style={{
            width:'100%',marginTop:6,fontSize:10,
            color:T.textLow,fontFamily:T.font,lineHeight:1.5,
          }}>
            <span style={{color:T.textMid}}>Bar</span> = % sample reliability.
            Compared against {player.career_seasons} season career avg.
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ title, subtitle, signal, role, season, icon, accentColor, API_BASE }) {
  const [data, setData]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    setLoading(true); setError(null)
    const ep  = role==='pitcher' ? 'sdi/pitching' : 'sdi/batting'
    const min = role==='pitcher' ? 'min_ip=10'    : 'min_pa=30'
    fetch(`${API_BASE}/${ep}?season=${season}&signal=${signal}&${min}&limit=20&sort_by=net_sdi`)
      .then(r=>r.json())
      .then(d=>{ setData(d.results||[]); setLoading(false) })
      .catch(e=>{ setError(e.message); setLoading(false) })
  }, [role, signal, season, API_BASE])

  return (
    <div style={{flex:'1 1 280px',minWidth:260,display:'flex',flexDirection:'column',gap:8}}>
      <div style={{borderBottom:`2px solid ${accentColor}`,paddingBottom:10,marginBottom:4}}>
        <div style={{fontFamily:T.fontDisp,fontSize:22,color:accentColor,letterSpacing:'0.08em',lineHeight:1}}>
          {icon} {title}
        </div>
        <div style={{fontSize:11,color:T.textLow,fontFamily:T.font,marginTop:4}}>{subtitle}</div>
      </div>

      {loading && (
        <div style={{color:T.textLow,fontFamily:T.font,fontSize:12,padding:'20px 0'}}>
          Computing signal...
        </div>
      )}
      {error && (
        <div style={{color:T.red,fontFamily:T.font,fontSize:11,padding:'12px 0'}}>
          SDI data unavailable — run compute_sdi.py to generate.
        </div>
      )}
      {!loading && !error && data.length===0 && (
        <div style={{color:T.textLow,fontFamily:T.font,fontSize:12,padding:'20px 0'}}>
          No players in this category yet.
        </div>
      )}
      {!loading && data.map((p,i)=>(
        <PlayerCard key={`${p.name}-${p.team}`} player={p} rank={i+1}/>
      ))}
    </div>
  )
}

export default function FortuneTeller({ apiBase }) {
  const [role, setRole]     = useState('batter')
  const [season, setSeason] = useState(new Date().getFullYear())
  const API_BASE = apiBase || import.meta.env?.VITE_API_URL || 'https://minev2-production-84a2.up.railway.app'

  return (
    <div style={{minHeight:'100vh',background:T.bgPage,padding:'20px 16px 40px',fontFamily:T.font}}>

      {/* Header */}
      <div style={{marginBottom:24}}>
        <div style={{display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap'}}>
          <h1 style={{
            fontFamily:T.fontDisp,fontSize:36,color:T.green,
            letterSpacing:'0.1em',margin:0,lineHeight:1,
          }}>
            🔮 FORTUNE TELLER
          </h1>
          <span style={{fontSize:12,color:T.textLow}}>{season} · Early-season signal detection</span>
        </div>
        <p style={{fontSize:12,color:T.textMid,marginTop:8,lineHeight:1.6,maxWidth:680}}>
          The SDI compares current season stats against career baselines using Bayesian
          reliability weights. Confidence grows as sample size increases. Click any
          player to see the metric-by-metric breakdown.
        </p>
      </div>

      {/* Controls */}
      <div style={{display:'flex',gap:8,marginBottom:20,flexWrap:'wrap',alignItems:'center'}}>
        {['batter','pitcher'].map(r=>(
          <button key={r} onClick={()=>setRole(r)} style={{
            padding:'6px 16px',
            background:role===r?T.green:'transparent',
            color:role===r?T.bgPage:T.textMid,
            border:`1px solid ${role===r?T.green:T.border}`,
            borderRadius:4,cursor:'pointer',fontFamily:T.font,
            fontSize:11,letterSpacing:'0.05em',textTransform:'uppercase',
            transition:'all 0.15s',
          }}>
            {r==='batter'?'⚾ Batters':'⚾ Pitchers'}
          </button>
        ))}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
          <span style={{fontSize:11,color:T.textLow}}>SEASON</span>
          <select value={season} onChange={e=>setSeason(Number(e.target.value))} style={{
            background:T.bgCard,color:T.textMid,
            border:`1px solid ${T.border}`,borderRadius:4,
            padding:'4px 8px',fontFamily:T.font,fontSize:11,cursor:'pointer',
          }}>
            {[2026,2025,2024].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* SDI legend */}
      <div style={{display:'flex',gap:16,marginBottom:24,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:10,color:T.textLow,fontFamily:T.font}}>SDI magnitude:</span>
        {[
          {range:'>0.25', label:'Strong signal',  color:T.green},
          {range:'0.10–0.25', label:'Developing', color:T.gold},
          {range:'<0.10', label:'Early/noisy',    color:T.textLow},
        ].map(({range,label,color})=>(
          <div key={range} style={{display:'flex',alignItems:'center',gap:6,fontSize:10,color:T.textLow,fontFamily:T.font}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:color}}/>
            <span style={{color}}>{range}</span>
            <span>{label}</span>
          </div>
        ))}
        <span style={{fontSize:10,color:T.textLow,fontFamily:T.font,marginLeft:8}}>
          Confidence % = how much of expected sample has been logged
        </span>
      </div>

      {/* Three columns */}
      <div style={{display:'flex',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
        <Section
          title="BREAKOUT" icon="⚡"
          subtitle="Outperforming career norms with growing confidence"
          signal="breakout" role={role} season={season}
          accentColor={T.green} API_BASE={API_BASE}
        />
        <Section
          title="REGRESSION RISK" icon="📉"
          subtitle="Underperforming career baseline — regression toward mean expected"
          signal="regression" role={role} season={season}
          accentColor={T.gold} API_BASE={API_BASE}
        />
        <Section
          title="WATCH LIST" icon="👁"
          subtitle="Mixed signals — neither clearly over nor underperforming"
          signal="stable" role={role} season={season}
          accentColor={T.blue} API_BASE={API_BASE}
        />
      </div>

      <div style={{
        marginTop:40,paddingTop:16,borderTop:`1px solid ${T.border}`,
        fontSize:10,color:T.textLow,lineHeight:1.7,maxWidth:680,
      }}>
        <strong style={{color:T.textMid}}>Methodology:</strong> SDI uses archetype-adjusted
        stabilization constants. TTO power hitters have different variance curves than contact
        hitters. ERA/WHIP/BB9 deviations are inverted so positive always means improvement.
        Career baseline excludes current season. Updated daily.
      </div>
    </div>
  )
}
