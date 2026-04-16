import React, { useState, useEffect } from 'react'
import { T, S } from '../theme'
import { api } from '../api/client'
import Headshot from '../components/ui/Headshot'
import Loading, { ErrorMsg } from '../components/ui/Loading'

const BATTING_STATS = [
  { key: 'bwar',        label: 'bWAR'      },
  { key: 'opsplus',     label: 'OPS+'      },
  { key: 'ops',         label: 'OPS'       },
  { key: 'hr',          label: 'HR'        },
  { key: 'rbi',         label: 'RBI'       },
  { key: 'avg',         label: 'AVG'       },
  { key: 'obp',         label: 'OBP'       },
  { key: 'slg',         label: 'SLG'       },
  { key: 'sb',          label: 'SB'        },
  { key: 'xwoba',       label: 'xwOBA'     },
  { key: 'ev',          label: 'Exit Velo' },
  { key: 'hard_hit_pct',label: 'HardHit%'  },
  { key: 'bb_pct',      label: 'BB%'       },
  { key: 'k_pct',       label: 'K%'        },
]

const PITCHING_STATS = [
  { key: 'bwar',    label: 'bWAR'  },
  { key: 'eraplus', label: 'ERA+'  },
  { key: 'era',     label: 'ERA'   },
  { key: 'so',      label: 'K'     },
  { key: 'whip',    label: 'WHIP'  },
  { key: 'fip',     label: 'FIP'   },
  { key: 'ip',      label: 'IP'    },
  { key: 'w',       label: 'W'     },
  { key: 'sv',      label: 'SV'    },
  { key: 'k_9',     label: 'K/9'   },
  { key: 'bb_9',    label: 'BB/9'  },
  { key: 'k_pct',   label: 'K%'    },
  { key: 'bb_pct',  label: 'BB%'   },
]

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1919 }, (_, i) => CURRENT_YEAR - i)

function fmt(val, key) {
  if (val === null || val === undefined) return '—'
  if (['avg','obp','slg','ops','era','whip','fip','xwoba'].includes(key))
    return Number(val).toFixed(3).replace(/^0/, '')
  if (['bwar','k_9','bb_9'].includes(key)) return Number(val).toFixed(1)
  if (['bb_pct','k_pct','hard_hit_pct'].includes(key)) return Number(val).toFixed(1) + '%'
  if (['ev'].includes(key)) return Number(val).toFixed(1) + ' mph'
  return val
}

export default function Leaderboard() {
  const [type,   setType]   = useState('batting')
  const [stat,   setStat]   = useState('bwar')
  const [season, setSeason] = useState(CURRENT_YEAR)
  const [role,   setRole]   = useState(null)
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(false)
  const [error,  setError]  = useState(null)

  const stats = type === 'batting' ? BATTING_STATS : PITCHING_STATS

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const d = type === 'batting'
        ? await api.leaderBatting(season, stat, 50, 50)
        : await api.leaderPitching(season, stat, 20, role, 50)
      setData(d.results || [])
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { load() }, [type, stat, season, role])

  // Reset stat when switching type
  const switchType = t => {
    setType(t)
    setStat('bwar')
    setRole(null)
  }

  const maxVal = data?.length
    ? Math.max(...data.map(r => Number(r[stat]) || 0))
    : 1

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={S.eyebrow}>BASEBALL REFERENCE · {season}</div>
        <div style={S.sectionTitle}>LEADERBOARD</div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, alignItems: 'center' }}>
        {/* Type */}
        {['batting', 'pitching'].map(t => (
          <button key={t} onClick={() => switchType(t)} style={S.pill(type === t)}>
            {t.toUpperCase()}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />

        {/* Season */}
        <select
          value={season}
          onChange={e => setSeason(Number(e.target.value))}
          style={{
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 3, padding: '4px 8px',
            color: T.textHi, fontFamily: T.fontMono, fontSize: 10,
            letterSpacing: '0.1em', outline: 'none', cursor: 'pointer',
          }}
        >
          {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        {/* Stat pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {stats.map(s => (
            <button key={s.key} onClick={() => setStat(s.key)} style={S.pill(stat === s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Role filter (pitching only) */}
        {type === 'pitching' && (
          <>
            <div style={{ width: 1, height: 20, background: T.border, margin: '0 4px' }} />
            {[null, 'SP', 'RP'].map(r => (
              <button key={r ?? 'all'} onClick={() => setRole(r)} style={S.pill(role === r)}>
                {r ?? 'ALL'}
              </button>
            ))}
          </>
        )}
      </div>

      {loading && <Loading />}
      {error   && <ErrorMsg message={error} />}

      {!loading && !error && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.map((row, i) => {
            const val  = row[stat]
            const pct  = maxVal ? ((Number(val) || 0) / maxVal) * 100 : 0
            const name = row.name || row.player

            return (
              <div key={i} style={{
                display:     'grid',
                gridTemplateColumns: '36px 52px 1fr 80px 200px 60px',
                gap:         '0 12px',
                alignItems:  'center',
                padding:     '8px 12px',
                background:  T.bgCard,
                borderLeft:  `3px solid ${i === 0 ? T.accent : i < 3 ? T.accentMid : T.border}`,
                borderTop:   `1px solid ${T.border}`,
                borderRight: `1px solid ${T.border}`,
                borderBottom:`1px solid ${T.border}`,
                borderRadius: 3,
              }}>
                {/* Rank */}
                <div style={{
                  fontFamily:    T.fontDisplay,
                  fontSize:      20,
                  color:         i < 3 ? [T.accent, T.accentMid, T.accentMid][i] : T.textLow,
                  textAlign:     'center',
                }}>
                  {i + 1}
                </div>

                {/* Headshot */}
                <Headshot player={row} size={40} />

                {/* Name + meta */}
                <div>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 18, color: T.textHi, letterSpacing: '0.04em' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.1em', marginTop: 2 }}>
                    {row.team} · {row.age ? `AGE ${row.age}` : ''} · {row.season}
                  </div>
                </div>

                {/* Stat value */}
                <div style={{
                  fontFamily:    T.fontDisplay,
                  fontSize:      24,
                  letterSpacing: '0.02em',
                  textAlign:     'right',
                  color:         i === 0 ? T.accent : T.textHi,
                }}>
                  {fmt(val, stat)}
                </div>

                {/* Bar */}
                <div style={{
                  height: 4, background: '#111508',
                  borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width:  `${pct}%`,
                    background: i === 0 ? T.accent : i < 3 ? T.accentMid : T.accentMid + '80',
                    borderRadius: 2,
                    transition: 'width .4s ease',
                  }} />
                </div>

                {/* Secondary stat */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.1em' }}>
                    {type === 'batting'
                      ? `${row.hr ?? '—'} HR`
                      : `${Number(row.ip || 0).toFixed(0)} IP`
                    }
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
