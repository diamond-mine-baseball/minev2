import React, { useState, useEffect, Suspense, lazy } from 'react'
import { T } from './theme'
import Loading from './components/ui/Loading'

// Lazy-load tabs for performance
const Scoreboard   = lazy(() => import('./tabs/Scoreboard'))
const Leaderboard  = lazy(() => import('./tabs/Leaderboard'))
const PlayerCareer = lazy(() => import('./tabs/PlayerCareer'))
const Compare      = lazy(() => import('./tabs/Compare'))
const Fantasy      = lazy(() => import('./tabs/Fantasy'))
const DRS          = lazy(() => import('./tabs/DRS'))
const MLB2026      = lazy(() => import('./tabs/MLB2026'))

const TABS = [
  { id: 'scoreboard',  label: 'SCOREBOARD',   icon: '⬡' },
  { id: 'leaderboard', label: 'LEADERBOARD',  icon: '◈' },
  { id: 'career',      label: 'PLAYER',       icon: '◉' },
  { id: 'compare',     label: 'COMPARE',      icon: '◫' },
  { id: 'fantasy',     label: 'FANTASY',      icon: '◆' },
  { id: 'drs',         label: 'DRS',          icon: '◎' },
  { id: 'mlb2026',    label: 'MLB 2026',     icon: '◈' },
]

const CONTENT = {
  scoreboard:  <Scoreboard />,
  leaderboard: <Leaderboard />,
  career:      <PlayerCareer />,
  compare:     <Compare />,
  fantasy:     <Fantasy />,
  drs:         <DRS />,
  mlb2026:     <MLB2026 />,
}

export default function App() {
  const [tab,    setTab]    = useState('scoreboard')
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setHealth(d))
      .catch(() => setHealth({ status: 'error' }))
  }, [])

  return (
    <div style={{
      minHeight:   '100vh',
      display:     'flex',
      flexDirection:'column',
      background:  T.bg,
    }}>
      {/* Top Nav */}
      <nav style={{
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'space-between',
        padding:         '0 32px',
        height:          52,
        background:      '#070906',
        borderBottom:    `1px solid ${T.border}`,
        position:        'sticky',
        top:             0,
        zIndex:          50,
        backdropFilter:  'blur(8px)',
      }}>
        {/* Logo */}
        <div style={{
          fontFamily:    T.fontDisplay,
          fontSize:      22,
          letterSpacing: '0.12em',
          color:         T.textMute,
          userSelect:    'none',
        }}>
          DIAMOND<span style={{ color: T.accentMid }}>MINE</span>
          <span style={{
            fontFamily:    T.fontMono,
            fontSize:      8,
            letterSpacing: '0.1em',
            color:         T.textMute,
            marginLeft:    6,
            verticalAlign: 'middle',
          }}>
            v2
          </span>
        </div>

        {/* Tab pills */}
        <div style={{ display: 'flex', gap: 2 }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                background:    tab === t.id ? T.accent + '18' : 'transparent',
                border:        `1px solid ${tab === t.id ? T.accent + '40' : 'transparent'}`,
                borderRadius:  3,
                padding:       '5px 14px',
                color:         tab === t.id ? T.accent : T.textLow,
                fontFamily:    T.fontDisplay,
                fontSize:      13,
                letterSpacing: '0.1em',
                cursor:        'pointer',
                transition:    'all .15s',
                display:       'flex',
                alignItems:    'center',
                gap:           6,
              }}
              onMouseEnter={e => { if (tab !== t.id) e.currentTarget.style.color = T.textMid }}
              onMouseLeave={e => { if (tab !== t.id) e.currentTarget.style.color = T.textLow }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* DB status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 8, letterSpacing: '0.14em', color: T.textMute }}>
          <div style={{
            width: 5, height: 5, borderRadius: '50%',
            background: health?.status === 'ok' ? T.accentMid : '#cc4444',
          }} />
          {health?.status === 'ok'
            ? `${health.counts?.batting?.toLocaleString()} BAT · ${health.counts?.pitching?.toLocaleString()} PIT`
            : 'API OFFLINE'
          }
        </div>
      </nav>

      {/* Main content */}
      <main style={{
        flex:      1,
        maxWidth:  1400,
        width:     '100%',
        margin:    '0 auto',
        padding:   '0 32px 48px',
      }}>
        <Suspense fallback={<Loading text="Loading tab..." />}>
          {CONTENT[tab]}
        </Suspense>
      </main>

      {/* Footer */}
      <footer style={{
        borderTop:     `1px solid ${T.border}`,
        padding:       '12px 32px',
        display:       'flex',
        justifyContent:'space-between',
        alignItems:    'center',
      }}>
        <div style={{ fontSize: 8, letterSpacing: '0.18em', color: T.textMute }}>
          DATA: BASEBALL REFERENCE · MLB STATS API · SIS · BASEBALL SAVANT
        </div>
        <div style={{ fontSize: 8, letterSpacing: '0.18em', color: T.textMute }}>
          DIAMONDMINE v2 · {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  )
}
