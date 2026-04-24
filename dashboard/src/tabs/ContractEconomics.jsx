import React, { useState, useEffect, useCallback } from 'react'
import { T } from '../theme'

const API = import.meta.env.VITE_API_URL || 'https://minev2-production-84a2.up.railway.app'

const fmt = {
  dollars: v => v == null ? '—' : v >= 1e9 ? `$${(v/1e9).toFixed(2)}B`
                                : v >= 1e6 ? `$${(v/1e6).toFixed(1)}M`
                                : `$${Math.round(v).toLocaleString()}`,
  war:     v => v == null ? '—' : v.toFixed(1),
  surplus: v => v == null ? '—' : `${v >= 0 ? '+' : ''}$${(v/1e6).toFixed(1)}M`,
  pct:     v => v == null ? '—' : `${v.toFixed(1)}%`,
  mls:     v => v == null ? '—' : parseFloat(v).toFixed(3),
}

const SURPLUS_COLOR = v =>
  v == null ? '#6b7280' : v > 50e6 ? '#22c55e' : v > 0 ? '#86efac'
  : v > -30e6 ? '#fca5a5' : '#ef4444'

const TYPE_COLOR = { fa:'#3b82f6', extension:'#a855f7', international:'#f59e0b',
                     arb:'#6b7280', pre_arb:'#374151', trade:'#0ea5e9' }
const TYPE_LABEL = { fa:'FA', extension:'EXT', international:'INTL',
                     arb:'ARB', pre_arb:'PRE', trade:'TRD' }

function Badge({ type }) {
  return <span style={{ fontSize:9, fontFamily:'DM Mono, monospace', letterSpacing:'0.06em',
    padding:'1px 5px', borderRadius:3, background: TYPE_COLOR[type]||'#374151',
    color:'#fff', whiteSpace:'nowrap' }}>{TYPE_LABEL[type]||type?.toUpperCase()||'?'}</span>
}

function Deferred() {
  return <span style={{ color:'#f59e0b', fontSize:11, marginLeft:2 }}
    title="CBT-adjusted AAV per CBA Art. XXIII §E(6)">*</span>
}

const VIEWS = ['LEADERBOARD','MARKET RATE','BY TEAM','PAYROLL','EXTENSIONS']

function SubNav({ active, onChange }) {
  return (
    <div style={{ display:'flex', gap:4, marginBottom:20, flexWrap:'wrap' }}>
      {VIEWS.map(v => (
        <button key={v} onClick={() => onChange(v)} style={{
          padding:'5px 14px', borderRadius:4, border:'none', cursor:'pointer',
          fontFamily:'DM Mono, monospace', fontSize:11, letterSpacing:'0.08em',
          background: active===v ? '#3b82f6' : '#1e293b',
          color: active===v ? '#fff' : '#64748b', transition:'all 0.15s',
        }}>{v}</button>
      ))}
    </div>
  )
}

const TH = { padding:'8px 12px', textAlign:'left', fontSize:10,
             fontFamily:'DM Mono, monospace', letterSpacing:'0.08em',
             color:'#64748b', borderBottom:'1px solid #1e293b',
             whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }
const TD = { padding:'7px 12px', fontSize:12, borderBottom:'1px solid #0f172a', whiteSpace:'nowrap' }
const tableStyle = { width:'100%', borderCollapse:'collapse', background:'#0f172a',
                     borderRadius:8, overflow:'hidden', fontSize:12 }
const inp = { padding:'4px 10px', borderRadius:4, border:'1px solid #1e293b',
              background:'#0f172a', color:'#e2e8f0', fontSize:12 }

