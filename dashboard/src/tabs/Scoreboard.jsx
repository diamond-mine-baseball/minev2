import React, { useState, useEffect } from 'react'
import { T, S } from '../theme'
import { api } from '../api/client'
import Loading, { ErrorMsg } from '../components/ui/Loading'

const STATUS_COLOR = {
  'Final':    T.textLow,
  'Live':     T.accent,
  'Preview':  T.accentMid,
  'Postponed':'#cc6644',
}

function GameCard({ game }) {
  const away  = game.teams?.away
  const home  = game.teams?.home
  const state = game.status?.detailedState || ''
  const inning = game.linescore?.currentInning
  const half   = game.linescore?.inningHalf

  const isLive  = game.status?.abstractGameState === 'Live'
  const isFinal = game.status?.abstractGameState === 'Final'

  const awayScore = away?.score
  const homeScore = home?.score

  const leader = isFinal
    ? (awayScore > homeScore ? 'away' : awayScore < homeScore ? 'home' : null)
    : null

  return (
    <div style={{
      ...S.card,
      display:       'flex',
      flexDirection: 'column',
      gap:           10,
      borderLeft:    `3px solid ${isLive ? T.accent : T.border}`,
      transition:    'border-color .2s',
      minWidth:      0,
    }}>
      {/* Status */}
      <div style={{
        display:        'flex',
        justifyContent: 'space-between',
        alignItems:     'center',
      }}>
        <div style={{
          fontSize:      8,
          letterSpacing: '0.18em',
          color:         STATUS_COLOR[state] || T.textLow,
          fontFamily:    T.fontMono,
        }}>
          {isLive && inning ? `${half?.toUpperCase()} ${inning}` : state.toUpperCase()}
        </div>
        {isLive && (
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: T.accent,
            animation: 'livePulse 1.2s ease-in-out infinite',
          }} />
        )}
      </div>

      {/* Teams */}
      {[['away', away], ['home', home]].map(([side, team]) => (
        <div key={side} style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
        }}>
          <div style={{
            fontFamily:    T.fontDisplay,
            fontSize:      18,
            letterSpacing: '0.04em',
            color:         leader === side ? T.accent : T.textHi,
          }}>
            {team?.team?.abbreviation || '—'}
            <span style={{
              fontFamily:    T.fontMono,
              fontSize:      9,
              color:         T.textLow,
              letterSpacing: '0.1em',
              marginLeft:    8,
            }}>
              {side.toUpperCase()}
            </span>
          </div>
          <div style={{
            fontFamily:    T.fontDisplay,
            fontSize:      26,
            letterSpacing: '0.02em',
            color:         leader === side ? T.accent : (isFinal || isLive) ? T.textHi : T.textMute,
          }}>
            {(isFinal || isLive) ? (team?.score ?? '—') : '—'}
          </div>
        </div>
      ))}
    </div>
  )
}

function StandingsTable({ records }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {records.map((div, i) => (
        <div key={i}>
          <div style={{
            fontFamily:    T.fontDisplay,
            fontSize:      18,
            letterSpacing: '0.06em',
            color:         T.accentMid,
            marginBottom:  8,
            borderBottom:  `1px solid ${T.border}`,
            paddingBottom: 4,
          }}>
            {div.division?.name?.replace('Division', 'DIV') || ''}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['TEAM','W','L','PCT','GB','RS','RA','DIFF'].map(h => (
                  <th key={h} style={{
                    fontSize: 8, letterSpacing: '0.16em', color: T.textLow,
                    textAlign: h === 'TEAM' ? 'left' : 'right',
                    padding: '3px 8px 6px', fontFamily: T.fontMono, fontWeight: 400,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(div.teamRecords || []).map((t, j) => {
                const diff = (t.runsScored || 0) - (t.runsAllowed || 0)
                return (
                  <tr key={j} style={{ borderTop: `1px solid ${T.border}` }}>
                    <td style={{ padding: '7px 8px', fontFamily: T.fontMono, fontSize: 12, color: j === 0 ? T.accent : T.textHi }}>
                      {t.team?.abbreviation}
                    </td>
                    {[t.wins, t.losses,
                      t.winningPercentage,
                      t.gamesBack === '0.0' ? '—' : t.gamesBack,
                      t.runsScored, t.runsAllowed,
                    ].map((v, k) => (
                      <td key={k} style={{
                        padding: '7px 8px', textAlign: 'right',
                        fontFamily: T.fontMono, fontSize: 11, color: T.textMid,
                      }}>{v}</td>
                    ))}
                    <td style={{
                      padding: '7px 8px', textAlign: 'right',
                      fontFamily: T.fontMono, fontSize: 11,
                      color: diff > 0 ? T.accentMid : diff < 0 ? '#cc6644' : T.textLow,
                    }}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export default function Scoreboard() {
  const [games,     setGames]     = useState(null)
  const [standings, setStandings] = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [tab,       setTab]       = useState('scores') // scores | standings
  const [date,      setDate]      = useState(new Date().toISOString().slice(0,10))

  const load = async () => {
    setLoading(true)
    try {
      const [g, s] = await Promise.all([api.scoreboard(date), api.standings()])
      setGames(g.games || [])
      setStandings(s.records || [])
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  useEffect(() => { load() }, [date])
  useEffect(() => {
    if (tab === 'scores') {
      const t = setInterval(load, 30000)
      return () => clearInterval(t)
    }
  }, [tab, date])

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={S.eyebrow}>MLB · LIVE DATA</div>
          <div style={S.sectionTitle}>SCOREBOARD</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 3, padding: '5px 8px',
              color: T.textHi, fontFamily: T.fontMono, fontSize: 11,
              outline: 'none', cursor: 'pointer',
            }}
          />
          {['scores', 'standings'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={S.pill(tab === t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading && <Loading />}
      {error   && <ErrorMsg message={error} />}

      {!loading && !error && tab === 'scores' && (
        games?.length ? (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap:                 12,
          }}>
            {games.map((g, i) => <GameCard key={i} game={g} />)}
          </div>
        ) : (
          <div style={{ color: T.textLow, fontSize: 12, padding: 24 }}>No games scheduled.</div>
        )
      )}

      {!loading && !error && tab === 'standings' && standings && (
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap:                 32,
        }}>
          {/* Split into AL and NL */}
          {[standings.slice(0,3), standings.slice(3,6)].map((half, i) => (
            <div key={i}>
              <div style={{
                fontFamily:    T.fontDisplay,
                fontSize:      22,
                letterSpacing: '0.08em',
                color:         T.accent,
                marginBottom:  16,
              }}>
                {i === 0 ? 'AMERICAN LEAGUE' : 'NATIONAL LEAGUE'}
              </div>
              <StandingsTable records={half} />
            </div>
          ))}
        </div>
      )}

      <style>{`@keyframes livePulse { 0%,100%{opacity:.4} 50%{opacity:1} }`}</style>
    </div>
  )
}
