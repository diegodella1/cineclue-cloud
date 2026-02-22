export function calculateELO(currentELO, gamesPlayed, score, maxScore, movieDifficulties) {
  const K = gamesPlayed < 10 ? 40 : gamesPlayed < 30 ? 20 : 10

  const performance = score / maxScore
  const expected = 0.60

  const hardCount = movieDifficulties.filter(d => d === 'difícil').length
  const easyCount = movieDifficulties.filter(d => d === 'fácil').length
  const diffMultiplier = 1 + (hardCount * 0.15) - (easyCount * 0.05)

  const delta = Math.round(K * (performance - expected) * diffMultiplier)
  return {
    newELO: Math.max(100, currentELO + delta),
    delta,
  }
}
