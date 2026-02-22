import { supabase } from './supabase'

let _levels = null
let _loading = null

export async function loadLevels() {
  if (_levels) return _levels
  if (_loading) return _loading

  _loading = supabase.rpc('cc_get_levels').then(({ data }) => {
    _levels = Array.isArray(data) ? data : []
    _loading = null
    return _levels
  }).catch(() => {
    _loading = null
    return []
  })

  return _loading
}

export function getLevels() {
  return _levels || []
}

export function invalidateLevels() {
  _levels = null
}

export function getLevelInfo(xp) {
  const levels = getLevels()
  if (!levels.length) {
    return { level: 1, name: 'Extra', icon: '🎬', current: 0, needed: 100, percent: 0, isMax: false }
  }

  let current = levels[0]
  for (const l of levels) {
    if (l.min_xp <= xp) current = l
    else break
  }

  const idx = levels.indexOf(current)
  const next = idx < levels.length - 1 ? levels[idx + 1] : null

  return {
    level: current.level,
    name: current.name,
    icon: current.icon,
    current: xp - current.min_xp,
    needed: next ? next.min_xp - current.min_xp : null,
    percent: next
      ? Math.round(((xp - current.min_xp) / (next.min_xp - current.min_xp)) * 100)
      : 100,
    isMax: !next,
  }
}

export function xpProgress(xp) {
  return getLevelInfo(xp)
}

// Legacy compat
export function levelFromXP(xp) {
  return getLevelInfo(xp).level
}