function SortTH({ label, field, sort, onSort }) {
  const active = sort.field === field
  return <th style={{ ...TH, color: active ? '#3b82f6' : '#64748b' }}
             onClick={() => onSort(field)}>
    {label}{active ? (sort.dir==='desc' ? ' ↓' : ' ↑') : ''}
  </th>
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────────
function LeaderboardView() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded,setExpanded]= useState(null)
  const [sort,    setSort]    = useState({ field:'realized_surplus', dir:'desc' })
  const [filters, setFilters] = useState({
    position_group:'', status:'', team:'', contract_type:'',
    era_start:'', era_end:'', min_years:'1', limit:'200'
  })

  const load = useCallback(() => {
    setLoading(true)
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k,v]) => v && p.set(k,v))
    p.set('sort_by', sort.field); p.set('order', sort.dir)
    fetch(`${API}/economics/leaderboard?${p}`)
      .then(r => r.json()).then(setData).finally(() => setLoading(false))
  }, [filters, sort])

  useEffect(() => { load() }, [load])

  const onSort = f => setSort(s => ({ field:f, dir:s.field===f&&s.dir==='desc'?'asc':'desc' }))
  const F = (k,v) => setFilters(f => ({...f,[k]:v}))
  const sel = { ...inp, cursor:'pointer' }

  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
        <select style={sel} value={filters.position_group} onChange={e=>F('position_group',e.target.value)}>
          {['','SP','RP','C','1B','2B','3B','SS','OF','DH'].map(o=><option key={o} value={o}>{o||'All positions'}</option>)}
        </select>
        <select style={sel} value={filters.status} onChange={e=>F('status',e.target.value)}>
          {['','complete','active','future'].map(o=><option key={o} value={o}>{o||'All statuses'}</option>)}
        </select>
        <select style={sel} value={filters.contract_type} onChange={e=>F('contract_type',e.target.value)}>
          {['','fa','extension','international'].map(o=><option key={o} value={o}>{o||'All types'}</option>)}
        </select>
        <input placeholder="Team" style={{...inp,width:80}} value={filters.team}
               onChange={e=>F('team',e.target.value.toUpperCase())} />
        <input placeholder="From" type="number" style={{...inp,width:90}} value={filters.era_start}
               onChange={e=>F('era_start',e.target.value)} />
        <input placeholder="To" type="number" style={{...inp,width:90}} value={filters.era_end}
               onChange={e=>F('era_end',e.target.value)} />
        <select style={sel} value={filters.min_years} onChange={e=>F('min_years',e.target.value)}>
          {[1,2,3,4,5].map(n=><option key={n} value={n}>≥{n}yr</option>)}
        </select>
        <select style={sel} value={filters.limit} onChange={e=>F('limit',e.target.value)}>
          {[50,100,200,500].map(n=><option key={n} value={n}>Top {n}</option>)}
        </select>
      </div>

      {loading && <div style={{color:'#64748b',fontFamily:'DM Mono',fontSize:12}}>Loading...</div>}

      <div style={{overflowX:'auto'}}>
        <table style={tableStyle}>
          <thead><tr>
            <th style={TH}>#</th><th style={TH}>PLAYER</th><th style={TH}>TYPE</th>
            {[['YR','signing_class'],['TEAM','new_team'],['POS','position_group'],
              ['YRS','years'],['AAV','aav'],['rWAR','total_realized_war'],
              ['SURPLUS','realized_surplus'],['WAR-$ ADJ','inflation_adj_surplus']].map(([l,f])=>(
              <SortTH key={f} label={l} field={f} sort={sort} onSort={onSort} />
            ))}
          </tr></thead>
          <tbody>
            {data.map((c,i) => {
              const open = expanded===i
              return (
                <React.Fragment key={i}>
                  <tr onClick={()=>setExpanded(open?null:i)}
                      style={{cursor:'pointer',background:open?'#1e293b':'transparent'}}>
                    <td style={{...TD,color:'#64748b',width:36}}>{i+1}</td>
                    <td style={{...TD,fontFamily:'Bebas Neue, sans-serif',fontSize:15,
                                letterSpacing:'0.04em',color:'#e2e8f0'}}>
                      {c.name}{c.has_deferral?<Deferred/>:null}
                    </td>
                    <td style={TD}><Badge type={c.contract_type}/></td>
                    <td style={{...TD,color:'#64748b'}}>{c.signing_class}</td>
                    <td style={{...TD,color:'#64748b'}}>{c.new_team}</td>
                    <td style={{...TD,color:'#64748b'}}>{c.position_group}</td>
                    <td style={{...TD,color:'#64748b'}}>{c.years}</td>
                    <td style={TD}>{fmt.dollars(c.aav)}</td>
                    <td style={TD}>{fmt.war(c.total_realized_war)}</td>
                    <td style={{...TD,color:SURPLUS_COLOR(c.realized_surplus),fontWeight:600}}>
                      {fmt.surplus(c.realized_surplus)}
                    </td>
                    <td style={{...TD,color:SURPLUS_COLOR(c.inflation_adj_surplus),fontWeight:500,fontSize:11}}>
                      {fmt.surplus(c.inflation_adj_surplus)}
                    </td>
                  </tr>
                  {open && (
                    <tr><td colSpan={10} style={{padding:'12px 24px',background:'#020617',
                                                  borderBottom:'1px solid #1e293b'}}>
                      <div style={{display:'flex',gap:28,flexWrap:'wrap',fontSize:12}}>
                        {[['Contract', c.years?`${c.years}yr / ${fmt.dollars(c.guarantee)}`:'—'],
                          ['AAV', fmt.dollars(c.aav)],
                          ...(c.has_deferral?[['CBT AAV*', fmt.dollars(c.cbt_aav)]]:[] ),
                          ['Age at signing', c.age_at_signing??'—'],
                          ['Term', c.term_start?`${c.term_start}–${c.term_end}`:'—'],
                          ['Status', c.contract_status??'—'],
                          ['rWAR', fmt.war(c.total_realized_war)],
                          ['$/WAR at signing', fmt.dollars(c.market_rate_at_signing)],
                          ['Market value', fmt.dollars(c.realized_market_value)],
                          ['Realized surplus', fmt.surplus(c.realized_surplus)],
                          ['WAR-$ adj surplus', fmt.surplus(c.inflation_adj_surplus)],
                          ['Expected surplus', fmt.surplus(c.expected_surplus)],
                          ...(c.pre_arb_years!=null?[
                            ['Pre-arb yrs', c.pre_arb_years??'—'],
                            ['Arb yrs', c.arb_years??'—'],
                            ['FA yrs', c.fa_years??'—'],
                          ]:[]),
                        ].map(([k,v])=>(
                          <div key={k}>
                            <div style={{color:'#64748b',fontSize:10,fontFamily:'DM Mono',marginBottom:2}}>{k}</div>
                            <div style={{color:'#e2e8f0'}}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {c.has_deferral && (
                        <div style={{marginTop:8,fontSize:10,color:'#64748b',fontFamily:'DM Mono',
                                     padding:'5px 8px',background:'#0f172a',borderRadius:4,
                                     borderLeft:'2px solid #f59e0b'}}>
                          * CBT-ADJUSTED AAV — deferred salary discounted to present value per CBA Art. XXIII §E(6)
                        </div>
                      )}
                    </td></tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:8,fontSize:11,color:'#64748b',fontFamily:'DM Mono'}}>
        {data.length} contracts · Click row to expand · Surplus = (rWAR × $/WAR at signing) − salary paid
      </div>
    </div>
  )
}

// ── MARKET RATE ───────────────────────────────────────────────────────────────
function MarketRateView() {
  const [data, setData] = useState([])
  useEffect(()=>{ fetch(`${API}/economics/market-rates`).then(r=>r.json()).then(setData) },[])
  const max = Math.max(...data.map(d=>d.dollars_per_war||0))
  return (
    <div>
      <div style={{marginBottom:16,color:'#64748b',fontSize:13}}>
        Implied $/WAR per FA signing class · pool-level ratio ·
        FA + international contracts only · completed contracts only
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={tableStyle}>
          <thead><tr>
            {['YEAR','$/WAR','SAMPLE','MATCH %','TREND'].map(h=><th key={h} style={TH}>{h}</th>)}
          </tr></thead>
          <tbody>
            {data.map((r,i)=>{
              const pct = max>0?(r.dollars_per_war/max)*100:0
              const prev = data[i-1]?.dollars_per_war
              const delta = prev?((r.dollars_per_war-prev)/prev*100):null
              return (
                <tr key={r.season}>
                  <td style={{...TD,fontFamily:'DM Mono',color:'#e2e8f0'}}>{r.season}</td>
                  <td style={{...TD,fontWeight:600,color:'#3b82f6'}}>{fmt.dollars(r.dollars_per_war)}</td>
                  <td style={{...TD,color:'#64748b'}}>{r.sample_size}</td>
                  <td style={{...TD,color:'#64748b'}}>{fmt.pct(r.match_rate)}</td>
                  <td style={{...TD,minWidth:160}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <div style={{height:8,width:`${pct}%`,maxWidth:120,background:'#3b82f6',
                                   borderRadius:2,minWidth:2}}/>
                      {delta!=null && <span style={{fontSize:10,fontFamily:'DM Mono',
                        color:delta>=0?'#22c55e':'#ef4444'}}>
                        {delta>=0?'+':''}{delta.toFixed(1)}%
                      </span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── BY TEAM ───────────────────────────────────────────────────────────────────
function ByTeamView() {
  const [team,setTeam]=useState('LAN')
  const [era0,setEra0]=useState('')
  const [era1,setEra1]=useState('')
  const [sort,setSort]=useState({field:'signing_class',dir:'desc'})
  const [data,setData]=useState(null)
  const [loading,setLoading]=useState(false)

  const load = useCallback(()=>{
    if(!team) return
    setLoading(true)
    const p = new URLSearchParams({team,sort_by:sort.field,order:sort.dir})
    if(era0) p.set('era_start',era0); if(era1) p.set('era_end',era1)
    fetch(`${API}/economics/team?${p}`).then(r=>r.json()).then(setData)
      .finally(()=>setLoading(false))
  },[team,era0,era1,sort])

  useEffect(()=>{load()},[load])
  const onSort = f => setSort(s=>({field:f,dir:s.field===f&&s.dir==='desc'?'asc':'desc'}))

  const TEAMS = ['LAN','NYA','BOS','CHN','SFN','ATL','HOU','NYN','PHI','SLN',
                 'TEX','TOR','CLE','MIN','MIL','ARI','SDN','SEA','ATH',
                 'MIA','CIN','PIT','COL','KCA','DET','BAL','TBA','CHA','ANA','WAS']

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <select style={{...inp,cursor:'pointer'}} value={team} onChange={e=>setTeam(e.target.value)}>
          {TEAMS.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="From" type="number" style={{...inp,width:90}} value={era0} onChange={e=>setEra0(e.target.value)}/>
        <input placeholder="To"   type="number" style={{...inp,width:90}} value={era1} onChange={e=>setEra1(e.target.value)}/>
      </div>

      {data && (
        <>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
            {[['CONTRACTS',data.total_contracts],['TOTAL SPENT',fmt.dollars(data.total_spent)],
              ['TOTAL SURPLUS',fmt.surplus(data.total_surplus)],['TOTAL rWAR',fmt.war(data.total_war)],
              ['WIN RATE',fmt.pct(data.win_rate)]].map(([l,v])=>(
              <div key={l} style={{padding:'12px 20px',background:'#0f172a',borderRadius:8,
                                   border:'1px solid #1e293b',minWidth:120}}>
                <div style={{fontSize:10,fontFamily:'DM Mono',color:'#64748b',marginBottom:4}}>{l}</div>
                <div style={{fontSize:20,fontFamily:'Bebas Neue, sans-serif',letterSpacing:'0.04em',
                             color:l==='TOTAL SURPLUS'?SURPLUS_COLOR(data.total_surplus):'#e2e8f0'}}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{overflowX:'auto'}}>
            <table style={tableStyle}>
              <thead><tr>
                {[['YR','signing_class'],['PLAYER',null],['TYPE',null],['POS','position_group'],
                  ['YRS','years'],['AAV','aav'],['GUARANTEE','guarantee'],
                  ['rWAR','total_realized_war'],['SURPLUS','realized_surplus']].map(([l,f])=>(
                  f?<SortTH key={f} label={l} field={f} sort={sort} onSort={onSort}/>
                   :<th key={l} style={TH}>{l}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.contracts.map((c,i)=>(
                  <tr key={i} style={{opacity:c.contract_status==='future'?0.6:1}}>
                    <td style={{...TD,fontFamily:'DM Mono',color:'#64748b'}}>{c.signing_class}</td>
                    <td style={{...TD,fontFamily:'Bebas Neue, sans-serif',fontSize:14,
                                letterSpacing:'0.04em',color:'#e2e8f0'}}>
                      {c.name}{c.has_deferral?<Deferred/>:null}
                    </td>
                    <td style={TD}><Badge type={c.contract_type}/></td>
                    <td style={{...TD,color:'#64748b'}}>{c.position_group}</td>
                    <td style={{...TD,color:'#64748b'}}>{c.years}</td>
                    <td style={TD}>{fmt.dollars(c.aav)}</td>
                    <td style={TD}>{fmt.dollars(c.guarantee)}</td>
                    <td style={TD}>{fmt.war(c.total_realized_war)}</td>
                    <td style={{...TD,color:SURPLUS_COLOR(c.realized_surplus),fontWeight:600}}>
                      {fmt.surplus(c.realized_surplus)}
                    </td>
                    <td style={{...TD,color:SURPLUS_COLOR(c.inflation_adj_surplus),fontWeight:500,fontSize:11}}>
                      {fmt.surplus(c.inflation_adj_surplus)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {loading && <div style={{color:'#64748b',fontFamily:'DM Mono',fontSize:12}}>Loading...</div>}
    </div>
  )
}

// ── PAYROLL ───────────────────────────────────────────────────────────────────
function PayrollView() {
  const [team,setTeam]=useState('LAN')
  const [season,setSeason]=useState(2024)
  const [data,setData]=useState([])
  const [loading,setLoading]=useState(false)

  const load = useCallback(()=>{
    setLoading(true)
    fetch(`${API}/economics/payroll?team=${team}&season=${season}`)
      .then(r=>r.json()).then(setData).finally(()=>setLoading(false))
  },[team,season])

  useEffect(()=>{load()},[load])

  const total = data.reduce((s,r)=>s+(r.salary||0),0)
  const years = Array.from({length:18},(_,i)=>2009+i)

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <input placeholder="Team" style={{...inp,width:80}} value={team}
               onChange={e=>setTeam(e.target.value.toUpperCase())}/>
        <select style={{...inp,cursor:'pointer'}} value={season} onChange={e=>setSeason(+e.target.value)}>
          {years.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        {data.length>0 && <span style={{fontFamily:'DM Mono',fontSize:12,color:'#64748b'}}>
          {data.length} players · {fmt.dollars(total)}
        </span>}
      </div>
      {loading && <div style={{color:'#64748b',fontFamily:'DM Mono',fontSize:12}}>Loading...</div>}
      <div style={{overflowX:'auto'}}>
        <table style={tableStyle}>
          <thead><tr>
            {['PLAYER','POS','TYPE','MLS','AGE','SALARY','CBT AAV','AGENT','CONTRACT'].map(h=>(
              <th key={h} style={TH}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.map((r,i)=>(
              <tr key={i}>
                <td style={{...TD,fontFamily:'Bebas Neue, sans-serif',fontSize:14,
                            letterSpacing:'0.04em',color:'#e2e8f0'}}>
                  {r.name}
                  {r.is_international?<span style={{marginLeft:4,fontSize:9,background:'#f59e0b',
                    color:'#000',padding:'1px 4px',borderRadius:3}}>INTL</span>:null}
                </td>
                <td style={{...TD,color:'#64748b'}}>{r.position}</td>
                <td style={TD}><Badge type={r.contract_type}/></td>
                <td style={{...TD,color:'#64748b',fontFamily:'DM Mono',fontSize:11}}>{fmt.mls(r.ml_service)}</td>
                <td style={{...TD,color:'#64748b'}}>{r.age?Math.floor(r.age):'—'}</td>
                <td style={{...TD,fontWeight:r.salary>15e6?600:400}}>{fmt.dollars(r.salary)}</td>
                <td style={{...TD,color:'#64748b'}}>{r.cbt_aav?fmt.dollars(r.cbt_aav):'—'}</td>
                <td style={{...TD,color:'#64748b',fontSize:11}}>{r.agent||'—'}</td>
                <td style={{...TD,color:'#64748b',fontSize:11}}>{r.contract_notes||'—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── EXTENSIONS ────────────────────────────────────────────────────────────────
function ExtensionsView() {
  const [data,setData]=useState([])
  const [loading,setLoading]=useState(false)
  const [sort,setSort]=useState({field:'signing_class',dir:'desc'})
  const [filters,setFilters]=useState({team:'',era_start:'',era_end:'',position_group:''})

  const load = useCallback(()=>{
    setLoading(true)
    const p = new URLSearchParams({sort_by:sort.field,order:sort.dir})
    Object.entries(filters).forEach(([k,v])=>v&&p.set(k,v))
    fetch(`${API}/economics/extensions?${p}`).then(r=>r.json()).then(setData)
      .finally(()=>setLoading(false))
  },[filters,sort])

  useEffect(()=>{load()},[load])
  const onSort = f => setSort(s=>({field:f,dir:s.field===f&&s.dir==='desc'?'asc':'desc'}))
  const F = (k,v) => setFilters(f=>({...f,[k]:v}))

  return (
    <div>
      <div style={{marginBottom:12,color:'#64748b',fontSize:13}}>
        Extensions and international signings — service-time bucket breakdown
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <input placeholder="Team" style={{...inp,width:80}} value={filters.team}
               onChange={e=>F('team',e.target.value.toUpperCase())}/>
        <input placeholder="From" type="number" style={{...inp,width:90}} value={filters.era_start}
               onChange={e=>F('era_start',e.target.value)}/>
        <input placeholder="To" type="number" style={{...inp,width:90}} value={filters.era_end}
               onChange={e=>F('era_end',e.target.value)}/>
        <select style={{...inp,cursor:'pointer'}} value={filters.position_group}
                onChange={e=>F('position_group',e.target.value)}>
          {['','SP','RP','C','1B','2B','3B','SS','OF','DH'].map(p=>(
            <option key={p} value={p}>{p||'All positions'}</option>
          ))}
        </select>
      </div>
      {loading && <div style={{color:'#64748b',fontFamily:'DM Mono',fontSize:12}}>Loading...</div>}
      <div style={{overflowX:'auto'}}>
        <table style={tableStyle}>
          <thead><tr>
            {[['SEASONS',null],['PLAYER',null],['TYPE',null],['TEAM',null],
              ['POS',null],['MLS','ml_service'],['YRS','years'],['GUARANTEE','guarantee'],
              ['SALARY','salary'],['PRE',null],['ARB',null],
              ['FA',null],['%FA',null]].map(([l,f])=>(
              f?<SortTH key={f} label={l} field={f} sort={sort} onSort={onSort}/>
               :<th key={l} style={TH}>{l}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.map((c,i)=>(
              <tr key={i}>
                <td style={{...TD,fontFamily:'DM Mono',color:'#64748b'}}>{c.first_season}–{c.last_season}</td>
                <td style={{...TD,fontFamily:'Bebas Neue, sans-serif',fontSize:14,
                            letterSpacing:'0.04em',color:'#e2e8f0'}}>{c.name}</td>
                <td style={TD}><Badge type={c.contract_type}/></td>
                <td style={{...TD,color:'#64748b'}}>{c.team}</td>
                <td style={{...TD,color:'#64748b'}}>{c.position_group}</td>
                <td style={{...TD,color:'#64748b',fontFamily:'DM Mono',fontSize:11}}>
                  {fmt.mls(c.ml_service)}
                </td>
                <td style={{...TD,color:'#64748b'}}>{c.years||'—'}</td>
                <td style={TD}>{fmt.dollars(c.guarantee)}</td>
                <td style={TD}>{c.salary ? fmt.dollars(c.salary) : fmt.dollars(c.aav)}</td>
                <td style={{...TD,color:'#22c55e',fontFamily:'DM Mono'}}>{c.pre_arb_years??'—'}</td>
                <td style={{...TD,color:'#f59e0b',fontFamily:'DM Mono'}}>{c.arb_years??'—'}</td>
                <td style={{...TD,color:'#3b82f6',fontFamily:'DM Mono'}}>{c.fa_years??'—'}</td>
                <td style={{...TD}}>
                  {c.pct_fa_years!=null?(
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:50,height:6,background:'#1e293b',borderRadius:3}}>
                        <div style={{width:`${c.pct_fa_years}%`,height:'100%',borderRadius:3,
                          background:c.pct_fa_years>66?'#3b82f6':c.pct_fa_years>33?'#f59e0b':'#22c55e'}}/>
                      </div>
                      <span style={{fontSize:10,fontFamily:'DM Mono',color:'#64748b'}}>
                        {c.pct_fa_years.toFixed(0)}%
                      </span>
                    </div>
                  ):'—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:10,fontSize:11,color:'#64748b',fontFamily:'DM Mono',lineHeight:1.8}}>
        PRE = pre-arb years · ARB = arbitration years · FA = free agent years ·
        %FA bar: green=club control, orange=mixed, blue=FA years
      </div>
    </div>
  )
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function ContractEconomics() {
  const [view, setView] = useState('LEADERBOARD')
  return (
    <div style={{padding:'24px 32px',maxWidth:1400}}>
      <div style={{marginBottom:20}}>
        <div style={{fontFamily:'Bebas Neue, sans-serif',fontSize:28,
                     letterSpacing:'0.06em',color:'#e2e8f0',marginBottom:4}}>
          CONTRACT ECONOMICS
        </div>
        <div style={{fontSize:12,color:'#64748b',fontFamily:'DM Mono'}}>
          FA surplus · market rates · extensions · opening day payrolls · 1991–2026
        </div>
      </div>
      <SubNav active={view} onChange={setView}/>
      {view==='LEADERBOARD'  && <LeaderboardView/>}
      {view==='MARKET RATE'  && <MarketRateView/>}
      {view==='BY TEAM'      && <ByTeamView/>}
      {view==='PAYROLL'      && <PayrollView/>}
      {view==='EXTENSIONS'   && <ExtensionsView/>}
    </div>
  )
}
