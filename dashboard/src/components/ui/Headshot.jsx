import React, { useState } from 'react'
import { T } from '../../theme'

const CDN_BASE = 'https://raw.githubusercontent.com/diamond-mine-baseball/dataservice/main/headshots'
const MLB_CDN  = id => `https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${id}/headshot/67/current`

function getSrcs(player) {
  const srcs = []
  // Go straight to GitHub CDN — no local API call needed in production
  if (player?.headshot) srcs.push(`${CDN_BASE}/${player.headshot}`)
  // MLB official CDN as fallback for players with mlbam_id but no headshot file
  if (player?.mlbam_id) srcs.push(MLB_CDN(player.mlbam_id))
  return srcs
}

export default function Headshot({ player, size = 48, style = {} }) {
  const [idx, setIdx] = useState(0)

  const initials = (player?.name || player || '')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const srcs = getSrcs(player)
  const src  = srcs[idx] ?? null

  const w = Math.round(size * 0.85)
  const h = size

  return (
    <div style={{
      width:          w,
      height:         h,
      borderRadius:   Math.round(size * 0.15),
      overflow:       'hidden',
      border:         `2px solid ${T.borderHi}`,
      background:     T.bgCard,
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      flexShrink:     0,
      fontFamily:     T.fontDisplay,
      fontSize:       size * 0.28,
      color:          T.textLow,
      ...style,
    }}>
      {src
        ? <img
            src={src}
            alt={initials}
            onError={() => setIdx(i => i + 1)}
            style={{
              width:          '100%',
              height:         '100%',
              objectFit:      'cover',
              objectPosition: 'center 15%',
            }}
          />
        : initials
      }
    </div>
  )
}
