import React, { useState, useEffect } from 'react'
import { Radar, Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS, RadialLinearScale, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, Filler, Tooltip, Legend,
} from 'chart.js'
import { T, S, chartDefaults } from '../theme'
import { api } from '../api/client'
import PlayerSearch from '../components/ui/PlayerSearch'
import Headshot from '../components/ui/Headshot'
import Loading, { ErrorMsg } from '../components/ui/Loading'

ChartJS.register(RadialLinearScale, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement, Filler, Tooltip, Legend)

const COLORS = [T.accent, '#4a9aff', '#ff9a4a', '#c84aff', '#4affc8', '#ff4a7a']

const BATTING_RADAR  = ['bwar','opsplus','hr','sb','bb_pct','ops']
const PITCHING_RADAR = ['bwar','eraplus','k_9','bb_9','whip','so']
const BATTING_BARS   = ['bwar','opsplus','hr','rbi','avg','ops']
const PITCHING_BARS  = ['bwar','eraplus','era','so','whip','k_9','bb_9']

const RADAR_LABELS = {
  bwar: 'bWAR', opsplus: 'OPS+', hr: 'HR', sb: 'SB', bb_pct: 'BB%',
  ops: 'OPS', so: 'K', k_9: 'K/9', bb_9: 'BB/9', whip: 'WHIP',
  eraplus: 'ERA+', rbi: 'RBI', avg: 'AVG', era: 'ERA', fip: 'FIP',
}

// Lower is better for these stats
const INVERSE = new Set(['era','whip','fip','bb_9','k_pct','bb_pct'])

function fmt(v, k) {
  if (v === null || v === undefined) return '—'
  if (['avg','obp','slg','ops','era','whip','fip'].includes(k))
    return Number(v).toFixed(3).replace(/^0/, '')
  if (['bwar'].includes(k)) return Number(v).toFixed(1)
  if (['bb_pct','k_pct'].includes(k)) return Number(v).toFixed(1) + '%'
  return v
}

// HoF badge
function HoFBadge({ hof }) {
  if (!hof) return null
  const label = hof.first_ballot
    ? `HOF ${hof.inducted_year} · 1st Ballot (${hof.vote_pct}%)`
    : `HOF ${hof.inducted_year} · Ballot ${hof.ballots_taken} (${hof.vote_pct}%)`
  return (
    <div style={{
      display:       'inline-flex',
      alignItems:    'center',
      gap:           5,
      background:    '#1a1500',
      border:        '1px solid #5a4800',
      borderRadius:  2,
      padding:       '2px 8px',
      fontSize:      9,
      letterSpacing: '0.1em',
      color:         '#d4a800',
      fontFamily:    T.fontMono,
      marginTop:     3,
      whiteSpace:    'nowrap',
    }}>
      ⬡ {label}
    </div>
  )
}


