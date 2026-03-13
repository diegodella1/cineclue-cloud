import { useState, useCallback } from 'react'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { check } from '../lib/normalize'
import { POINTS_BY_CLUE } from '../lib/constants'
import { track } from '../lib/analytics'

export function useGame() {
  const [showResult, setShowResult] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [shaking, setShaking] = useState(false)

  const movies = useGameStore(s => s.movies)
  const currentRound = useGameStore(s => s.currentRound)
  const currentClue = useGameStore(s => s.currentClue)
  const roundResults = useGameStore(s => s.roundResults)
  const totalScore = useGameStore(s => s.totalScore)
  const gameOver = useGameStore(s => s.gameOver)
  const loading = useGameStore(s => s.loading)
  const loadSoloMovies = useGameStore(s => s.loadSoloMovies)
  const revealNextClue = useGameStore(s => s.revealNextClue)
  const submitGuess = useGameStore(s => s.submitGuess)
  const skipMovie = useGameStore(s => s.skipMovie)
  const nextRound = useGameStore(s => s.nextRound)
  const completeGame = useGameStore(s => s.completeGame)
  const reset = useGameStore(s => s.reset)

  const profile = useAuthStore(s => s.profile)
  const fetchProfile = useAuthStore(s => s.fetchProfile)
  const user = useAuthStore(s => s.user)
  const currentMovie = movies[currentRound]

  const handleGuess = useCallback((input) => {
    if (!currentMovie) return
    const isCorrect = check(input, currentMovie)
    if (isCorrect) {
      const points = POINTS_BY_CLUE[currentClue]
      const result = submitGuess(points, true)
      setLastResult(result)
      setShowResult(true)
    } else {
      setShaking(true)
      setTimeout(() => setShaking(false), 400)
    }
    return isCorrect
  }, [currentMovie, currentClue, submitGuess])

  const handleSkip = useCallback(() => {
    const result = skipMovie()
    setLastResult(result)
    setShowResult(true)
  }, [skipMovie])

  const handleNext = useCallback(() => {
    setShowResult(false)
    setLastResult(null)
    nextRound()
  }, [nextRound])

  const handleFinish = useCallback(async () => {
    if (user) {
      const result = await completeGame(user.id)
      track('game_completed', { mode: 'solo', score: totalScore, rounds: movies.length })
      await fetchProfile(user.id)
      return result
    }
  }, [user, completeGame, fetchProfile, totalScore, movies.length])

  return {
    movies, currentRound, currentClue, currentMovie,
    roundResults, totalScore, gameOver, loading,
    showResult, lastResult, shaking,
    loadSoloMovies, revealNextClue,
    handleGuess, handleSkip, handleNext, handleFinish, reset,
  }
}
