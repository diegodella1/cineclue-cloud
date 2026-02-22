import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { check } from '../lib/normalize'
import { POINTS_BY_CLUE } from '../lib/constants'

export function useDuel() {
  const [movies, setMovies] = useState([])
  const [currentRound, setCurrentRound] = useState(0)
  const [currentClue, setCurrentClue] = useState(0)
  const [roundResults, setRoundResults] = useState([])
  const [totalScore, setTotalScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [shaking, setShaking] = useState(false)
  const [duelInfo, setDuelInfo] = useState(null) // filled for opponent mode
  const [submitResult, setSubmitResult] = useState(null) // result from create/submit RPC

  const currentMovie = movies[currentRound]

  // Load random movies for challenger
  const startAsChallenger = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('cc_select_solo_movies')
    if (error) {
      console.error('Error loading movies:', error)
      setLoading(false)
      return
    }
    const shuffled = data.sort(() => Math.random() - 0.5)
    setMovies(shuffled)
    setCurrentRound(0)
    setCurrentClue(0)
    setRoundResults([])
    setTotalScore(0)
    setGameOver(false)
    setLoading(false)
  }, [])

  // Load duel movies for opponent
  const startAsOpponent = useCallback(async (duelId, userId) => {
    setLoading(true)
    const { data, error } = await supabase.rpc('cc_get_duel', {
      p_duel_id: duelId,
      p_user_id: userId,
    })
    if (error) {
      console.error('Error loading duel:', error)
      setLoading(false)
      return { error: error.message }
    }
    if (data.status !== 'waiting') {
      setLoading(false)
      return { error: 'already_played', duel: data }
    }
    setDuelInfo(data)
    setMovies(data.movies)
    setCurrentRound(0)
    setCurrentClue(0)
    setRoundResults([])
    setTotalScore(0)
    setGameOver(false)
    setLoading(false)
    return { ok: true }
  }, [])

  const revealNextClue = useCallback(() => {
    if (currentClue < 4) setCurrentClue(c => c + 1)
  }, [currentClue])

  const handleGuess = useCallback((input) => {
    if (!currentMovie) return false
    const isCorrect = check(input, currentMovie)
    if (isCorrect) {
      const points = POINTS_BY_CLUE[currentClue]
      const result = {
        movie_id: currentMovie.id,
        title: currentMovie.title,
        diff: currentMovie.diff,
        lb: currentMovie.lb,
        guessed: true,
        clue_revealed: currentClue,
        points_earned: points,
      }
      setRoundResults(r => [...r, result])
      setTotalScore(s => s + points)
      setLastResult(result)
      setShowResult(true)
      return true
    }
    setShaking(true)
    setTimeout(() => setShaking(false), 400)
    return false
  }, [currentMovie, currentClue])

  const handleSkip = useCallback(() => {
    const result = {
      movie_id: currentMovie?.id,
      title: currentMovie?.title,
      diff: currentMovie?.diff,
      lb: currentMovie?.lb,
      guessed: false,
      clue_revealed: currentClue,
      points_earned: 0,
    }
    setRoundResults(r => [...r, result])
    setLastResult(result)
    setShowResult(true)
  }, [currentMovie, currentClue])

  const handleNext = useCallback(() => {
    setShowResult(false)
    setLastResult(null)
    if (currentRound + 1 >= movies.length) {
      setGameOver(true)
    } else {
      setCurrentRound(r => r + 1)
      setCurrentClue(0)
    }
  }, [currentRound, movies.length])

  // Submit as challenger — creates the duel
  const finishAsChallenger = useCallback(async (userId, opponentUsername) => {
    const results = roundResults.length > 0 ? roundResults : []
    const score = totalScore
    const payload = results.map(r => ({
      movie_id: r.movie_id,
      guessed: r.guessed,
      clue_revealed: r.clue_revealed,
      points_earned: r.points_earned,
    }))
    const { data, error } = await supabase.rpc('cc_create_duel', {
      p_challenger_id: userId,
      p_opponent_username: opponentUsername,
      p_challenger_score: score,
      p_challenger_results: payload,
    })
    if (error) {
      console.error('Error creating duel:', error)
      return { error: error.message }
    }
    setSubmitResult(data)
    return data
  }, [roundResults, totalScore])

  // Submit as opponent — responds to the duel
  const finishAsOpponent = useCallback(async (duelId, userId) => {
    const results = roundResults.length > 0 ? roundResults : []
    const score = totalScore
    const payload = results.map(r => ({
      movie_id: r.movie_id,
      guessed: r.guessed,
      clue_revealed: r.clue_revealed,
      points_earned: r.points_earned,
    }))
    const { data, error } = await supabase.rpc('cc_submit_duel_round', {
      p_duel_id: duelId,
      p_user_id: userId,
      p_score: score,
      p_results: payload,
    })
    if (error) {
      console.error('Error submitting duel round:', error)
      return { error: error.message }
    }
    setSubmitResult(data)
    return data
  }, [roundResults, totalScore])

  return {
    movies, currentRound, currentClue, currentMovie,
    roundResults, totalScore, gameOver, loading,
    showResult, lastResult, shaking,
    duelInfo, submitResult,
    startAsChallenger, startAsOpponent,
    revealNextClue, handleGuess, handleSkip, handleNext,
    finishAsChallenger, finishAsOpponent,
  }
}