// Cumulative bWAR by age chart
function CumulativeArcChart({ players, data }) {
  if (!players.length || !data.length) return null

  const allAges = [...new Set(
    data.flatMap(d => (d._seasons || []).filter(s => s.age).map(s => s.age))
  )].sort((a, b) => a - b)

  if (allAges.length < 2) return null

  const datasets = data.map((p, i) => {
    const seasons = p._seasons || []
    const byAge = {}
    seasons.forEach(s => {
      if (s.age) byAge[s.age] = (byAge[s.age] ?? 0) + (s.bwar || 0)
    })

    // Build cumulative totals
    let running = 0
    const cumulative = allAges.map(age => {
      if (byAge[age] !== undefined) {
        running += byAge[age]
        return running
      }
      // Gap — only return null if player hasn't started yet or has finished
      const minAge = Math.min(...Object.keys(byAge).map(Number))
      const maxAge = Math.max(...Object.keys(byAge).map(Number))
      if (age < minAge || age > maxAge) return null
      return running // hold last value for missing seasons mid-career
    })

    return {
      label:                p.name || players[i]?.name,
      data:                 cumulative,
      borderColor:          COLORS[i],
      backgroundColor:      COLORS[i] + '15',
      pointBackgroundColor: COLORS[i],
      pointRadius:          2,
      pointHoverRadius:     5,
      borderWidth:          2,
      tension:              0.3,
      spanGaps:             false,
      fill:                 true,
    }
  })

  return (
    <div style={{ ...S.card, marginTop: 0 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.18em', color: T.textLow, marginBottom: 12 }}>
        CUMULATIVE bWAR BY AGE
      </div>
      <div style={{ height: 220 }}>
        <Line
          data={{ labels: allAges, datasets }}
          options={{
            ...chartDefaults,
            plugins: {
              ...chartDefaults.plugins,
              legend: {
                display: true,
                labels: {
                  color: T.textMid,
                  font: { family: "'DM Mono'", size: 9 },
                  boxWidth: 12, padding: 12,
                }
              },
              tooltip: {
                ...chartDefaults.plugins.tooltip,
                callbacks: {
                  title: ctx => `Age ${ctx[0]?.label}`,
                  label: ctx => ` ${ctx.dataset.label}: ${ctx.raw?.toFixed(1) ?? '—'} career bWAR`,
                }
              }
            },
            scales: {
              ...chartDefaults.scales,
              x: {
                ...chartDefaults.scales.x,
                title: {
                  display: true, text: 'AGE',
                  color: T.textLow,
                  font: { family: "'DM Mono'", size: 8 },
                  padding: { top: 4 },
                },
              },
              y: {
                ...chartDefaults.scales.y,
                title: {
                  display: true, text: 'CUMULATIVE bWAR',
                  color: T.textLow,
                  font: { family: "'DM Mono'", size: 8 },
                },
              }
            }
          }}
        />
      </div>
    </div>
  )
}

// bWAR career arc line chart — x-axis is age
function CareerArcChart({ players, data }) {
  if (!players.length || !data.length) return null

  // Find age range across all players
  const allAges = [...new Set(
    data.flatMap(d => (d._seasons || []).filter(s => s.age).map(s => s.age))
  )].sort((a, b) => a - b)

  if (allAges.length < 2) return null

  const datasets = data.map((p, i) => {
    const seasons = p._seasons || []
    // Build age -> bwar map
    const byAge = {}
    seasons.forEach(s => {
      if (s.age) byAge[s.age] = (byAge[s.age] ?? 0) + (s.bwar || 0)
    })
    return {
      label:                p.name || players[i]?.name,
      data:                 allAges.map(age => byAge[age] ?? null),
      borderColor:          COLORS[i],
      backgroundColor:      COLORS[i] + '15',
      pointBackgroundColor: COLORS[i],
      pointRadius:          3,
      pointHoverRadius:     5,
      borderWidth:          2,
      tension:              0.3,
      spanGaps:             false,
    }
  })

  return (
    <div style={{ ...S.card, marginTop: 16 }}>
      <div style={{ fontSize: 9, letterSpacing: '0.18em', color: T.textLow, marginBottom: 12 }}>
        bWAR BY AGE
      </div>
      <div style={{ height: 220 }}>
        <Line
          data={{ labels: allAges, datasets }}
          options={{
            ...chartDefaults,
            plugins: {
              ...chartDefaults.plugins,
              legend: {
                display: true,
                labels: {
                  color: T.textMid,
                  font: { family: "'DM Mono'", size: 9 },
                  boxWidth: 12,
                  padding: 12,
                }
              },
              tooltip: {
                ...chartDefaults.plugins.tooltip,
                callbacks: {
                  title: ctx => `Age ${ctx[0]?.label}`,
                  label: ctx => ` ${ctx.dataset.label}: ${ctx.raw?.toFixed(1) ?? '—'} bWAR`,
                }
              }
            },
            scales: {
              ...chartDefaults.scales,
              x: {
                ...chartDefaults.scales.x,
                title: {
                  display: true,
                  text: 'AGE',
                  color: T.textLow,
                  font: { family: "'DM Mono'", size: 8 },
                  padding: { top: 4 },
                },
              },
              y: {
                ...chartDefaults.scales.y,
                title: {
                  display: true,
                  text: 'bWAR',
                  color: T.textLow,
                  font: { family: "'DM Mono'", size: 8 },
                },
              }
            }
          }}
        />
      </div>
    </div>
  )
}

export default function Compare() {
  const [players,  setPlayers]  = useState([])
  const [data,     setData]     = useState([])
  const [hofData,  setHofData]  = useState({}) // name_norm -> hof record
  const [type,     setType]     = useState('batting')
  const [season,   setSeason]   = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState(null)
  const [searchKey, setSearchKey] = useState(0) // increment to reset search

  const MAX_PLAYERS = 4

  // Fetch HoF data for a player
  const fetchHof = async (name) => {
    try {
      // Strip Jr/Sr/II/III suffixes so "Ken Griffey Jr" -> "Ken Griffey" -> last="Griffey"
      const cleanName = name.replace(/\b(jr\.?|sr\.?|ii|iii|iv)\b/gi, '').trim()
      const r = await fetch(`/api/hof?name=${encodeURIComponent(cleanName)}`)
      if (r.ok) {
        const d = await r.json()
        if (d.hof) {
          // Key by both full name and last name for resilient lookup
          const lastName = name.toLowerCase().split(' ').pop()
          setHofData(prev => ({
            ...prev,
            [name.toLowerCase()]: d.hof,
            [lastName]: d.hof,
          }))
        }
      }
    } catch {}
  }

  const addPlayer = async (p) => {
    if (players.find(x => x.name === p.name)) {
      setSearchKey(k => k + 1)
      return
    }
    if (players.length >= MAX_PLAYERS) {
      setSearchKey(k => k + 1)
      return
    }

    const updated = [...players, p]
    setPlayers(updated)
    setSearchKey(k => k + 1) // clear search field immediately
    setLoading(true); setError(null)

    try {
      const [compare, ...careerResults] = await Promise.all([
        api.compare(updated.map(x => x.name), season, type),
        ...updated.map(x =>
          type === 'batting'
            ? api.careerBatting(x.name).catch(() => null)
            : api.careerPitching(x.name).catch(() => null)
        ),
      ])

      const enriched = (compare.players || []).map((d, i) => ({
        ...d,
        _seasons: careerResults[i]?.seasons || [],
      }))
      setData(enriched)

      // Fetch HoF for all current players — ensures first player gets badge when 2nd is added
      updated.forEach(x => fetchHof(x.name))
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const removePlayer = async (name) => {
    const updated = players.filter(p => p.name !== name)
    setPlayers(updated)
    if (!updated.length) { setData([]); return }
    setLoading(true)
    try {
      const [compare, ...careerResults] = await Promise.all([
        api.compare(updated.map(x => x.name), season, type),
        ...updated.map(x =>
          type === 'batting'
            ? api.careerBatting(x.name).catch(() => null)
            : api.careerPitching(x.name).catch(() => null)
        ),
      ])
      const enriched = (compare.players || []).map((d, i) => ({
        ...d,
        _seasons: careerResults[i]?.seasons || [],
      }))
      setData(enriched)
    } catch {} 
    setLoading(false)
  }

  const switchType = async (t) => {
    setType(t)
    if (!players.length) return
    setLoading(true)
    try {
      const [compare, ...careerResults] = await Promise.all([
        api.compare(players.map(x => x.name), season, t),
        ...players.map(x =>
          t === 'batting'
            ? api.careerBatting(x.name).catch(() => null)
            : api.careerPitching(x.name).catch(() => null)
        ),
      ])
      const enriched = (compare.players || []).map((d, i) => ({
        ...d,
        _seasons: careerResults[i]?.seasons || [],
      }))
      setData(enriched)
    } catch {}
    setLoading(false)
  }

  const radarKeys = type === 'batting' ? BATTING_RADAR : PITCHING_RADAR
  const barKeys   = type === 'batting' ? BATTING_BARS  : PITCHING_BARS

  // Min-max normalize for radar: best player = 100, worst = 0 per stat
  const statRanges = {}
  radarKeys.forEach(k => {
    const vals = data.map(p => Number(p[k])).filter(v => v !== null && !isNaN(v))
    if (!vals.length) { statRanges[k] = { min: 0, max: 1 }; return }
    statRanges[k] = { min: Math.min(...vals), max: Math.max(...vals) }
  })

  const radarData = {
    labels: radarKeys.map(k => RADAR_LABELS[k] || k.toUpperCase()),
    datasets: data.filter(p => !p.error).map((p, i) => ({
      label:               p.name,
      data:                radarKeys.map(k => {
        const v = Number(p[k])
        if (v === null || isNaN(v)) return 0
        const { min, max } = statRanges[k]
        const range = max - min || 1
        // Inverse stats: lower is better → invert so best player scores 100
        return INVERSE.has(k)
          ? Math.round((max - v) / range * 100)
          : Math.round((v - min) / range * 100)
      }),
      borderColor:         COLORS[i],
      backgroundColor:     COLORS[i] + '18',
      pointBackgroundColor:COLORS[i],
      borderWidth:         2,
      pointRadius:         4,
    })),
  }

  const CURRENT_YEAR = new Date().getFullYear()
  const YEARS = Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => CURRENT_YEAR - i)

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={S.eyebrow}>SIDE BY SIDE</div>
          <div style={S.sectionTitle}>COMPARE PLAYERS</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {['batting','pitching'].map(t => (
            <button key={t} onClick={() => switchType(t)} style={S.pill(type === t)}>{t.toUpperCase()}</button>
          ))}
          <select value={season ?? ''} onChange={e => setSeason(e.target.value ? Number(e.target.value) : null)}
            style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 3, padding: '4px 8px',
              color: T.textHi, fontFamily: T.fontMono, fontSize: 10, outline: 'none',
            }}>
            <option value="">CAREER</option>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Search + Player chips */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {players.length < MAX_PLAYERS && (
          <PlayerSearch
            key={searchKey}
            onSelect={addPlayer}
            placeholder={players.length === 0
              ? `Search player 1 of ${MAX_PLAYERS}...`
              : `Add player ${players.length + 1} of ${MAX_PLAYERS}...`}
            style={{ width: 280 }}
          />
        )}
        {players.map((p, i) => (
          <div key={p.name} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.bgCard, border: `1px solid ${COLORS[i]}40`,
            borderRadius: 3, padding: '4px 10px',
          }}>
            <Headshot player={p} size={26} style={{ borderColor: COLORS[i] + '60' }} />
            <span style={{ fontFamily: T.fontMono, fontSize: 11, color: COLORS[i] }}>{p.name}</span>
            <button onClick={() => removePlayer(p.name)}
              style={{ background: 'none', border: 'none', color: T.textLow, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {players.length === 0 && (
        <div style={{
          ...S.card,
          padding: '48px 24px',
          textAlign: 'center',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontFamily: T.fontDisplay, fontSize: 32, color: T.textMute, letterSpacing: '0.06em' }}>
            COMPARE PLAYERS
          </div>
          <div style={{ fontSize: 11, color: T.textLow, letterSpacing: '0.1em', maxWidth: 380, lineHeight: 1.8 }}>
            Search for up to {MAX_PLAYERS} players to compare side by side.
            Works across all eras — 1920 to present.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['Babe Ruth', 'Willie Mays', 'Mike Trout', 'Barry Bonds'].map(n => (
              <button key={n} onClick={() => addPlayer({ name: n })}
                style={{ ...S.pill(false), fontSize: 10 }}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {players.length === 1 && !loading && (
        <div style={{ ...S.card, padding: '24px', textAlign: 'center', color: T.textLow, fontSize: 11, letterSpacing: '0.1em' }}>
          ADD AT LEAST ONE MORE PLAYER TO COMPARE · MAX {MAX_PLAYERS} PLAYERS
        </div>
      )}

      {loading && <Loading />}
      {error   && <ErrorMsg message={error} />}

      {!loading && !error && data.length >= 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Player header cards */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 12 }}>
            {data.map((p, i) => {
              const hof = hofData[p.name?.toLowerCase()] ||
                hofData[p.name?.toLowerCase().replace(/[^a-z ]/g,'').trim()] ||
                // Also try matching by last name
                Object.entries(hofData).find(([k, v]) =>
                  v && p.name && k.split(' ').pop() === p.name.toLowerCase().split(' ').pop()
                )?.[1]
              return (
                <div key={i} style={{
                  ...S.card,
                  borderLeft: `3px solid ${COLORS[i]}`,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <Headshot player={players[i]} size={44}
                      style={{ borderColor: COLORS[i] + '60' }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{
                        fontFamily: T.fontDisplay, fontSize: 22,
                        letterSpacing: '0.04em', color: COLORS[i],
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{p.name}</div>
                      <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.1em', marginTop: 2 }}>
                        {p.team || ''} {p.age ? `· AGE ${p.age}` : ''}
                        {season ? ` · ${season}` : ' · CAREER'}
                      </div>
                      {hof && <HoFBadge hof={hof} />}
                    </div>
                  </div>
                  {p.bwar !== undefined && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: COLORS[i] }}>{fmt(p.bwar,'bwar')}</div>
                        <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>bWAR</div>
                      </div>
                      {type === 'batting' ? (
                        <>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.textHi }}>{p.opsplus ?? '—'}</div>
                            <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>OPS+</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.textHi }}>{p.hr ?? '—'}</div>
                            <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>HR</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.textHi }}>{fmt(p.avg,'avg')}</div>
                            <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>AVG</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.textHi }}>{fmt(p.ops,'ops')}</div>
                            <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>OPS</div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.textHi }}>{p.eraplus ?? '—'}</div>
                            <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>ERA+</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.textHi }}>{fmt(p.era,'era')}</div>
                            <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>ERA</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: T.fontDisplay, fontSize: 22, color: T.textHi }}>{p.so ?? '—'}</div>
                            <div style={{ fontSize: 7, color: T.textLow, letterSpacing: '0.14em' }}>K</div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Radar + stat table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ ...S.card, height: 320 }}>
              <div style={{ fontSize: 9, letterSpacing: '0.18em', color: T.textLow, marginBottom: 8 }}>
                RADAR — NORMALIZED (inverse stats adjusted)
              </div>
              <Radar data={radarData} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: {
                    display: true,
                    labels: { color: T.textMid, font: { family: "'DM Mono'", size: 11 }, boxWidth: 14, padding: 14 }
                  },
                },
                scales: {
                  r: {
                    min: 0, max: 100,
                    grid:       { color: T.border },
                    angleLines: { color: T.border },
                    pointLabels: {
                      color: T.textHi,
                      font: { family: "'Bebas Neue'", size: 14, letterSpacing: '0.08em' },
                      padding: 8,
                    },
                    ticks: { display: false },
                  }
                }
              }} />
            </div>

            <div style={S.card}>
              <div style={{ fontSize: 9, letterSpacing: '0.18em', color: T.textLow, marginBottom: 10 }}>KEY STATS</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ fontSize: 8, color: T.textLow, fontFamily: T.fontMono, fontWeight: 400, padding: '5px 10px', textAlign: 'left' }}>STAT</th>
                    {data.map((p, i) => (
                      <th key={i} style={{ fontSize: 11, color: COLORS[i], fontFamily: T.fontDisplay, fontWeight: 400, padding: '4px 8px', textAlign: 'right', letterSpacing: '0.04em' }}>
                        {p.name?.split(' ').pop()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {barKeys.map(k => {
                    const vals = data.map(p => Number(p[k]) || null).filter(v => v !== null)
                    const best = vals.length ? (INVERSE.has(k) ? Math.min(...vals) : Math.max(...vals)) : null
                    return (
                      <tr key={k} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: '7px 8px', fontSize: 11, letterSpacing: '0.1em', color: T.textLow, fontFamily: T.fontMono }}>
                          {RADAR_LABELS[k] || k.toUpperCase()}
                        </td>
                        {data.map((p, i) => {
                          const v = p[k]
                          const isBest = v !== null && Number(v) === best
                          return (
                            <td key={i} style={{
                              padding: '7px 8px', textAlign: 'right',
                              fontFamily: T.fontMono, fontSize: 12,
                              color: isBest ? COLORS[i] : T.textMid,
                            }}>
                              {fmt(v, k)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Career arc charts — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <CareerArcChart players={players} data={data} />
            <CumulativeArcChart players={players} data={data} />
          </div>
        </div>
      )}
    </div>
  )
}
