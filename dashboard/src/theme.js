// DiamondMine design tokens — single source of truth for all styling

export const T = {
  // Colors — dark purple palette
  bg:        '#07060f',
  bgCard:    '#0d0b1a',
  bgHover:   '#111026',
  border:    '#1c1838',
  borderHi:  '#2e2860',

  accent:    '#c084fc',   // bright lilac — replaces lime green
  accentDim: '#7c3aed',
  accentMid: '#a855f7',

  textHi:   '#f5f0ff',   // near-white with slight purple tint
  textMid:  '#c4b5e8',
  textLow:  '#6b5fa0',
  textMute: '#3d3460',

  // Typography
  fontDisplay: "'Bebas Neue', sans-serif",
  fontMono:    "'DM Mono', monospace",

  // Spacing
  space: n => `${n * 4}px`,
}

// CSS string injected into document for global vars
export const globalCSS = `
  :root {
    --accent:   ${T.accent};
    --bg:       ${T.bg};
    --bg-card:  ${T.bgCard};
    --border:   ${T.border};
    --text-hi:  ${T.textHi};
    --text-mid: ${T.textMid};
    --text-low: ${T.textLow};
  }
`

// Shared inline style helpers
export const S = {
  card: {
    background:   T.bgCard,
    border:       `1px solid ${T.border}`,
    borderRadius: 3,
    padding:      '16px',
  },
  cardHover: {
    background:   T.bgCard,
    border:       `1px solid ${T.border}`,
    borderRadius: 3,
    padding:      '16px',
    cursor:       'pointer',
    transition:   'border-color .15s',
  },
  label: {
    fontSize:      9,
    letterSpacing: '0.18em',
    color:         T.textLow,
    fontFamily:    T.fontMono,
  },
  sectionTitle: {
    fontFamily:    T.fontDisplay,
    fontSize:      32,
    letterSpacing: '0.04em',
    color:         T.accent,
    lineHeight:    1,
  },
  eyebrow: {
    fontSize:      9,
    letterSpacing: '0.2em',
    color:         T.textLow,
    fontFamily:    T.fontMono,
  },
  pill: (active) => ({
    background:    active ? T.accent : T.bgCard,
    color:         active ? T.bg : T.textMid,
    border:        `1px solid ${active ? T.accent : T.border}`,
    borderRadius:  2,
    padding:       '3px 10px',
    fontSize:      9,
    letterSpacing: '0.14em',
    cursor:        'pointer',
    fontFamily:    T.fontMono,
    transition:    'all .15s',
  }),
}

// Chart.js shared config
export const chartDefaults = {
  responsive:          true,
  maintainAspectRatio: false,
  plugins: {
    legend:  { display: false },
    tooltip: {
      backgroundColor: '#0d0b1a',
      borderColor:     '#2e2860',
      borderWidth:     1,
      titleColor:      '#c084fc',
      bodyColor:       '#c4b5e8',
      titleFont: { family: "'Bebas Neue'", size: 14 },
      bodyFont:  { family: "'DM Mono'",   size: 11 },
      padding:   10,
    },
  },
  scales: {
    x: {
      grid:  { color: '#0d0b1a', drawBorder: false },
      ticks: { color: '#6b5fa0', font: { family: "'DM Mono'", size: 10 } },
    },
    y: {
      grid:  { color: '#111026', drawBorder: false },
      ticks: { color: '#6b5fa0', font: { family: "'DM Mono'", size: 10 } },
    },
  },
}
