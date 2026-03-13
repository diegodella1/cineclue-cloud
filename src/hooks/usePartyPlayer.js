import { useState, useCallback, useRef } from 'react'
import { usePartyStore } from '../stores/partyStore'

export function usePartyPlayer() {
  const room = usePartyStore(s => s.room)
  const playerId = usePartyStore(s => s.playerId)
  const answeredThisRound = usePartyStore(s => s.answeredThisRound)
  const lastAnswerResult = usePartyStore(s => s.lastAnswerResult)
  const submitAnswer = usePartyStore(s => s.submitAnswer)
  const broadcast = usePartyStore(s => s.broadcast)
  const rankings = usePartyStore(s => s.rankings)

  const [submitting, setSubmitting] = useState(false)
  const [shaking, setShaking] = useState(false)

  const handleSubmitAnswer = useCallback(async (answer, clueIndex = null) => {
    if (!room || !playerId || answeredThisRound || submitting) return null

    // Calculate response time from when clue was revealed
    const responseTimeMs = room.clue_started_at
      ? Math.max(0, Date.now() - room.clue_started_at)
      : 0

    setSubmitting(true)
    try {
      const result = await submitAnswer(answer, responseTimeMs, clueIndex)
      if (result?.correct) {
        broadcast('player_answered', {
          player_id: playerId,
          correct: true,
          points: result.points,
          first_blood: result.first_blood || false,
        })
      } else {
        // Shake for wrong answer
        setShaking(true)
        setTimeout(() => setShaking(false), 400)
      }
      return result
    } finally {
      setSubmitting(false)
    }
  }, [room, playerId, answeredThisRound, submitting, submitAnswer, broadcast])

  // Get player's current position in rankings
  const myPosition = rankings.findIndex(r => r.player_id === playerId) + 1

  return {
    handleSubmitAnswer,
    submitting,
    shaking,
    answeredThisRound,
    lastAnswerResult,
    myPosition,
    playerId,
  }
}
