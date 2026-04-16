// All API calls go through here — single source of truth
const PROD_URL = 'https://minev2-production-84a2.up.railway.app'
const IS_LOCAL = typeof window !== 'undefined' && window.location.hostname === 'localhost'

const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/$/, '')
  : IS_LOCAL ? '/api' : PROD_URL

async function get(path, params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined))
  )
  const url = `${BASE}${path}${qs.toString() ? '?' + qs : ''}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${res.status}: ${url}`)
  return res.json()
}

export const api = {
  health: () => get('/health'),
  searchPlayers:  q      => get('/player/search', { q }),
  careerBatting:  name   => get('/player/career/batting', { name }),
  careerPitching: name   => get('/player/career/pitching', { name }),
  leaderBatting:  (season, stat = 'bwar', min_pa = 100, limit = 50) =>
    get('/leaderboard/batting', { season, stat, min_pa, limit }),
  leaderPitching: (season, stat = 'bwar', min_ip = 20, role = null, limit = 50) =>
    get('/leaderboard/pitching', { season, stat, min_ip, role, limit }),
  drsLeaderboard: (season, pos = null, limit = 50) =>
    get('/drs/leaderboard', { season, pos, limit }),
  drsPlayer:      name => get('/drs/player', { name }),
  compare: (names, season = null, type = 'batting') =>
    get('/compare', { names: names.join(','), season, type }),
  fantasySettings:    league => get('/fantasy/settings', { league }),
  fantasyLeaderboard: (season, type = 'batter', limit = 50) =>
    get('/fantasy/leaderboard', { season, type, limit }),
  scoreboard:  date          => get('/scoreboard', date ? { date } : {}),
  standings:   year          => get('/standings', { season: year }),
  statLeaders: (stat, season, limit = 10) =>
    get('/stats/leaders', { stat, season, limit }),
  headshotUrl: ({ mlbam_id, name, path, filename } = {}) => {
    const params = new URLSearchParams()
    if (mlbam_id)  params.set('mlbam_id', mlbam_id)
    else if (filename) params.set('filename', filename)
    else if (name) params.set('name', name)
    else if (path) params.set('path', path)
    return `${BASE}/headshot?${params}`
  },
  seasons: () => get('/seasons'),
  hofLookup: name => get('/hof', { name }),
}
