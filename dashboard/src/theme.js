// DiamondMine design tokens — single source of truth for all styling
export const T = {
  // Colors
  bg:       '#070906',
  bgCard:   '#0c0f09',
  bgHover:  '#0e1209',
  border:   '#161a0e',
  borderHi: '#1e2a10',
  accent:   '#C8F135',
  accentDim:'#8cc830',
  accentMid:'#6aaa22',
  textHi:   '#d4e89a',
  textMid:  '#8aaa60',
  textLow:  '#3a5a20',
  textMute: '#1e2e10',

  // Typography
  fontDisplay: "'Bebas Neue', sans-serif",
  fontMono:    "'DM Mono', monospace",

  // Spacing
  space: n => `${n * 4}px`,
}

// CSS string injected into document for global vars
export const globalCSS = `
  :root {
    --accent:    ${T.accent};
    --bg:        ${T.bg};
    --bg-card:   ${T.bgCard};
    --border:    ${T.border};
    --text-hi:   ${T.textHi};
    --text-mid:  ${T.textMid};
    --text-low:  ${T.textLow};
  }
`

// Shared inline style helpers
export const S = {
  card: {
    background:  T.bgCard,
    border:      `1px solid ${T.border}`,
    borderRadius: 3,
    padding:     '16px',
  },
  cardHover: {
    background:  T.bgCard,
    border:      `1px solid ${T.border}`,
    borderRadius: 3,
    padding:     '16px',
    cursor:      'pointer',
    transition:  'border-color .15s',
  },
  label: {
    fontSize:       9,
    letterSpacing:  '0.18em',
    color:          T.textLow,
    fontFamily:     T.fontMono,
  },
  sectionTitle: {
    fontFamily:     T.fontDisplay,
    fontSize:       32,
    letterSpacing:  '0.04em',
    color:          T.accent,
    lineHeight:     1,
  },
  eyebrow: {
    fontSize:      9,
    letterSpacing: '0.2em',
    color:         T.textLow,
    fontFamily:    T.fontMono,
  },
  pill: (active) => ({
    background:    active ? T.accent     : T.bgCard,
    color:         active ? T.bg         : T.textMid,
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
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#0e1209',
      borderColor:     '#1e2a10',
      borderWidth:     1,
      titleColor:      '#C8F135',
      bodyColor:       '#8aaa60',
      titleFont:       { family: "'Bebas Neue'", size: 14 },
      bodyFont:        { family: "'DM Mono'",    size: 11 },
      padding:         10,
    },
  },
  scales: {
    x: {
      grid:  { color: '#0e1209', drawBorder: false },
      ticks: { color: '#3a5a20', font: { family: "'DM Mono'", size: 10 } },
    },
    y: {
      grid:  { color: '#111508', drawBorder: false },
      ticks: { color: '#3a5a20', font: { family: "'DM Mono'", size: 10 } },
    },
  },
}
