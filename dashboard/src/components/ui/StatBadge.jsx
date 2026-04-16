import React from 'react'
import { T } from '../../theme'

export default function StatBadge({ label, value, accent = false, large = false }) {
  return (
    <div style={{
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'flex-end',
      gap:           2,
      minWidth:      0,
    }}>
      <div style={{
        fontSize:      large ? 28 : 20,
        fontFamily:    T.fontDisplay,
        letterSpacing: '0.04em',
        lineHeight:    1,
        color:         accent ? T.accent : T.textHi,
      }}>
        {value ?? '—'}
      </div>
      <div style={{
        fontSize:      8,
        letterSpacing: '0.16em',
        color:         T.textLow,
        fontFamily:    T.fontMono,
        whiteSpace:    'nowrap',
      }}>
        {label}
      </div>
    </div>
  )
}
