import React, { useState, useEffect, useRef } from 'react'
import { T } from '../../theme'
import { api } from '../../api/client'
import Headshot from './Headshot'

export default function PlayerSearch({ onSelect, placeholder = 'Search player...', style = {} }) {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState([])
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const d = await api.searchPlayers(query)
        setResults(d.results || [])
        setOpen(true)
      } catch {}
      setLoading(false)
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder}
        style={{
          width:        '100%',
          background:   '#0c0f09',
          border:       `1px solid ${T.border}`,
          borderRadius: 3,
          padding:      '8px 12px',
          color:        T.textHi,
          fontFamily:   T.fontMono,
          fontSize:     12,
          outline:      'none',
          letterSpacing:'0.05em',
        }}
      />
      {loading && (
        <div style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          fontSize: 10, color: T.textLow,
        }}>···</div>
      )}
      {open && results.length > 0 && (
        <div style={{
          position:  'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: '#0c0f09', border: `1px solid ${T.border}`,
          borderRadius: 3, marginTop: 2, maxHeight: 320, overflowY: 'auto',
        }}>
          {results.map((p, i) => (
            <div
              key={i}
              onClick={() => { onSelect(p); setQuery(p.name); setOpen(false) }}
              style={{
                display:    'flex', alignItems: 'center', gap: 10,
                padding:    '8px 12px', cursor: 'pointer',
                borderBottom: `1px solid ${T.border}`,
                transition: 'background .1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#111508'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <Headshot player={p} size={32} />
              <div>
                <div style={{ fontSize: 13, color: T.textHi, fontFamily: T.fontMono }}>{p.name}</div>
                <div style={{ fontSize: 9, color: T.textLow, letterSpacing: '0.1em' }}>
                  {p.last_season} · {p.mlbam_id ? `ID ${p.mlbam_id}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
