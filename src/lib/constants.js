export const ELO_RANKS = [
  { min: 0, max: 799, title: 'Espectador', icon: '🌱' },
  { min: 800, max: 999, title: 'Aficionado', icon: '🎟' },
  { min: 1000, max: 1199, title: 'Cinéfilo', icon: '🎬' },
  { min: 1200, max: 1399, title: 'Crítico', icon: '🏆' },
  { min: 1400, max: 1599, title: 'Curador', icon: '🎭' },
  { min: 1600, max: Infinity, title: 'Maestro del Cine', icon: '⭐' },
]

export function getEloRank(elo) {
  return ELO_RANKS.find(r => elo >= r.min && elo <= r.max) || ELO_RANKS[0]
}

export const SCORE_BADGES = [
  { min: 20, label: 'Cinéfilo de élite', icon: '🏆' },
  { min: 15, label: 'Gran conocedor', icon: '🎬' },
  { min: 10, label: 'Buen ojo', icon: '👁' },
  { min: 5, label: 'Espectador casual', icon: '🍿' },
  { min: 0, label: 'Recién arrancás', icon: '🎟' },
]

export function getScoreBadge(score) {
  return SCORE_BADGES.find(b => score >= b.min) || SCORE_BADGES[SCORE_BADGES.length - 1]
}

export const POINTS_BY_CLUE = [5, 4, 3, 2, 1]

export const CLUE_LABELS = [
  'Emojis',
  'Dato oscuro',
  'Dato revelador',
  'Frase icónica',
  'Sinopsis',
]

// Party Mode constants
export const PARTY_CLUE_TIMERS = [30, 25, 20, 15, 10] // seconds per clue
export const PARTY_BASE_POINTS = [500, 400, 300, 200, 100] // base points per clue index
export const PARTY_MAX_SPEED_BONUS = 500
export const PARTY_CATEGORIES = [
  { value: null, label: 'Todas' },
  { value: 'Drama', label: 'Drama' },
  { value: 'Comedia', label: 'Comedia' },
  { value: 'Acción', label: 'Acción' },
  { value: 'Terror', label: 'Terror' },
  { value: 'Ciencia ficción', label: 'Ciencia ficción' },
  { value: 'Clásicos', label: 'Clásicos' },
  { value: 'Animación', label: 'Animación' },
]

export const PARTY_AVATAR_EMOJIS = [
  '🎬', '🍿', '🎥', '🎞', '📽', '🎭', '🌟', '⭐',
  '🏆', '🎪', '🦊', '🐱', '🐶', '🦁', '🐸', '🦉',
  '🤖', '👽', '🧛', '🧟', '🦸', '🧙', '🥷', '🤠',
]
