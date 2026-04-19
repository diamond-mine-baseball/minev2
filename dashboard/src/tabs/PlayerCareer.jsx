import React, { useState } from 'react'
import { Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Tooltip, Filler,
} from 'chart.js'
import { T, S, chartDefaults } from '../theme'
import { api } from '../api/client'
import PlayerSearch from '../components/ui/PlayerSearch'
import Headshot from '../components/ui/Headshot'
import StatBadge from '../components/ui/StatBadge'
import Loading, { ErrorMsg } from '../components/ui/Loading'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler)

const BATTING_CHARTS = [
  { key: 'bwar',    label: 'bWAR',    fmt: v => v?.toFixed(1) },
  { key: 'opsplus', label: 'OPS+',    fmt: v => v },
  { key: 'ops',     label: 'OPS',     fmt: v => v?.toFixed(3) },
  { key: 'hr',      label: 'HR',      fmt: v => v },
  { key: 'avg',     label: 'AVG',     fmt: v => Number(v)?.toFixed(3) },
]

const PITCHING_CHARTS = [
  { key: 'bwar',    label: 'bWAR',    fmt: v => v?.toFixed(1) },
  { key: 'eraplus', label: 'ERA+',    fmt: v => v },
  { key: 'era',     label: 'ERA',     fmt: v => v?.toFixed(2) },
  { key: 'so',      label: 'K',       fmt: v => v },
  { key: 'whip',    label: 'WHIP',    fmt: v => v?.toFixed(3) },
]

function makeLineData(seasons, key) {
  return {
    labels:   seasons.map(s => s.season),
    datasets: [{
      data:            seasons.map(s => s[key]),
      borderColor:     T.accent,
      backgroundColor: T.accent + '15',
      pointBackgroundColor: T.accent,
      pointRadius:     4,
      pointHoverRadius:6,
      borderWidth:     2,
      tension:         0.3,
      fill:            true,
    }],
  }
}

