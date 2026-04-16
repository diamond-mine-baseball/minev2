import React, { useState, useEffect } from 'react'
import { T, S } from '../theme'
import { api } from '../api/client'
import Headshot from '../components/ui/Headshot'
import PlayerSearch from '../components/ui/PlayerSearch'
import Loading, { ErrorMsg } from '../components/ui/Loading'

const POSITIONS = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF']
const YEARS = Array.from({ length: 2025 - 2002 }, (_, i) => 2025 - i)

function drsColor(v) {
  if (v === null || v === undefined) return T.textMid
  if (v >= 15) return T.accent
  if (v >= 8)  return T.accentMid
  if (v >= 0)  return T.accentMid + 'aa'
  if (v >= -7) return '#cc8844'
  return '#cc4444'
}

export default function DRS() {
  const [tab,     setTab]     = useState('leaderboard') // leaderboard | player
  const [season,  setSeason]  = useState(2024)
  const [pos,     setPos]     = useState('ALL')
  const [data,    setData]    = useState(null)
  const [playerData, setPlayerData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const loadLeaderboard = async () => {
    setLoading(true); setError(null)
    try {
      const d = await api.drsLeaderboard(season, pos === 'ALL' ? null : pos, 50)
      setData(d.results || [])
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { if (tab === 'leaderboard') loadLeaderboard() }, [season, pos, tab])

  const loadPlayer = async (p) => {
    setLoading(true); setError(null)
    try {
      const d = await api.drsPlayer(p.name)
      setPlayerData({ ...d, player: p })
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const maxDRS = data?.length ? Math.max(...data.map(r => Math.abs(r.total || 0)), 1) : 1

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={S.eyebrow}>SPORTS INFO SOLUTIONS · DEFENSIVE RUNS SAVED</div>
          <div style={S.sectionTitle}>DRS</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {['leaderboard','player'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={S.pill(tab === t)}>{t.toUpperCase()}</button>
          ))}
          {tab === 'leaderboard' && (
            <>
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
              {POSITIONS.map(p => (
                <button key={p} onClick={() => setPos(p)} style={S.pill(pos === p)}>{p}</button>
              ))}
            </>
          )}
        </div>
      </div>

      {tab === 'player' && (
        <PlayerSearch
          onSelect={loadPlayer}
          placeholder="Search player DRS history..."
          style={{ maxWidth: 400, marginBottom: 24 }}
        />
      )}

      {loading && <Loading />}
      {error   && <ErrorMsg message={error} />}

      {/* Leaderboard */}
      {!loading && !error && tab === 'leaderboard' && data && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {data.map((row, i) => {
            const pct = maxDRS ? ((row.total || 0) / maxDRS) * 100 : 0
            return (
              <div key={i} style={{
                display:     'grid',
                gridTemplateColumns: '36px 52px 1fr 80px 300px 60px',
                gap:         '0 12px',
                alignItems:  'center',
                padding:     '8px 12px',
                background:  T.bgCard,
                borderLeft:  `3px solid ${i < 3 ? drsColor(row.total) : T.border}`,
                border:      `1px solid ${T.border}`,
                borderLeftWidth: 3,
                borderRadius: 3,
              }}>
                <div style={{ fontFamily: T.fontDisplay, fontSize: 20, color: T.textLow, textAlign: 'center' }}>
                  {i + 1}
                </div>
                <Headshot player={{ name: row.player, headshot: row.headshot }} size={40} />
                <div>
                  <div style={{ fontFamily: T.fontDisplay, fontSize: 18, color: T.textHi, letterSpacing: '0.04em' }}>
                    {row.player}
                  </div>
                  <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.1em', marginTop: 2 }}>
                    {row.pos} · {row.g}G · {row.inn ? Number(row.inn).toFixed(0) : '—'} INN
                  </div>
                </div>
                <div style={{
                  fontFamily:    T.fontDisplay,
                  fontSize:      26,
                  letterSpacing: '0.02em',
                  textAlign:     'right',
                  color:         drsColor(row.total),
                }}>
                  {row.total > 0 ? `+${row.total}` : row.total}
                </div>
                <div style={{ height: 4, background: '#111508', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width:  `${Math.abs(pct)}%`,
                    background: drsColor(row.total),
                    borderRadius: 2,
                    transition: 'width .4s ease',
                  }} />
                </div>
                <div style={{
                  fontSize: 9, color: T.textLow,
                  textAlign: 'right', letterSpacing: '0.1em',
                }}>
                  {row.season}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Player DRS history */}
      {!loading && !error && tab === 'player' && playerData && (
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <Headshot player={playerData.player} size={56} style={{ borderColor: T.accentMid + '50' }} />
            <div>
              <div style={{ fontFamily: T.fontDisplay, fontSize: 28, color: T.accent, letterSpacing: '0.04em' }}>
                {playerData.name}
              </div>
              <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.14em', marginTop: 3 }}>
                {playerData.seasons?.length} SEASONS OF DRS DATA
                {' · '}CAREER TOTAL:{' '}
                <span style={{ color: drsColor(playerData.seasons?.reduce((a, s) => a + (s.total || 0), 0)) }}>
                  {playerData.seasons?.reduce((a, s) => a + (s.total || 0), 0)}
                </span>
              </div>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr>
                {['SEASON','POS','G','INN','TOTAL','ARM','GFP/DM','OF ARM','BUNT','GDP'].map(h => (
                  <th key={h} style={{
                    padding: '6px 10px', textAlign: 'right',
                    fontSize: 8, letterSpacing: '0.14em',
                    color: T.textLow, fontFamily: T.fontMono, fontWeight: 400,
                    borderBottom: `1px solid ${T.border}`,
                    ...(h === 'SEASON' ? { textAlign: 'left' } : {}),
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(playerData.seasons || []).map((row, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: '7px 10px', fontFamily: T.fontMono, color: T.accent, fontSize: 12 }}>{row.season}</td>
                  <td style={{ padding: '7px 10px', fontFamily: T.fontMono, color: T.textMid, textAlign: 'right' }}>{row.pos}</td>
                  <td style={{ padding: '7px 10px', fontFamily: T.fontMono, color: T.textMid, textAlign: 'right' }}>{row.g}</td>
                  <td style={{ padding: '7px 10px', fontFamily: T.fontMono, color: T.textMid, textAlign: 'right' }}>{row.inn ? Number(row.inn).toFixed(0) : '—'}</td>
                  <td style={{ padding: '7px 10px', fontFamily: T.fontDisplay, fontSize: 16, color: drsColor(row.total), textAlign: 'right' }}>
                    {row.total > 0 ? `+${row.total}` : row.total}
                  </td>
                  {['art','gfpdm','of_arm','bunt','gdp'].map(k => (
                    <td key={k} style={{ padding: '7px 10px', fontFamily: T.fontMono, color: T.textMid, textAlign: 'right' }}>
                      {row[k] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
