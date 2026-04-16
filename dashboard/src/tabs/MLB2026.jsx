import React, { useState, useEffect, useRef } from 'react'
import { T, S } from '../theme'
import { api } from '../api/client'
import Headshot from '../components/ui/Headshot'
import Loading, { ErrorMsg } from '../components/ui/Loading'

const CURRENT_YEAR = new Date().getFullYear()

// Division ID → display info
const DIV_INFO = {
  200: { name: 'AL WEST',    short: 'ALW', league: 'AL' },
  201: { name: 'AL EAST',    short: 'ALE', league: 'AL' },
  202: { name: 'AL CENTRAL', short: 'ALC', league: 'AL' },
  203: { name: 'NL WEST',    short: 'NLW', league: 'NL' },
  204: { name: 'NL EAST',    short: 'NLE', league: 'NL' },
  205: { name: 'NL CENTRAL', short: 'NLC', league: 'NL' },
}

// Preferred display order: AL East, AL Central, AL West, NL East, NL Central, NL West
const DIV_ORDER = [201, 202, 200, 204, 205, 203]

const BATTING_CATS = [
  { key: 'homeRuns',           label: 'HR',   fmt: v => v },
  { key: 'battingAverage',     label: 'AVG',  fmt: v => Number(v).toFixed(3).replace(/^0/,'') },
  { key: 'rbi',                label: 'RBI',  fmt: v => v },
  { key: 'onBasePlusSlugging', label: 'OPS',  fmt: v => Number(v).toFixed(3).replace(/^0/,'') },
  { key: 'stolenBases',        label: 'SB',   fmt: v => v },
  { key: 'runs',               label: 'R',    fmt: v => v },
  { key: 'hits',               label: 'H',    fmt: v => v },
  { key: 'onBasePercentage',   label: 'OBP',  fmt: v => Number(v).toFixed(3).replace(/^0/,'') },
  { key: 'sluggingPercentage', label: 'SLG',  fmt: v => Number(v).toFixed(3).replace(/^0/,'') },
  { key: 'baseOnBalls',        label: 'BB',   fmt: v => v },
]

const PITCHING_CATS = [
  { key: 'earnedRunAverage',   label: 'ERA',  fmt: v => Number(v).toFixed(2) },
  { key: 'strikeouts',         label: 'K',    fmt: v => v },
  { key: 'wins',               label: 'W',    fmt: v => v },
  { key: 'saves',              label: 'SV',   fmt: v => v },
  { key: 'whip',               label: 'WHIP', fmt: v => Number(v).toFixed(3) },
  { key: 'inningsPitched',     label: 'IP',   fmt: v => Number(v).toFixed(1) },
  { key: 'strikeoutsPer9Inn',  label: 'K/9',  fmt: v => Number(v).toFixed(2) },
  { key: 'holds',              label: 'HLD',  fmt: v => v },
]

// ── Standings Drawer ───────────────────────────────────────────────────────────

