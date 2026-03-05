import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useGameStore = create((set, get) => ({
  movies: [],
  currentRound: 0,
  currentClue: 0,
  roundResults: [],
  totalScore: 0,
  gameOver: false,
  loading: false,

  loadSoloMovies: async () => {
    set({ loading: true })
    const { data, error } = await supabase.rpc('cc_select_solo_movies')
    if (error) {
      console.error('Error loading movies:', error)
      set({ loading: false })
      return
    }
    // Preserve DB order: fácil → medio → difícil (progressive difficulty)
    set({
      movies: data,
      currentRound: 0,
      currentClue: 0,
      roundResults: [],
      totalScore: 0,
      gameOver: false,
      loading: false,
    })
  },

  revealNextClue: () => {
    const { currentClue } = get()
    if (currentClue < 4) {
      set({ currentClue: currentClue + 1 })
    }
  },

  submitGuess: (points, guessed) => {
    const { movies, currentRound, currentClue, roundResults, totalScore } = get()
    const movie = movies[currentRound]
    const result = {
      movie_id: movie.id,
      title: movie.title,
      diff: movie.diff,
      lb: movie.lb,
      guessed,
      clue_revealed: currentClue,
      points_earned: points,
    }
    const newResults = [...roundResults, result]
    const newScore = totalScore + points
    set({
      roundResults: newResults,
      totalScore: newScore,
    })
    return result
  },

  skipMovie: () => {
    return get().submitGuess(0, false)
  },

  nextRound: () => {
    const { currentRound, movies } = get()
    if (currentRound + 1 >= movies.length) {
      set({ gameOver: true })
    } else {
      set({
        currentRound: currentRound + 1,
        currentClue: 0,
      })
    }
  },

  completeGame: async (userId) => {
    const { totalScore, movies, roundResults } = get()
    const maxPossible = movies.length * 5
    const moviesPlayed = roundResults.map(r => ({
      movie_id: r.movie_id,
      points_earned: r.points_earned,
      guessed: r.guessed,
      clue_revealed: r.clue_revealed,
    }))
    const { data, error } = await supabase.rpc('cc_complete_game', {
      p_user_id: userId,
      p_mode: 'solo',
      p_total_score: totalScore,
      p_max_possible: maxPossible,
      p_movies_played: moviesPlayed,
    })
    if (error) {
      console.error('Error completing game:', error)
      return { error: error.message }
    }
    return data
  },

  reset: () => {
    set({
      movies: [],
      currentRound: 0,
      currentClue: 0,
      roundResults: [],
      totalScore: 0,
      gameOver: false,
      loading: false,
    })
  },
}))
