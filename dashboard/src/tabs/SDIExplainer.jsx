import React, { useState } from 'react'

const T = {
  bg:       '#0a0e0a',
  bgCard:   '#0d150d',
  bgHi:     '#111a11',
  border:   '#1a2a1a',
  borderHi: '#2a4a2a',
  green:    '#39ff14',
  greenDim: '#1a5a00',
  gold:     '#d4a800',
  goldDim:  '#5a4500',
  red:      '#ff4444',
  blue:     '#44aaff',
  text:     '#c8e0c8',
  textMid:  '#7a9a7a',
  textLow:  '#4a6a4a',
  mono:     '"DM Mono", monospace',
  disp:     '"Bebas Neue", sans-serif',
}

const css = `
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(16px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes glow {
    0%,100% { text-shadow: 0 0 20px #39ff1444; }
    50%      { text-shadow: 0 0 40px #39ff1488; }
  }
  .sdi-section { animation: fadeUp 0.5s ease both; }
  .sdi-section:nth-child(1) { animation-delay: 0.05s }
  .sdi-section:nth-child(2) { animation-delay: 0.10s }
  .sdi-section:nth-child(3) { animation-delay: 0.15s }
  .sdi-section:nth-child(4) { animation-delay: 0.20s }
  .sdi-section:nth-child(5) { animation-delay: 0.25s }
  .sdi-title { animation: glow 3s ease-in-out infinite; }
  .metric-row:hover { background: #111a11 !important; }
  .faq-item { cursor: pointer; }
  .faq-item:hover > div:first-child { color: #39ff14 !important; }
`

function Tag({ color, children }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px', borderRadius: 3,
      background: color + '22', color,
      fontFamily: T.mono, fontSize: 10,
      letterSpacing: '0.08em', border: `1px solid ${color}44`,
    }}>{children}</span>
  )
}

