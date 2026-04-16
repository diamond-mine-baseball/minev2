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
  const [type,    setType]    = useState('batting')
  const [chartKey,setChartKey]= useState('bwar')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

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
                  <StatBadge label="OPS"          value={Number(
                    ((data.totals?.h || 0) + (data.totals?.bb || 0)) /
                    Math.max((data.totals?.ab || 0) + (data.totals?.bb || 0), 1)
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