function CareerTable({ seasons, type }) {
  const cols = type === 'batting'
    ? ['season','team','age','g','pa','hr','rbi','sb','avg','obp','slg','ops','bwar','opsplus']
    : ['season','team','age','g','gs','w','l','sv','ip','so','bb','era','whip','bwar','eraplus']

  const fmt = (v, k) => {
    if (v === null || v === undefined) return '—'
    if (['avg','obp','slg','ops','era','whip'].includes(k))
      return Number(v).toFixed(3).replace(/^0\./, '.')
    if (['bwar'].includes(k)) return Number(v).toFixed(1)
    if (['ip'].includes(k)) return Number(v).toFixed(1)
    return v
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c} style={{
                padding: '6px 10px', textAlign: 'right',
                fontSize: 8, letterSpacing: '0.14em',
                color: T.textLow, fontFamily: T.fontMono, fontWeight: 400,
                borderBottom: `1px solid ${T.border}`,
                ...(c === 'season' ? { textAlign: 'left' } : {}),
              }}>
                {c.toUpperCase()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seasons.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
              {cols.map(c => (
                <td key={c} style={{
                  padding: '7px 10px', textAlign: 'right',
                  fontFamily: T.fontMono,
                  color: c === 'bwar' ? T.accentMid : c === 'season' ? T.accent : T.textMid,
                  ...(c === 'season' ? { textAlign: 'left', color: T.accent } : {}),
                }}>
                  {fmt(row[c], c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function PlayerCareer() {
  const [player,  setPlayer]  = useState(null)
  const [data,    setData]    = useState(null)
  const [sdi,     setSdi]     = useState(null)
  const [type,    setType]    = useState('batting')
  const [chartKey,setChartKey]= useState('bwar')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const API_BASE = 'https://minev2-production-84a2.up.railway.app'

  const loadPlayer = async (p) => {
    setLoading(true); setError(null); setData(null)
    setPlayer(p)
    try {
      // Try batting first, fall back to pitching
      let d = await api.careerBatting(p.name)
      if (!d.seasons?.length) {
        d = await api.careerPitching(p.name)
        setType('pitching')
        setChartKey('bwar')
      } else {
        setType('batting')
        setChartKey('bwar')
      }
      setData(d)
      // Fetch SDI for current season
      const curYear = new Date().getFullYear()
      const hasCurrent = d.seasons?.some(s => s.season === curYear)
      if (hasCurrent) {
        fetch(`${API_BASE}/sdi/player?name=${encodeURIComponent(p.name)}&season=${curYear}`)
          .then(r => r.json())
          .then(sd => setSdi(sd.sdi || null))
          .catch(() => setSdi(null))
      } else { setSdi(null) }
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const charts = type === 'batting' ? BATTING_CHARTS : PITCHING_CHARTS
  const seasons = data?.seasons || []

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={S.eyebrow}>PLAYER ANALYSIS</div>
        <div style={S.sectionTitle}>CAREER STATS</div>
      </div>

      {/* Search */}
      <PlayerSearch
        onSelect={loadPlayer}
        placeholder="Search any player 1920–present..."
        style={{ maxWidth: 400, marginBottom: 24 }}
      />

      {loading && <Loading />}
      {error   && <ErrorMsg message={error} />}

      {!loading && !error && data && seasons.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Player header */}
          <div style={{
            ...S.card,
            display:    'flex',
            gap:        20,
            alignItems: 'center',
          }}>
            <Headshot player={{ ...player, headshot: data.headshot }} size={72}
              style={{ borderColor: T.accentMid + '60' }} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily:    T.fontDisplay,
                fontSize:      36,
                letterSpacing: '0.04em',
                color:         T.accent,
                lineHeight:    1,
              }}>
                {data.name}
              </div>
              <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.14em', marginTop: 4 }}>
                {seasons[0]?.season}–{seasons[seasons.length - 1]?.season}
                {' · '}{seasons.length} SEASONS
              </div>
            </div>

            {/* Career totals */}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {type === 'batting' ? (
                <>
                  <StatBadge label="CAREER bWAR" value={data.totals?.bwar} accent />
                  <StatBadge label="HR"           value={data.totals?.hr} />
                  <StatBadge label="RBI"          value={data.totals?.rbi} />
                  <StatBadge label="AVG"          value={data.totals?.avg?.toFixed(3)?.replace(/^0/, '')} />
                  <StatBadge label="OBP"          value={Number(
                    ((data.totals?.h || 0) + (data.totals?.bb || 0)) /
                    Math.max((data.totals?.ab || 0) + (data.totals?.bb || 0), 1)
                  ).toFixed(3).replace(/^0/, '')} />
                  <StatBadge label="SLG"          value={Number(
                    ((data.totals?.h || 0) - (data.totals?.doubles || 0) - (data.totals?.triples || 0) - (data.totals?.hr || 0)
                      + 2*(data.totals?.doubles || 0) + 3*(data.totals?.triples || 0) + 4*(data.totals?.hr || 0)) /
                    Math.max(data.totals?.ab || 0, 1)
                  ).toFixed(3).replace(/^0/, '')} />
                  <StatBadge label="OPS"          value={Number(
                    ((data.totals?.h || 0) + (data.totals?.bb || 0)) /
                    Math.max((data.totals?.ab || 0) + (data.totals?.bb || 0), 1) +
                    ((data.totals?.h || 0) - (data.totals?.doubles || 0) - (data.totals?.triples || 0) - (data.totals?.hr || 0)
                      + 2*(data.totals?.doubles || 0) + 3*(data.totals?.triples || 0) + 4*(data.totals?.hr || 0)) /
                    Math.max(data.totals?.ab || 0, 1)
                  ).toFixed(3).replace(/^0/, '')} />
                </>
              ) : (
                <>
                  <StatBadge label="CAREER bWAR" value={data.totals?.bwar} accent />
                  <StatBadge label="W"            value={data.totals?.w} />
                  <StatBadge label="SV"           value={data.totals?.sv} />
                  <StatBadge label="K"            value={data.totals?.so} />
                  <StatBadge label="ERA"          value={data.totals?.era?.toFixed(2)} />
                  <StatBadge label="IP"           value={data.totals?.ip?.toFixed(0)} />
                </>
              )}
            </div>

            {/* Type toggle (for two-way players) */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['batting', 'pitching'].map(t => (
                <button key={t} onClick={() => {
                  setType(t)
                  setChartKey('bwar')
                  // Re-fetch if needed
                  if (player) {
                    setLoading(true)
                    const fn = t === 'batting' ? api.careerBatting : api.careerPitching
                    fn(player.name).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
                  }
                }} style={S.pill(type === t)}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div style={S.card}>
            {/* Chart selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
              {charts.map(c => (
                <button key={c.key} onClick={() => setChartKey(c.key)} style={S.pill(chartKey === c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div style={{ height: 220 }}>
              <Line
                data={makeLineData(seasons, chartKey)}
                options={{
                  ...chartDefaults,
                  plugins: {
                    ...chartDefaults.plugins,
                    tooltip: {
                      ...chartDefaults.plugins.tooltip,
                      callbacks: {
                        label: ctx => {
                          const c = charts.find(x => x.key === chartKey)
                          return ` ${c?.fmt(ctx.raw) ?? ctx.raw}`
                        }
                      }
                    }
                  }
                }}
              />
            </div>
          </div>


          {/* SDI — current season signal detection */}
          {sdi && (() => {
            const SIGNAL = {
              breakout:   { label:'BREAKOUT',    color:'#39ff14', icon:'⚡', desc:'Outperforming career baseline with statistical confidence' },
              regression: { label:'BOUNCE BACK', color:'#d4a800', icon:'📈', desc:'Underperforming career baseline — improvement expected' },
              noise:      { label:'LUCKY',       color:'#ff4444', icon:'🎲', desc:'Strong numbers but sample too small to trust' },
              stable:     { label:'STABLE',      color:'#4488ff', icon:'→',  desc:'Performing close to career expectation' },
            }
            const MLABELS = { k_pct:'K%',bb_pct:'BB%',xwoba:'xwOBA',barrel_pct:'Barrel%',hard_hit_pct:'HardHit%',k_9:'K/9',bb_9:'BB/9',era:'ERA',whip:'WHIP' }
            const sig = SIGNAL[sdi.signal] || SIGNAL.stable
            const metrics = sdi.sdi_metrics || {}
            const fmt = v => v == null ? '—' : Math.abs(v) < 1 ? Number(v).toFixed(3) : Number(v).toFixed(1)
            return (
              <div style={{ ...S.card, borderLeft: `3px solid ${sig.color}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, flexWrap:'wrap' }}>
                  <div style={{ fontFamily:T.fontDisplay, fontSize:14, letterSpacing:'0.1em', color:T.accentMid }}>
                    SDI · {new Date().getFullYear()} SEASON SIGNAL
                  </div>
                  <div style={{
                    padding:'2px 8px', borderRadius:3, fontSize:10,
                    background: sig.color + '22', color: sig.color,
                    fontFamily:T.fontMono, letterSpacing:'0.06em',
                  }}>
                    {sig.icon} {sig.label}
                  </div>
                  <div style={{ fontSize:10, color:T.textLow, fontFamily:T.fontMono }}>
                    {sdi.overall_confidence}% confidence · {(sdi.archetype||'').toUpperCase()} archetype
                  </div>
                  <a href="#sdi-explainer" style={{ marginLeft:'auto', fontSize:10, color:T.accentMid, textDecoration:'none' }}>
                    What is SDI? →
                  </a>
                </div>

                {/* Confidence bar */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:9, color:T.textLow, fontFamily:T.fontMono, marginBottom:4, letterSpacing:'0.08em' }}>
                    SIGNAL RELIABILITY — {sdi.overall_confidence}%
                    <span style={{ marginLeft:8, color:T.textMute }}>
                      (vs {sdi.career_seasons} season career baseline · {Math.round(sdi.career_pa || sdi.career_ip || 0).toLocaleString()} {sdi.career_pa ? 'career PA' : 'career IP'})
                    </span>
                  </div>
                  <div style={{ height:6, background:T.border, borderRadius:3, overflow:'hidden' }}>
                    <div style={{
                      height:'100%',
                      width:`${sdi.overall_confidence}%`,
                      background: sdi.overall_confidence >= 60 ? '#39ff14' : sdi.overall_confidence >= 40 ? '#d4a800' : '#ff4444',
                      borderRadius:3,
                      transition:'width 0.8s ease',
                      boxShadow:`0 0 8px ${sig.color}66`,
                    }}/>
                  </div>
                  <div style={{ fontSize:9, color:T.textLow, fontFamily:T.fontMono, marginTop:4 }}>
                    {sig.desc} · Confidence grows as sample size increases
                  </div>
                </div>

                {/* Per-metric breakdown */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {Object.entries(metrics).map(([key, m]) => {
                    const up = m.sustained_deviation > 0
                    const color = up ? '#39ff14' : '#ff4444'
                    return (
                      <div key={key} style={{
                        background:T.bg, border:`1px solid ${up ? '#1a6e00' : '#6b1414'}`,
                        borderRadius:4, padding:'6px 10px',
                        display:'flex', flexDirection:'column', gap:3, minWidth:90,
                      }}>
                        <div style={{ fontSize:8, color:T.textLow, fontFamily:T.fontMono, letterSpacing:'0.08em' }}>
                          {MLABELS[key] || key}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <span style={{ fontSize:13, color:T.textHi, fontFamily:T.fontMono }}>{fmt(m.current)}</span>
                          <span style={{ fontSize:8, color:T.textLow }}>vs</span>
                          <span style={{ fontSize:11, color:T.textMid, fontFamily:T.fontMono }}>{fmt(m.career)}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={{ height:2, flex:1, background:T.border, borderRadius:1, overflow:'hidden', marginRight:6 }}>
                            <div style={{ height:'100%', width:`${m.reliability_pct}%`, background:color, opacity:0.7 }}/>
                          </div>
                          <span style={{ fontSize:10, color, fontFamily:T.fontMono, fontWeight:700 }}>
                            {up?'+':''}{fmt(m.sustained_deviation)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Season-by-season table */}
          <div style={S.card}>
            <div style={{
              fontFamily:    T.fontDisplay,
              fontSize:      16,
              letterSpacing: '0.08em',
              color:         T.accentMid,
              marginBottom:  12,
            }}>
              SEASON LOG
            </div>
            <CareerTable seasons={seasons} type={type} />
          </div>
        </div>
      )}

      {!loading && !data && (
        <div style={{
          padding:    60,
          textAlign:  'center',
          color:      T.textLow,
          fontSize:   12,
          letterSpacing: '0.1em',
        }}>
          SEARCH FOR ANY PLAYER TO VIEW CAREER STATS
        </div>
      )}
    </div>
  )
}