function StandingsDrawer({ records, open, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Sort records by preferred division order
  const sorted = [...(records || [])].sort((a, b) => {
    const ia = DIV_ORDER.indexOf(a.division?.id)
    const ib = DIV_ORDER.indexOf(b.division?.id)
    return ia - ib
  })

  const alDivs = sorted.filter(r => r.league?.id === 103)
  const nlDivs = sorted.filter(r => r.league?.id === 104)

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 90,
        background: 'rgba(7,9,6,0.7)',
        backdropFilter: 'blur(4px)',
      }} onClick={onClose} />

      {/* Drawer */}
      <div ref={ref} style={{
        position:   'absolute',
        top:        '100%',
        left:       0,
        right:      0,
        zIndex:     91,
        background: '#0a0d08',
        border:     `1px solid ${T.border}`,
        borderTop:  'none',
        borderRadius: '0 0 4px 4px',
        padding:    '20px 24px 24px',
        animation:  'slideDown 0.2s ease',
      }}>
        <div style={{ display: 'flex', gap: 40 }}>
          {[{ label: 'AMERICAN LEAGUE', divs: alDivs }, { label: 'NATIONAL LEAGUE', divs: nlDivs }].map(({ label, divs }) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{
                fontFamily:    T.fontDisplay,
                fontSize:      13,
                letterSpacing: '0.12em',
                color:         T.accentMid,
                marginBottom:  16,
                paddingBottom: 6,
                borderBottom:  `1px solid ${T.border}`,
              }}>
                {label}
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                {divs.map((div, di) => {
                  const divId   = div.division?.id
                  const divInfo = DIV_INFO[divId] || { name: `DIV ${divId}`, short: '—' }
                  const teams   = div.teamRecords || []
                  return (
                    <div key={di} style={{ flex: 1, minWidth: 0 }}>
                      {/* Division label */}
                      <div style={{
                        fontSize:      8,
                        letterSpacing: '0.2em',
                        color:         T.textLow,
                        marginBottom:  8,
                        fontFamily:    T.fontMono,
                      }}>
                        {divInfo.name}
                      </div>

                      {/* Column headers */}
                      <div style={{
                        display:             'grid',
                        gridTemplateColumns: '1fr 28px 28px 36px 36px 36px',
                        gap:                 '0 4px',
                        padding:             '0 0 4px',
                        borderBottom:        `1px solid ${T.border}`,
                        marginBottom:        4,
                      }}>
                        {['TEAM','W','L','PCT','GB','STK'].map((h, hi) => (
                          <div key={h} style={{
                            fontSize:      7,
                            letterSpacing: '0.12em',
                            color:         T.textMute,
                            textAlign:     hi === 0 ? 'left' : 'right',
                            fontFamily:    T.fontMono,
                          }}>{h}</div>
                        ))}
                      </div>

                      {/* Team rows */}
                      {teams.map((t, ti) => {
                        const isLeader    = ti === 0
                        const streak      = t.streak?.streakCode || ''
                        const streakColor = streak.startsWith('W') ? T.accentMid : '#cc6644'
                        const gb          = t.gamesBack === '-' || t.gamesBack === '0.0' ? '—' : t.gamesBack

                        return (
                          <div key={ti} style={{
                            display:             'grid',
                            gridTemplateColumns: '1fr 28px 28px 36px 36px 36px',
                            gap:                 '0 4px',
                            padding:             '5px 0',
                            borderBottom:        ti < teams.length - 1 ? `1px solid ${T.border}` : 'none',
                            alignItems:          'center',
                          }}>
                            <div style={{
                              fontFamily:    T.fontDisplay,
                              fontSize:      13,
                              letterSpacing: '0.04em',
                              color:         isLeader ? T.accent : T.textMid,
                              overflow:      'hidden',
                              textOverflow:  'ellipsis',
                              whiteSpace:    'nowrap',
                            }}>
                              {t.team?.abbreviation}
                            </div>
                            <div style={{ textAlign: 'right', fontFamily: T.fontMono, fontSize: 11, color: T.textMid }}>{t.wins}</div>
                            <div style={{ textAlign: 'right', fontFamily: T.fontMono, fontSize: 11, color: T.textMid }}>{t.losses}</div>
                            <div style={{ textAlign: 'right', fontFamily: T.fontMono, fontSize: 11, color: T.textLow }}>{t.winningPercentage}</div>
                            <div style={{ textAlign: 'right', fontFamily: T.fontMono, fontSize: 11, color: T.textLow }}>{gb}</div>
                            <div style={{ textAlign: 'right', fontFamily: T.fontMono, fontSize: 10, color: streakColor }}>{streak}</div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <style>{`@keyframes slideDown { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }`}</style>
      </div>
    </>
  )
}

// ── Standings Strip (top bar) ──────────────────────────────────────────────────

function StandingsStrip({ records, season }) {
  const [open, setOpen] = useState(false)

  const sorted = [...(records || [])].sort((a, b) =>
    DIV_ORDER.indexOf(a.division?.id) - DIV_ORDER.indexOf(b.division?.id)
  )

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display:      'flex',
          gap:          0,
          background:   T.bgCard,
          border:       `1px solid ${open ? T.accentMid + '60' : T.border}`,
          borderRadius: open ? '3px 3px 0 0' : 3,
          cursor:       'pointer',
          transition:   'border-color .15s',
          userSelect:   'none',
          overflow:     'hidden',
        }}
      >
        {sorted.map((div, i) => {
          const leader  = div.teamRecords?.[0]
          const divId   = div.division?.id
          const divInfo = DIV_INFO[divId] || { short: '—', name: '—' }
          const isAL    = div.league?.id === 103
          const streak  = leader?.streak?.streakCode || ''
          const isWin   = streak.startsWith('W')

          return (
            <React.Fragment key={i}>
              {/* League separator */}
              {i === 3 && (
                <div style={{ width: 1, background: T.border, flexShrink: 0, margin: '8px 0' }} />
              )}
              <div style={{
                flex:           1,
                display:        'flex',
                flexDirection:  'column',
                padding:        '10px 16px',
                borderRight:    i < 5 && i !== 2 ? `1px solid ${T.border}` : 'none',
                gap:            4,
              }}>
                {/* Division label */}
                <div style={{
                  fontSize:      7,
                  letterSpacing: '0.2em',
                  color:         T.textMute,
                  fontFamily:    T.fontMono,
                }}>
                  {divInfo.short}
                </div>

                {/* Leader */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{
                    fontFamily:    T.fontDisplay,
                    fontSize:      18,
                    letterSpacing: '0.04em',
                    color:         T.accent,
                    lineHeight:    1,
                  }}>
                    {leader?.team?.abbreviation || '—'}
                  </div>
                  <div style={{
                    fontFamily:    T.fontMono,
                    fontSize:      10,
                    color:         T.textMid,
                  }}>
                    {leader?.wins}–{leader?.losses}
                  </div>
                </div>

                {/* Streak */}
                <div style={{
                  fontSize:      8,
                  letterSpacing: '0.1em',
                  color:         streak ? (isWin ? T.accentMid : '#cc6644') : T.textMute,
                  fontFamily:    T.fontMono,
                }}>
                  {streak || '—'}
                </div>
              </div>
            </React.Fragment>
          )
        })}

        {/* Expand indicator */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          padding:        '0 14px',
          borderLeft:     `1px solid ${T.border}`,
          color:          open ? T.accentMid : T.textMute,
          fontSize:       10,
          transition:     'color .15s',
          flexShrink:     0,
        }}>
          <span style={{
            display:     'inline-block',
            transform:   open ? 'rotate(180deg)' : 'none',
            transition:  'transform .2s',
            lineHeight:  1,
          }}>▾</span>
        </div>
      </div>

      {/* Full standings drawer */}
      <StandingsDrawer
        records={records}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

// ── Leader Card ────────────────────────────────────────────────────────────────

function LeaderCard({ cat, season }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.statLeaders(cat.key, season, 5)
      .then(d => { if (!cancelled) { setData(d.leaders?.[0]?.leaders || []); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [cat.key, season])

  return (
    <div style={{ ...S.card, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 12, borderBottom: `1px solid ${T.border}`, paddingBottom: 8,
      }}>
        <div style={{ fontFamily: T.fontDisplay, fontSize: 22, letterSpacing: '0.06em', color: T.accent }}>
          {cat.label}
        </div>
        <div style={{ fontSize: 8, letterSpacing: '0.16em', color: T.textLow }}>{season}</div>
      </div>

      {loading && <div style={{ padding: '12px 0', textAlign: 'center', color: T.textLow, fontSize: 10 }}>···</div>}

      {!loading && data?.map((row, i) => {
        const player = row.person || {}
        const isTop  = i === 0
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 0',
            borderBottom: i < data.length - 1 ? `1px solid ${T.border}` : 'none',
          }}>
            <div style={{
              fontFamily: T.fontDisplay, fontSize: 16,
              color: isTop ? T.accent : T.textLow,
              width: 18, textAlign: 'center', flexShrink: 0,
            }}>{i + 1}</div>
            <Headshot player={{ mlbam_id: player.id, name: player.fullName }} size={34}
              style={{ borderColor: isTop ? T.accent + '50' : T.borderHi }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: T.fontDisplay, fontSize: 15, letterSpacing: '0.03em',
                color: isTop ? T.textHi : T.textMid,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{player.fullName}</div>
              <div style={{ fontSize: 8, color: T.textLow, letterSpacing: '0.1em', marginTop: 1 }}>
                {row.team?.name || ''}
              </div>
            </div>
            <div style={{
              fontFamily: T.fontDisplay, fontSize: isTop ? 22 : 18,
              letterSpacing: '0.02em', color: isTop ? T.accent : T.textHi, flexShrink: 0,
            }}>{cat.fmt(row.value)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Tab ───────────────────────────────────────────────────────────────────

export default function MLB2026() {
  const [type,      setType]      = useState('batting')
  const [season,    setSeason]    = useState(CURRENT_YEAR)
  const [standings, setStandings] = useState(null)
  const [loadingSt, setLoadingSt] = useState(true)

  const cats = type === 'batting' ? BATTING_CATS : PITCHING_CATS
  const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - i)

  useEffect(() => {
    setLoadingSt(true)
    api.standings(season)
      .then(d => { setStandings(d.records || []); setLoadingSt(false) })
      .catch(() => setLoadingSt(false))
  }, [season])

  return (
    <div style={{ padding: '24px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={S.eyebrow}>MLB STATS API · OFFICIAL DATA</div>
          <div style={S.sectionTitle}>MLB {season}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={season} onChange={e => setSeason(Number(e.target.value))}
            style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 3, padding: '5px 8px',
              color: T.textHi, fontFamily: T.fontMono, fontSize: 11, outline: 'none',
            }}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {['batting','pitching'].map(t => (
            <button key={t} onClick={() => setType(t)} style={S.pill(type === t)}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Standings strip + drawer */}
      {!loadingSt && standings?.length > 0 && (
        <StandingsStrip records={standings} season={season} />
      )}

      {/* Leader cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {cats.map(cat => <LeaderCard key={cat.key} cat={cat} season={season} />)}
      </div>
    </div>
  )
}
