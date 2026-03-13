import { useEffect, useRef, useCallback } from 'react'
import { usePartyStore } from '../stores/partyStore'
import { PARTY_CLUE_TIMERS } from '../lib/constants'

const AUTO_ADVANCE_DELAY = 4000 // ms

export function usePartyHost() {
  const room = usePartyStore(s => s.room)
  const isHost = usePartyStore(s => s.isHost)
  const players = usePartyStore(s => s.players)
  const answeredPlayerIds = usePartyStore(s => s.answeredPlayerIds)
  const startGame = usePartyStore(s => s.startGame)
  const advanceClue = usePartyStore(s => s.advanceClue)
  const nextRound = usePartyStore(s => s.nextRound)
  const fetchRankings = usePartyStore(s => s.fetchRankings)
  const fetchPlayers = usePartyStore(s => s.fetchPlayers)
  const broadcast = usePartyStore(s => s.broadcast)

  const timerRef = useRef(null)
  const remainingRef = useRef(0)
  const autoAdvanceRef = useRef(null)
  const autoAdvanceCountdownRef = useRef(0)
  const roundEndTriggeredRef = useRef(false)
  const nextRoundInProgressRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current)
      autoAdvanceRef.current = null
    }
    autoAdvanceCountdownRef.current = 0
  }, [])

  // Start clue timer
  const startClueTimer = useCallback((clueIndex) => {
    clearTimer()
    const duration = PARTY_CLUE_TIMERS[clueIndex] * 1000
    remainingRef.current = duration
    const started = Date.now()

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - started
      remainingRef.current = Math.max(0, duration - elapsed)

      if (remainingRef.current <= 0) {
        clearTimer()
        // Timer expired — advance clue or end round
        handleTimerExpiry()
      }
    }, 100)
  }, [clearTimer])

  const handleTimerExpiry = useCallback(async () => {
    if (!room || room.status !== 'playing') return

    if (room.current_clue < 4) {
      // Advance to next clue
      const result = await advanceClue()
      if (result?.action === 'clue_advanced') {
        broadcast('clue_revealed', {
          current_clue: result.current_clue,
          current_round: result.current_round,
          clue_started_at: Date.now(),
        })
        startClueTimer(result.current_clue)
      } else {
        // Round exhausted
        await handleRoundEnd()
      }
    } else {
      // Last clue exhausted — end round
      await handleRoundEnd()
    }
  }, [room, advanceClue, broadcast, startClueTimer])

  const handleRoundEnd = useCallback(async () => {
    if (roundEndTriggeredRef.current) return
    roundEndTriggeredRef.current = true
    clearTimer()
    const rankings = await fetchRankings()
    const movie = room?.movies?.[room.current_round]
    broadcast('round_end', {
      round: room.current_round,
      title: movie?.title,
      diff: movie?.diff,
      rankings,
    })

    // Auto-advance: start countdown to next round
    if (room?.auto_advance) {
      clearAutoAdvance()
      autoAdvanceCountdownRef.current = AUTO_ADVANCE_DELAY
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceCountdownRef.current = 0
        handleNextRound()
      }, AUTO_ADVANCE_DELAY)
    }
  }, [clearTimer, fetchRankings, broadcast, room, clearAutoAdvance])

  // Host starts the game — strip title/alt from broadcast for security
  const handleStartGame = useCallback(async () => {
    const result = await startGame()
    if (result) {
      const safeMovies = result.movies.map(({ title, alt, ...rest }) => rest)
      broadcast('game_started', { movies: safeMovies, clue_started_at: Date.now() })
      startClueTimer(0)
    }
    return result
  }, [startGame, broadcast, startClueTimer])

  // Host advances to next round
  const handleNextRound = useCallback(async () => {
    if (nextRoundInProgressRef.current) return
    nextRoundInProgressRef.current = true
    clearAutoAdvance()
    const result = await nextRound()
    if (result?.action === 'next_round') {
      broadcast('next_round', {
        current_round: result.current_round,
        current_clue: 0,
        clue_started_at: Date.now(),
      })
      startClueTimer(0)
    } else if (result?.action === 'game_finished') {
      const rankings = await fetchRankings()
      broadcast('game_finished', { rankings })
    }
    return result
  }, [nextRound, broadcast, startClueTimer, fetchRankings, clearAutoAdvance])

  // Skip auto-advance countdown (manual "Saltear")
  const skipAutoAdvance = useCallback(() => {
    clearAutoAdvance()
    handleNextRound()
  }, [clearAutoAdvance, handleNextRound])

  // Reset flags on new round
  useEffect(() => {
    roundEndTriggeredRef.current = false
    nextRoundInProgressRef.current = false
  }, [room?.current_round])

  useEffect(() => {
    if (!isHost || !room || room.status !== 'playing') return
    if (roundEndTriggeredRef.current) return
    if (players.length > 0 && answeredPlayerIds.length >= players.length) {
      handleRoundEnd()
    }
  }, [isHost, room?.status, players.length, answeredPlayerIds.length, handleRoundEnd])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer()
      clearAutoAdvance()
    }
  }, [clearTimer, clearAutoAdvance])

  // Poll players while waiting (broadcast may not arrive if player channel isn't ready yet)
  useEffect(() => {
    if (!isHost || !room) return
    fetchPlayers()
    if (room.status === 'waiting') {
      const interval = setInterval(() => fetchPlayers(), 3000)
      return () => clearInterval(interval)
    }
  }, [isHost, room?.id, room?.status])

  return {
    handleStartGame,
    handleNextRound,
    handleTimerExpiry,
    handleRoundEnd,
    skipAutoAdvance,
    startClueTimer,
    clearTimer,
    clearAutoAdvance,
    remainingRef,
    autoAdvanceCountdownRef,
    nextRoundInProgressRef,
  }
}
