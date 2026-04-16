import React, { useState, useEffect } from 'react'
import { T, S } from '../theme'
import { api } from '../api/client'
import Headshot from '../components/ui/Headshot'
import Loading, { ErrorMsg } from '../components/ui/Loading'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => CURRENT_YEAR - i)

export default function Fantasy() {
  const [type,    setType]    = useState('batter')
  const [season,  setSeason]  = useState(CURRENT_YEAR)
  const [data,    setData]    = useState(null)
  const [settings,setSettings]= useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [showSettings, setShowSettings] = useState(false)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const [lb, s] = await Promise.all([
        api.fantasyLeaderboard(season, type, 75),
        api.fantasySettings('Oyster Catcher'),
      ])
      setData(lb.results || [])
      setSettings(s.settings || [])
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { load() }, [type, season])

  const maxPts = data?.length ? Math.max(...data.map(r => r.fantasy_points || 0), 1) : 1

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={S.eyebrow}>OYSTER CATCHER LEAGUE</div>
          <div style={S.sectionTitle}>FANTASY POINTS</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {['batter','pitcher'].map(t => (
            <button key={t} onClick={() => setType(t)} style={S.pill(type === t)}>
              {t.toUpperCase()}S
            </button>
          ))}
          <select
            value={season}
            onChange={e => setSeason(Number(e.target.value))}
            style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 3, padding: '4px 8px',
              color: T.textHi, fontFamily: T.fontMono, fontSize: 10, outline: 'none',
            }}
          >
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowSettings(s => !s)} style={S.pill(showSettings)}>
            SCORING
          </button>
        </div>
      </div>

      {/* Scoring settings panel */}
      {showSettings && settings && (
        <div style={{ ...S.card, marginBottom: 20 }}>
          <div style={{ fontSize: 9, letterSpacing: '0.18em', color: T.textLow, marginBottom: 12 }}>
            OYSTER CATCHER SCORING SETTINGS
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {['batter','pitcher'].map(t => (
              <div key={t}>
                <div style={{ fontSize: 9, letterSpacing: '0.16em', color: T.accentMid, marginBottom: 8 }}>
                  {t.toUpperCase()}S
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {settings.filter(s => s.player_type === t).map((s, i) => (
                    <div key={i} style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: T.textLow, fontFamily: T.fontMono, minWidth: 40 }}>
                        {s.stat}
                      </span>
                      <span style={{
                        fontSize: 12, fontFamily: T.fontDisplay,
                        color: s.points > 0 ? T.accentMid : '#cc6644',
                        letterSpacing: '0.04em',
                      }}>
                        {s.points > 0 ? `+${s.points}` : s.points}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <Loading />}
      {error   && <ErrorMsg message={error} />}

      {!loading && !error && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.map((row, i) => {
            const pct = maxPts ? (row.fantasy_points / maxPts) * 100 : 0
            return (
              <div key={i} style={{
                display:     'grid',
                gridTemplateColumns: '36px 52px 1fr 90px 220px 110px',
                gap:         '0 12px',
                alignItems:  'center',
                padding:     '8px 12px',
                background:  T.bgCard,
                borderLeft:  `3px solid ${i < 3 ? [T.accent, T.accentMid, T.accentMid][i] : T.border}`,
                border:      `1px solid ${T.border}`,
                borderLeftWidth: 3,
                borderRadius: 3,
              }}>
                <div style={{ fontFamily: T.fontDisplay, fontSize: 20, color: T.textLow, textAlign: 'center' }}>
                  {i + 1}
                </div>
                <Headshot player={row} size={40} />
                <div>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 18, color: T.textHi, letterSpacing: '0.04em' }}>
                    {row.name}
                  </div>
                  <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.1em', marginTop: 2 }}>
                    {row.team} · {type === 'batter'
                      ? `${row.hr} HR · ${row.rbi} RBI · .${String(row.avg).replace('0.','').padStart(3,'0')} AVG`
                      : `${row.ip} IP · ${row.so} K · ${row.era} ERA`
                    }
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{
                    fontFamily:    T.fontDisplay,
                    fontSize:      26,
                    letterSpacing: '0.02em',
                    color:         i === 0 ? T.accent : T.textHi,
                  }}>
                    {row.fantasy_points?.toFixed(0)}
                  </div>
                  <div style={{ fontSize: 8, color: T.textLow, letterSpacing: '0.12em' }}>PTS</div>
                </div>
                <div style={{ height: 4, background: '#111508', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${pct}%`,
                    background: i < 3 ? T.accent : T.accentMid,
                    borderRadius: 2, transition: 'width .4s ease',
                  }} />
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: T.textMid, fontFamily: T.fontMono }}>
                    {row.pts_per_game?.toFixed(1)} <span style={{ fontSize: 8, color: T.textLow }}>PTS/G</span>
                  </div>
                  <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.1em', marginTop: 2 }}>
                    {row.g}G · bWAR {row.bwar?.toFixed(1) ?? '—'}
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