function SectionHeader({ number, title, subtitle }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
        <span style={{ fontFamily:T.mono, fontSize:11, color:T.textLow }}>{number}</span>
        <h2 style={{
          fontFamily: T.disp, fontSize: 28, color: T.green,
          letterSpacing: '0.1em', margin: 0, lineHeight: 1,
        }}>{title}</h2>
      </div>
      {subtitle && (
        <p style={{ fontFamily:T.mono, fontSize:12, color:T.textMid, margin:'8px 0 0 23px', lineHeight:1.6 }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

function MetricTable({ rows, caption }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {caption && (
        <div style={{ fontFamily:T.mono, fontSize:10, color:T.textLow, letterSpacing:'0.1em', marginBottom:8, textTransform:'uppercase' }}>
          {caption}
        </div>
      )}
      <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
        {rows.map((row, i) => (
          <div key={i} className="metric-row" style={{
            display:'grid', gridTemplateColumns:'1fr 60px 2fr',
            gap:0, padding:'10px 14px',
            background: i % 2 === 0 ? T.bgCard : T.bg,
            borderBottom: i < rows.length-1 ? `1px solid ${T.border}` : 'none',
            transition:'background 0.15s',
          }}>
            <div style={{ fontFamily:T.mono, fontSize:11, color:T.text }}>{row.metric}</div>
            <div style={{ textAlign:'center' }}>
              <span style={{
                fontFamily:T.mono, fontSize:10,
                color: row.weight >= 2.5 ? T.green : row.weight >= 1.5 ? T.gold : row.weight >= 1 ? T.blue : T.textMid,
                fontWeight:700,
              }}>
                {row.weight}×
              </span>
            </div>
            <div style={{ fontFamily:T.mono, fontSize:11, color:T.textMid, lineHeight:1.5 }}>{row.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StabilizationTable({ rows, caption }) {
  return (
    <div style={{ marginBottom: 20 }}>
      {caption && (
        <div style={{ fontFamily:T.mono, fontSize:10, color:T.textLow, letterSpacing:'0.1em', marginBottom:8, textTransform:'uppercase' }}>
          {caption}
        </div>
      )}
      <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
        <div style={{
          display:'grid', gridTemplateColumns:'1fr 80px 80px 2fr',
          padding:'8px 14px', background:T.bgHi,
          borderBottom:`1px solid ${T.border}`,
        }}>
          {['Metric','Contact','TTO/Power','Why it differs'].map(h => (
            <div key={h} style={{ fontFamily:T.mono, fontSize:9, color:T.textLow, letterSpacing:'0.1em', textTransform:'uppercase' }}>{h}</div>
          ))}
        </div>
        {rows.map((row, i) => (
          <div key={i} className="metric-row" style={{
            display:'grid', gridTemplateColumns:'1fr 80px 80px 2fr',
            padding:'10px 14px',
            background: i % 2 === 0 ? T.bgCard : T.bg,
            borderBottom: i < rows.length-1 ? `1px solid ${T.border}` : 'none',
            transition:'background 0.15s',
          }}>
            <div style={{ fontFamily:T.mono, fontSize:11, color:T.text }}>{row.metric}</div>
            <div style={{ fontFamily:T.mono, fontSize:11, color:T.gold, textAlign:'center' }}>{row.contact}</div>
            <div style={{ fontFamily:T.mono, fontSize:11, color:T.green, textAlign:'center' }}>{row.power}</div>
            <div style={{ fontFamily:T.mono, fontSize:11, color:T.textMid, lineHeight:1.5 }}>{row.why}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FormulaBlock({ label, formula, explanation }) {
  return (
    <div style={{
      background: T.bgCard, border:`1px solid ${T.borderHi}`,
      borderLeft:`3px solid ${T.green}`,
      borderRadius:6, padding:'14px 16px', marginBottom:16,
    }}>
      {label && (
        <div style={{ fontFamily:T.mono, fontSize:9, color:T.textLow, letterSpacing:'0.12em', textTransform:'uppercase', marginBottom:8 }}>
          {label}
        </div>
      )}
      <div style={{
        fontFamily:T.mono, fontSize:13, color:T.green,
        letterSpacing:'0.04em', lineHeight:1.8,
        whiteSpace:'pre-wrap',
      }}>{formula}</div>
      {explanation && (
        <div style={{ fontFamily:T.mono, fontSize:11, color:T.textMid, marginTop:10, lineHeight:1.6 }}>
          {explanation}
        </div>
      )}
    </div>
  )
}

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="faq-item" onClick={() => setOpen(o=>!o)} style={{
      border:`1px solid ${open ? T.borderHi : T.border}`,
      borderRadius:6, marginBottom:8, overflow:'hidden',
      transition:'border-color 0.2s',
    }}>
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        padding:'12px 16px', background: open ? T.bgHi : T.bgCard,
      }}>
        <div style={{ fontFamily:T.mono, fontSize:12, color: open ? T.green : T.text, lineHeight:1.5, transition:'color 0.2s' }}>
          {q}
        </div>
        <div style={{ fontFamily:T.mono, fontSize:11, color:T.textLow, marginLeft:16, flexShrink:0 }}>
          {open ? '▲' : '▼'}
        </div>
      </div>
      {open && (
        <div style={{ padding:'12px 16px', background:T.bg, borderTop:`1px solid ${T.border}` }}>
          <div style={{ fontFamily:T.mono, fontSize:11, color:T.textMid, lineHeight:1.8 }}>{a}</div>
        </div>
      )}
    </div>
  )
}

function CalloutBox({ color, icon, title, children }) {
  return (
    <div style={{
      background: color + '11', border:`1px solid ${color}33`,
      borderLeft:`3px solid ${color}`, borderRadius:6,
      padding:'14px 16px', marginBottom:16,
    }}>
      <div style={{ fontFamily:T.disp, fontSize:14, color, letterSpacing:'0.08em', marginBottom:8 }}>
        {icon} {title}
      </div>
      <div style={{ fontFamily:T.mono, fontSize:11, color:T.textMid, lineHeight:1.8 }}>
        {children}
      </div>
    </div>
  )
}

const BATTER_METRICS = [
  { metric: 'OPS+ (On-base Plus Slugging Plus)',      weight: 3.0, desc: 'Normalized to league average (100 = avg). Captures total offensive output — on-base ability and power in one number. Park-adjusted.' },
  { metric: 'xwOBA (Expected Weighted On-Base Avg)',  weight: 3.0, desc: 'Statcast metric based on quality of contact (exit velocity, launch angle). Strips out luck from hits that fell in or were robbed.' },
  { metric: 'Barrel% (Barrel Rate)',                  weight: 2.0, desc: 'Percentage of batted balls classified as "barreled" — optimal exit velocity + launch angle. Strongest predictor of future power output.' },
  { metric: 'Hard Hit% (Hard Hit Rate)',               weight: 2.0, desc: 'Percentage of batted balls at ≥95 mph exit velocity. Measures consistent quality of contact independent of outcomes.' },
  { metric: 'EV (Average Exit Velocity)',              weight: 1.5, desc: 'Mean exit velocity on all batted balls. Proxy for raw power and bat speed. Less descriptive than Barrel% but broadly available.' },
  { metric: 'BB% (Walk Rate)',                         weight: 0.75, desc: 'Walks per plate appearance. Measures plate discipline. Downweighted early-season — high variance on small samples.' },
  { metric: 'K% (Strikeout Rate)',                     weight: 0.5, desc: 'Strikeouts per plate appearance. Most volatile early-season stat — heavily downweighted. Inverted: lower K% = positive deviation.' },
]

const PITCHER_METRICS = [
  { metric: 'ERA (Earned Run Average)',   weight: 3.0, desc: 'Primary outcome metric. Computed from career aggregate ER/IP totals (not season averages) for accuracy. High variance early in season.' },
  { metric: 'K/9 (Strikeouts per 9 IP)',  weight: 2.5, desc: 'Stabilizes faster than ERA — pitcher controls strikeouts more directly than runs. Strong early-season signal. Inverted ERA/WHIP logic applies.' },
  { metric: 'WHIP (Walks + Hits per IP)', weight: 2.0, desc: 'Composite control + contact quality metric. Combines BB and H rate — better early indicator than ERA alone.' },
  { metric: 'BB/9 (Walks per 9 IP)',       weight: 1.0, desc: 'Control metric. Downweighted because walk rate is noisier early in the season than strikeout rate.' },
]

const BAT_STAB = [
  { metric:'K%',        contact:'40 PA', power:'80 PA',  why:'Power hitters have naturally higher and more variable K rates — need more data to see the "true" rate emerge' },
  { metric:'BB%',       contact:'120 PA', power:'80 PA', why:'Contact hitters show more stable walk rates; TTO guys have wider BB% swings game-to-game' },
  { metric:'xwOBA',     contact:'150 PA', power:'100 PA',why:'Contact hitters show more variance in xwOBA since their value comes from placement, not exit velocity alone' },
  { metric:'Barrel%',   contact:'80 PA',  power:'30 PA', why:'Power hitters barrel the ball consistently — their rate stabilizes quickly. Contact hitters vary more.' },
  { metric:'Hard Hit%', contact:'60 PA',  power:'50 PA', why:'Relatively stable for both types but slightly more variable for contact hitters whose value isn\'t dependent on exit velocity' },
]

const PIT_STAB = [
  { metric:'K/9',  contact:'90 BF',  power:'50 BF',  why:'Power pitchers (high K, high BB) have more stable K rates; finesse pitchers\' K rates fluctuate more with sequencing' },
  { metric:'BB/9', contact:'120 BF', power:'150 BF', why:'Finesse pitchers control walks as their primary weapon — more stable. Power pitchers have wider BB swings.' },
  { metric:'ERA',  contact:'200 BF', power:'200 BF', why:'ERA stabilizes slowly for all pitcher types — too much variance from sequencing, defense, and park factors' },
  { metric:'WHIP', contact:'150 BF', power:'150 BF', why:'Composite metric stabilizes at similar rates regardless of archetype' },
]

export default function SDIExplainer() {
  return (
    <div style={{ background:T.bg, minHeight:'100vh', padding:'32px 16px 80px', fontFamily:T.mono }}>
      <style>{css}</style>

      {/* Hero */}
      <div style={{ maxWidth:860, margin:'0 auto 48px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <Tag color={T.green}>DiamondMine Analytics</Tag>
          <Tag color={T.gold}>Methodology</Tag>
        </div>
        <h1 className="sdi-title" style={{
          fontFamily:T.disp, fontSize:64, color:T.green,
          letterSpacing:'0.1em', margin:'0 0 8px', lineHeight:1,
        }}>
          SDI
        </h1>
        <div style={{ fontFamily:T.disp, fontSize:22, color:T.textMid, letterSpacing:'0.12em', marginBottom:16 }}>
          SUSTAINED DEVIATION INDEX
        </div>
        <div style={{ height:2, background:`linear-gradient(90deg, ${T.green}, transparent)`, marginBottom:24 }}/>
        <p style={{ fontSize:13, color:T.textMid, lineHeight:1.9, maxWidth:680 }}>
          A Bayesian signal detection framework for identifying whether a player's current season 
          performance represents a statistically real shift from their established baseline — 
          or whether it's noise that will regress as the season progresses.
        </p>
      </div>

      <div style={{ maxWidth:860, margin:'0 auto', display:'flex', flexDirection:'column', gap:40 }}>

        {/* ── Section 1: Overview ─────────────────────────────────────────── */}
        <div className="sdi-section">
          <SectionHeader
            number="01"
            title="WHAT IS SDI?"
            subtitle="The big picture — what it measures, what it doesn't, and when it matters most"
          />

          <CalloutBox color={T.green} icon="⚡" title="THE CORE IDEA">
            SDI asks one question: <strong style={{color:T.text}}>Is this player performing differently than we'd expect based on everything they've done before?</strong>{' '}
            It doesn't compare players to each other. It compares each player to their own history.
            A player hitting .220 might have a strongly positive SDI if they always hit .190.
            A player hitting .320 might have a negative SDI if they've always hit .340.
          </CalloutBox>

          <p style={{ fontSize:12, color:T.textMid, lineHeight:1.9, marginBottom:16 }}>
            Traditional stats tell you <em style={{color:T.text}}>what happened</em>. SDI tells you <em style={{color:T.text}}>whether what happened is surprising</em>, and how much you should trust that surprise.
            Early in the season, everything looks surprising — a player can go 8-for-10 in the first week and look like an MVP candidate.
            SDI accounts for this by expressing confidence separately from direction.
          </p>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
            {[
              { icon:'📈', label:'BREAKOUT', color:T.green, desc:'Player is outperforming their career baseline across weighted metrics' },
              { icon:'📉', label:'REGRESSION RISK', color:T.gold, desc:'Player is underperforming their career baseline — bounce-back candidate' },
              { icon:'👁', label:'WATCH LIST', color:T.blue, desc:'Mixed or neutral signals — neither clearly over nor underperforming' },
            ].map(({icon,label,color,desc}) => (
              <div key={label} style={{
                background:T.bgCard, border:`1px solid ${color}33`,
                borderTop:`2px solid ${color}`, borderRadius:6, padding:'12px 14px',
              }}>
                <div style={{ fontFamily:T.disp, fontSize:14, color, letterSpacing:'0.08em', marginBottom:6 }}>
                  {icon} {label}
                </div>
                <div style={{ fontSize:11, color:T.textMid, lineHeight:1.6 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden', marginBottom:16 }}>
            <div style={{ background:T.bgHi, padding:'10px 14px', borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontFamily:T.mono, fontSize:10, color:T.textLow, letterSpacing:'0.1em', textTransform:'uppercase' }}>
                How SDI evolves over a season
              </span>
            </div>
            <div style={{ padding:'14px', background:T.bgCard }}>
              <div style={{ display:'flex', gap:0, alignItems:'stretch', marginBottom:12 }}>
                {[
                  { label:'April', weeks:'Weeks 1–3', conf:'15–35%', color:T.red, note:'High noise. Large deviations are likely flukes. SDI signal exists but confidence is very low.' },
                  { label:'May', weeks:'Weeks 4–7', conf:'35–55%', color:T.gold, note:'Signal begins to separate from noise. Breakout/regression candidates start to crystallize.' },
                  { label:'June–July', weeks:'Weeks 8–16', conf:'55–75%', color:T.green, note:'Strong signal territory. Sustained deviations at this point have real predictive weight.' },
                  { label:'Aug–Sept', weeks:'Weeks 17+', conf:'75%+', color:T.green, note:'Near-definitive signal. Players performing differently have genuinely changed something.' },
                ].map((s,i) => (
                  <div key={i} style={{
                    flex:1, padding:'10px 12px',
                    background: i % 2 === 0 ? T.bg : T.bgCard,
                    borderRight: i < 3 ? `1px solid ${T.border}` : 'none',
                  }}>
                    <div style={{ fontFamily:T.disp, fontSize:14, color:s.color, letterSpacing:'0.08em' }}>{s.label}</div>
                    <div style={{ fontSize:9, color:T.textLow, marginBottom:6, fontFamily:T.mono }}>{s.weeks}</div>
                    <div style={{
                      fontSize:11, color:s.color, fontFamily:T.mono,
                      padding:'2px 6px', background:s.color+'22', borderRadius:3,
                      display:'inline-block', marginBottom:8,
                    }}>{s.conf} conf.</div>
                    <div style={{ fontSize:10, color:T.textMid, lineHeight:1.6 }}>{s.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: How to read it ────────────────────────────────────── */}
        <div className="sdi-section">
          <SectionHeader
            number="02"
            title="HOW TO READ SDI"
            subtitle="What the numbers mean in plain English"
          />

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:6, padding:'16px' }}>
              <div style={{ fontFamily:T.disp, fontSize:18, color:T.green, letterSpacing:'0.08em', marginBottom:12 }}>
                NET SDI VALUE
              </div>
              {[
                { range:'> +0.25', label:'Strong breakout signal', color:T.green },
                { range:'+0.10 to +0.25', label:'Developing breakout', color:T.gold },
                { range:'-0.10 to +0.10', label:'Noise / stable', color:T.blue },
                { range:'-0.10 to -0.25', label:'Developing regression', color:T.gold },
                { range:'< -0.25', label:'Strong regression signal', color:T.red },
              ].map(({range,label,color}) => (
                <div key={range} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 0', borderBottom:`1px solid ${T.border}`,
                }}>
                  <span style={{ fontFamily:T.mono, fontSize:11, color }}>{range}</span>
                  <span style={{ fontFamily:T.mono, fontSize:10, color:T.textMid }}>{label}</span>
                </div>
              ))}
              <p style={{ fontSize:10, color:T.textLow, marginTop:10, lineHeight:1.6 }}>
                SDI is normalized to a roughly –1 to +1 scale. Each metric's deviation is divided by its typical season-to-season range, then weighted and averaged. A value of +0.30 means the player is outperforming career norms by ~30% of the typical deviation range across tracked metrics.
              </p>
            </div>

            <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:6, padding:'16px' }}>
              <div style={{ fontFamily:T.disp, fontSize:18, color:T.gold, letterSpacing:'0.08em', marginBottom:12 }}>
                CONFIDENCE %
              </div>
              {[
                { range:'> 65%', label:'Strong — trust the signal', color:T.green },
                { range:'45–65%', label:'Developing — watch closely', color:T.gold },
                { range:'25–45%', label:'Early — directionally useful', color:T.gold },
                { range:'< 25%', label:'Very early — high noise', color:T.red },
              ].map(({range,label,color}) => (
                <div key={range} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'6px 0', borderBottom:`1px solid ${T.border}`,
                }}>
                  <span style={{ fontFamily:T.mono, fontSize:11, color }}>{range}</span>
                  <span style={{ fontFamily:T.mono, fontSize:10, color:T.textMid }}>{label}</span>
                </div>
              ))}
              <p style={{ fontSize:10, color:T.textLow, marginTop:10, lineHeight:1.6 }}>
                Confidence is not a threshold — it's a caveat. A player can have a strong SDI signal at 30% confidence. That means the direction is clear, but we've only seen ~30% of the sample needed to call it definitive. As the season progresses, confidence rises for all players simultaneously.
              </p>
            </div>
          </div>

          <CalloutBox color={T.gold} icon="📖" title="EXAMPLE: READING A PLAYER CARD">
            <strong style={{color:T.text}}>Jordan Walker (STL) — net_sdi: +0.274, conf: 38.4%, BREAKOUT</strong>{'\n\n'}
            Translation: Walker is currently outperforming his career baseline by a weighted-average of ~27% of the typical deviation range across tracked metrics. We've seen about 38% of the sample size needed to call this definitive — it's early April.{'\n\n'}
            <strong style={{color:T.text}}>In plain English:</strong> Walker is hitting the ball significantly harder and getting on base at a much higher rate than his career numbers suggest. It's too early to call it a full breakout, but the signal is pointing clearly in one direction. Worth watching as confidence builds through May.
          </CalloutBox>
        </div>

        {/* ── Section 3: Batter SDI ─────────────────────────────────────────── */}
        <div className="sdi-section">
          <SectionHeader
            number="03"
            title="BATTER SDI — INPUTS & WEIGHTS"
            subtitle="What gets measured, how much each metric counts, and why"
          />

          <p style={{ fontSize:12, color:T.textMid, lineHeight:1.8, marginBottom:20 }}>
            Batter SDI uses seven metrics organized into two tiers: <Tag color={T.green}>output metrics</Tag> that measure actual production, 
            and <Tag color={T.textMid}>discipline metrics</Tag> that are informative but noisy early in the season.
            Weights are designed so that a player's actual production (OPS+, xwOBA) drives the SDI signal, 
            while discipline stats (K%, BB%) act as supporting evidence.
          </p>

          <MetricTable rows={BATTER_METRICS} caption="Batter metric weights" />

          <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:6, padding:'16px', marginBottom:20 }}>
            <div style={{ fontFamily:T.disp, fontSize:16, color:T.text, letterSpacing:'0.08em', marginBottom:12 }}>
              CAREER BASELINE CONSTRUCTION
            </div>
            <p style={{ fontSize:11, color:T.textMid, lineHeight:1.8, marginBottom:12 }}>
              Each player's career baseline is a <strong style={{color:T.text}}>plate-appearance-weighted average</strong> across all seasons prior to the current year.
              This means a full 162-game season contributes proportionally more to the baseline than a 60-game COVID season or a partial injury year.
            </p>
            <FormulaBlock
              label="PA-weighted career xwOBA"
              formula={`career_xwoba = SUM(xwoba × pa) / SUM(pa)\n\n` +
                `Example — Lindor:\n  2021: xwOBA=0.344, PA=524  →  0.344 × 524 = 180.3\n  2022: xwOBA=0.333, PA=706  →  0.333 × 706 = 235.0\n  2023: xwOBA=0.346, PA=687  →  0.346 × 687 = 237.7\n  2024: xwOBA=0.381, PA=689  →  0.381 × 689 = 262.6\n  2025: xwOBA=0.345, PA=732  →  0.345 × 732 = 252.5\n  ───────────────────────────────────────────────────\n  career_xwoba = 1168.1 / 3338 = 0.350`}
              explanation="Lindor's career xwOBA baseline is 0.350. If his 2026 xwOBA is 0.334, the raw deviation is –0.016 (underperforming). At a typical xwOBA range of 0.15, the normalized deviation is –0.107. This feeds into his negative net_sdi."
            />
            <p style={{ fontSize:11, color:T.textMid, lineHeight:1.8 }}>
              <strong style={{color:T.text}}>Minimum requirement:</strong> A player must have at least 50 career PA and at least one production metric (OPS+, xwOBA, Barrel%, or Hard Hit%) with a valid career baseline. 
              Players with only discipline metrics (K%/BB%) available are excluded to prevent misleading signals.
            </p>
          </div>

          <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:6, padding:'16px' }}>
            <div style={{ fontFamily:T.disp, fontSize:16, color:T.text, letterSpacing:'0.08em', marginBottom:12 }}>
              ARCHETYPE DETECTION & STABILIZATION S-VALUES
            </div>
            <p style={{ fontSize:11, color:T.textMid, lineHeight:1.8, marginBottom:12 }}>
              Not all stats stabilize at the same rate for all players. SDI uses <strong style={{color:T.text}}>archetype-adjusted S-values</strong> — 
              the sample size (in PA) at which signal equals noise (Bayesian 50/50 reliability point).
              A <Tag color={T.gold}>TTO</Tag> (Three True Outcomes) power hitter has different variance curves than a <Tag color={T.blue}>contact</Tag> hitter.
            </p>
            <div style={{
              display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16,
            }}>
              {[
                { arch:'CONTACT HITTER', color:T.blue, criteria:'Career K% < 22% AND HR/600PA < 25', examples:'Freddie Freeman, Nico Hoerner, Luis Arraez' },
                { arch:'TTO / POWER', color:T.gold, criteria:'Career K% > 22% OR HR/600PA > 25', examples:'Aaron Judge, Pete Alonso, Kyle Schwarber' },
              ].map(({arch,color,criteria,examples}) => (
                <div key={arch} style={{ background:T.bg, border:`1px solid ${color}33`, borderRadius:6, padding:'12px 14px' }}>
                  <div style={{ fontFamily:T.disp, fontSize:14, color, letterSpacing:'0.08em', marginBottom:8 }}>{arch}</div>
                  <div style={{ fontSize:10, color:T.textLow, marginBottom:4 }}>DETECTED WHEN:</div>
                  <div style={{ fontSize:11, color:T.textMid, marginBottom:8, lineHeight:1.5 }}>{criteria}</div>
                  <div style={{ fontSize:10, color:T.textLow, marginBottom:4 }}>EXAMPLES:</div>
                  <div style={{ fontSize:10, color:T.textMid }}>{examples}</div>
                </div>
              ))}
            </div>
            <StabilizationTable rows={BAT_STAB} caption="S-values by archetype (PA where signal = noise)" />
          </div>
        </div>

        {/* ── Section 4: Pitcher SDI ───────────────────────────────────────── */}
        <div className="sdi-section">
          <SectionHeader
            number="04"
            title="PITCHER SDI — INPUTS & WEIGHTS"
            subtitle="Four metrics, two archetypes, and why IP-aggregate baselines matter"
          />

          <p style={{ fontSize:12, color:T.textMid, lineHeight:1.8, marginBottom:20 }}>
            Pitcher SDI uses four metrics. ERA and WHIP are <em style={{color:T.text}}>inverted</em> — lower values are better, 
            so their deviations are flipped before entering the SDI calculation. 
            A pitcher with ERA 2.00 vs career 3.50 has a raw deviation of –1.50, which becomes +1.50 in the SDI calculation.
          </p>

          <MetricTable rows={PITCHER_METRICS} caption="Pitcher metric weights" />

          <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:6, padding:'16px', marginBottom:20 }}>
            <div style={{ fontFamily:T.disp, fontSize:16, color:T.text, letterSpacing:'0.08em', marginBottom:12 }}>
              AGGREGATE IP BASELINE (vs averaging season ERAs)
            </div>
            <p style={{ fontSize:11, color:T.textMid, lineHeight:1.8, marginBottom:12 }}>
              Pitcher career ERA is computed from <strong style={{color:T.text}}>aggregate totals</strong>, not season averages. 
              This avoids over-weighting partial seasons or injury years where a pitcher had 15 IP with a 6.00 ERA.
            </p>
            <FormulaBlock
              label="IP-aggregate career ERA"
              formula={`career_era = SUM(er) × 9.0 / SUM(ip)\n\n` +
                `Example — Kershaw:\n  Total career ER: 715\n  Total career IP: 2,601\n  career_era = 715 × 9 / 2601 = 2.47\n\n` +
                `Compare to simple average of season ERAs: 2.51 (slight difference due to weighting)`}
              explanation="Same method applies to K/9 and BB/9 — we aggregate total SO and BB then compute the rate, rather than averaging per-season rates. This is statistically more accurate."
            />
          </div>

          <div style={{ background:T.bgCard, border:`1px solid ${T.border}`, borderRadius:6, padding:'16px' }}>
            <div style={{ fontFamily:T.disp, fontSize:16, color:T.text, letterSpacing:'0.08em', marginBottom:12 }}>
              PITCHER ARCHETYPES & STABILIZATION
            </div>
            <p style={{ fontSize:11, color:T.textMid, lineHeight:1.8, marginBottom:12 }}>
              BF (batters faced) is estimated as <code style={{color:T.green}}>IP × 3.7</code> for stabilization calculations.
              Power pitchers (high K/9) have more stable strikeout rates, so their K/9 S-value is lower.
              Finesse pitchers control walks as their primary weapon, so their BB/9 S-value is lower.
            </p>
            <StabilizationTable
              rows={PIT_STAB}
              caption="S-values by archetype (estimated BF where signal = noise)"
            />
          </div>
        </div>

        {/* ── Section 5: The Math ──────────────────────────────────────────── */}
        <div className="sdi-section">
          <SectionHeader
            number="05"
            title="THE CALCULATIONS"
            subtitle="Step by step — how a single SDI value is produced"
          />

          {[
            {
              label:"STEP 1 — BAYESIAN RELIABILITY WEIGHT",
              formula:"weight = sample_size / (sample_size + S)\n\nExample: K% for a TTO batter with 80 PA, S=80\nweight = 80 / (80 + 80) = 0.50  → 50% reliable",
              explanation:"The Bayesian reliability weight asks: given how much data we have, how much of the signal is real vs. noise? At 50% weight, we're exactly at the 50/50 point — signal equals noise. Below this, noise dominates. Above this, signal dominates."
            },
            {
              label:"STEP 2 — RAW DEVIATION",
              formula:"raw_dev = current_value - career_value\n\n(For inverse metrics: raw_dev = career_value - current_value)\n\nExample: Walker barrel% 24.4% vs career 8.2%\nraw_dev = 24.4 - 8.2 = +16.2 percentage points",
              explanation:"For metrics where lower is better (ERA, WHIP, BB/9, K% for batters), the deviation is inverted so positive always means 'performing better than career baseline.'"
            },
            {
              label:"STEP 3 — SUSTAINED DEVIATION",
              formula:"sustained_dev = raw_dev × weight\n\nExample: Walker barrel% raw_dev=16.2, weight=0.52\nsustained_dev = 16.2 × 0.52 = +8.4",
              explanation:"The sustained deviation is the sample-weighted signal. At 52% confidence, we're saying 52% of Walker's barrel% deviation is real, sustained signal — the rest could still be noise."
            },
            {
              label:"STEP 4 — NORMALIZATION TO SCALE",
              formula:"norm_dev = sustained_dev / typical_range\n\nBarrel% typical range = 12.0 percentage points\nnorm_dev = 8.4 / 12.0 = +0.70\n\nThis puts all metrics on the same scale (~-1 to +1)",
              explanation:"Without normalization, OPS+ deviations of 50 points would dwarf xwOBA deviations of 0.05 even if both represent equally significant improvements. Dividing by the typical range makes all metrics comparable."
            },
            {
              label:"STEP 5 — WEIGHTED AVERAGE → NET SDI",
              formula:"net_sdi = Σ(norm_dev × metric_weight) / Σ(metric_weights)\n\nExample with 3 metrics:\n  xwOBA:      norm=+0.40, weight=3.0  → 1.20\n  barrel_pct: norm=+0.70, weight=2.0  → 1.40\n  k_pct:      norm=-0.05, weight=0.5  → -0.025\n  ─────────────────────────────────────────────\n  net_sdi = (1.20+1.40-0.025) / (3.0+2.0+0.5)\n          = 2.575 / 5.5 = +0.468",
              explanation="The final SDI value is a weighted average of all normalized deviations. High-weight metrics (OPS+, xwOBA) can move the needle significantly; low-weight metrics (K%) nudge it modestly."
            },
            {
              label:"STEP 6 — OVERALL CONFIDENCE",
              formula:"confidence = (Σ weights_i) / n_metrics × 100%\n\n(where each weight_i = sample / (sample + S_i) for metric i)\n\nExample: 3 metrics, weights = [0.52, 0.60, 0.44]\nconfidence = ((0.52+0.60+0.44)/3) × 100 = 52%",
              explanation:"Overall confidence is the average Bayesian reliability weight across all computed metrics, expressed as a percentage. It represents roughly 'what fraction of the expected sample size have we logged?'"
            },
          ].map((step, i) => (
            <FormulaBlock key={i} label={step.label} formula={step.formula} explanation={step.explanation} />
          ))}
        </div>

        {/* ── Section 6: FAQ ───────────────────────────────────────────────── */}
        <div className="sdi-section">
          <SectionHeader
            number="06"
            title="FREQUENTLY ASKED QUESTIONS"
            subtitle="Limitations, edge cases, and things SDI does not claim to do"
          />

          <CalloutBox color={T.red} icon="⚠" title="IMPORTANT DISCLAIMER">
            SDI is a <strong style={{color:T.text}}>relative performance metric</strong>, not an absolute ranking. 
            It does not tell you who the best player in baseball is. It tells you who is performing most differently 
            from their own established baseline. A replacement-level player having a career month will have a high SDI. 
            Mike Trout having a slightly above-average season by his standards will have a low SDI.
          </CalloutBox>

          {[
            {
              q: "Why isn't SDI a reliable measure of how good a player is?",
              a: "Because it measures relative change, not absolute ability. SDI compares each player against their own history, not against other players or league average. A player with a +0.40 SDI might be a fringe roster player having a hot start. A player with a +0.10 SDI might be Mike Trout performing right at his usual elite level. SDI answers 'is this player performing differently than expected?' — not 'is this player good?'"
            },
            {
              q: "A player shows up as a 'Regression Risk' — does that mean they'll definitely get worse?",
              a: "No. Regression Risk means the player is currently underperforming their career baseline by a sustained amount. It's an opportunity signal — the data suggests they should return closer to their career norms as the season progresses. But careers end, injuries happen, age curves set in, and mechanics change. SDI does not account for any of these. It simply says: historically, this player has been better than this. The past 3 weeks may not be a fair representation of their true talent."
            },
            {
              q: "A player shows up as a 'Breakout' candidate — does that mean they've actually improved?",
              a: "Not necessarily. A breakout signal means the player is outperforming their career baseline. This could mean genuine improvement (new swing mechanics, better plate approach), a natural age progression into a peak years, or simply a hot streak that will regress. SDI does not distinguish between sustainable improvement and statistical noise that happens to look good. The confidence score helps with this — at 30% confidence, it's much more likely to be a hot streak. At 65%+ confidence, there's a stronger case for something real having changed."
            },
            {
              q: "Why does SDI exclude rookies?",
              a: "Rookies have no career baseline to compare against. SDI is fundamentally a deviation-from-baseline metric — if there's no baseline, there's no deviation to measure. Rookies in their first 50+ career PA begin to accumulate a baseline that future seasons will be compared against, but their first season itself cannot generate an SDI value."
            },
            {
              q: "Does SDI account for a player's age or career trajectory?",
              a: "Not explicitly. The career baseline is a PA-weighted average across all historical seasons regardless of when they occurred. A 35-year-old being compared against their peak years at 27 will almost always show a negative SDI — not because they're underperforming expectations, but because their physical peak is behind them. SDI does not model age curves. Users should apply their own judgment about where a player is in their career arc."
            },
            {
              q: "What about players who changed teams or roles?",
              a: "SDI uses the player's full career history regardless of team or role changes. A pitcher who moved from starter to reliever will have a career baseline built on starter statistics — their relief ERA will look artificially great by comparison. Similarly, a player who moved to a better hitting environment will show a positive SDI partly due to park factors. SDI does not park-adjust beyond what OPS+ already captures."
            },
            {
              q: "Why is confidence low for everyone in April? Does that make SDI useless early in the season?",
              a: "Low confidence doesn't make SDI useless — it makes SDI honest. The whole point of the confidence score is to tell you how much sample you've seen. In April with 15 games played, you've seen maybe 30–40% of the expected sample for most metrics. SDI is telling you: 'here's the direction the signal is pointing, and here's how much of the evidence is in.' A player with a strong breakout direction at 30% confidence is still worth watching. By June at 60% confidence, you can act on it with much more certainty."
            },
            {
              q: "Can past lucky performance inflate a player's career baseline, making regression look inevitable?",
              a: "Yes — this is one of SDI's known limitations. If a player had two historically lucky seasons (high BABIP, runners stranded, etc.) that inflated their career xwOBA or OPS+, their baseline will be harder to match. SDI does not attempt to separate 'skill' from 'luck' in historical seasons. It takes the career record at face value. A player whose previous career peaks were driven by unsustainable BABIP may show a 'regression risk' signal even when they're performing at their true talent level."
            },
          ].map((item, i) => (
            <FAQItem key={i} q={item.q} a={item.a} />
          ))}
        </div>

        {/* Footer */}
        <div style={{
          borderTop:`1px solid ${T.border}`, paddingTop:24,
          display:'flex', justifyContent:'space-between', alignItems:'center',
        }}>
          <div style={{ fontSize:10, color:T.textLow, letterSpacing:'0.12em' }}>
            DIAMONDMINE · SDI METHODOLOGY · {new Date().getFullYear()}
          </div>
          <div style={{ fontSize:10, color:T.textLow }}>
            DATA: BASEBALL REFERENCE · MLB STATS API · BASEBALL SAVANT · SIS DRS
          </div>
        </div>

      </div>
    </div>
  )
}
