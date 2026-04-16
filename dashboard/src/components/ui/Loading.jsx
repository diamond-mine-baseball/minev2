import React from 'react'
import { T } from '../../theme'

export default function Loading({ text = 'Loading...' }) {
  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            12,
      padding:        60,
      color:          T.textLow,
    }}>
      <div style={{
        fontFamily:    T.fontDisplay,
        fontSize:      28,
        letterSpacing: '0.1em',
        color:         T.accentMid,
        animation:     'pulse 1.4s ease-in-out infinite',
      }}>
        ⬡
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.2em' }}>{text.toUpperCase()}</div>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:.3} 50%{opacity:1} }
      `}</style>
    </div>
  )
}

export function ErrorMsg({ message }) {
  return (
    <div style={{
      padding:      24,
      background:   '#140a08',
      border:       '1px solid #3a1a10',
      borderRadius: 3,
      color:        '#cc6644',
      fontFamily:   "'DM Mono', monospace",
      fontSize:     11,
      letterSpacing:'0.05em',
    }}>
      ⚠ {message}
    </div>
  )
}
