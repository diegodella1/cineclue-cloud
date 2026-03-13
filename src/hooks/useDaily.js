import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { check } from '../lib/normalize'
import { POINTS_BY_CLUE } from '../lib/constants'
import { track } from '../lib/analytics'

export function useDaily() {
  const [movie, setMovie] = useState(null)
  const [currentClue, setCurrentClue] = useState(0)
  const [alreadyPlayed, setAlreadyPlayed] = useState(false)
  const [previousGame, setPreviousGame] = useState(null)
  const [result, setResult] = useState(null) // { guessed, points_earned, clue_revealed }
  const [gameResult, setGameResult] = useState(null) // cc_complete_game response (ELO, XP)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [shaking, setShaking] = useState(false)

  const user = useAuthStore(s => s.user)
  const fetchProfile = useAuthStore(s => s.fetchProfile)

  const loadDaily = useCallback(async () => {
    setLoading(true)
    const [dailyRes, statsRes] = await Promise.all([
      supabase.rpc('cc_get_today_daily', { p_user_id: user?.id || null }),
      supabase.rpc('cc_get_daily_stats'),
    ])
    const { data, error } = dailyRes
    if (error || !data?.available) {
      setMovie(null)
      setLoading(false)
      return
    }
    setMovie(data.movie)
    setAlreadyPlayed(data.already_played)
    if (data.already_played && data.user_game) {
      setPreviousGame(data.user_game)
    }
    setStats(statsRes.data)
    setLoading(false)
  }, [user])

  const handleGuess = useCallback((input) => {
    if (!movie) return false
    const isCorrect = check(input, movie)
    if (isCorrect) {
      const points = POINTS_BY_CLUE[currentClue]
      const r = { guessed: true, points_earned: points, clue_revealed: currentClue }
      setResult(r)
      completeDaily(r)
      return true
    }
    setShaking(true)
    setTimeout(() => setShaking(false), 400)
    return false
  }, [movie, currentClue])

  const handleSkip = useCallback(() => {
    const r = { guessed: false, points_earned: 0, clue_revealed: currentClue }
    setResult(r)
    completeDaily(r)
  }, [movie, currentClue])

  const revealNextClue = useCallback(() => {
    if (currentClue < 4) setCurrentClue(c => c + 1)
  }, [currentClue])

  const completeDaily = async (r) => {
    if (!user || !movie) return
    const moviesPlayed = [{
      movie_id: movie.id,
      points_earned: r.points_earned,
      guessed: r.guessed,
      clue_revealed: r.clue_revealed,
    }]
    const { data, error } = await supabase.rpc('cc_complete_game', {
      p_user_id: user.id,
      p_mode: 'daily',
      p_total_score: r.points_earned,
      p_max_possible: 5,
      p_movies_played: moviesPlayed,
    })
    if (error) {
      console.error('Error completing daily:', error)
      const { useUiStore } = await import('../stores/uiStore')
      useUiStore.getState().showToast('Error al guardar partida', 'error')
      return
    }
    setGameResult(data)
    track('game_completed', { mode: 'daily', score: r.points_earned, guessed: r.guessed })
    await fetchProfile(user.id)
    const { data: statsData } = await supabase.rpc('cc_get_daily_stats')
    setStats(statsData)
  }

  return {
    movie, currentClue, alreadyPlayed, previousGame,
    result, gameResult, stats, loading, shaking,
    loadDaily, handleGuess, handleSkip, revealNextClue,
  }
}
