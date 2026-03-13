import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePartyStore } from '../stores/partyStore'
import { usePartyPlayer } from '../hooks/usePartyPlayer'
import { PARTY_CLUE_TIMERS, CLUE_LABELS } from '../lib/constants'
import PartyTimerBar from '../components/party/PartyTimerBar'
import PartyRanking from '../components/party/PartyRanking'
import PartyQR from '../components/party/PartyQR'
import ShareButton from '../components/shared/ShareButton'
import { generatePartyImage, partyShareText } from '../lib/share'
import PartyCountdown from '../components/party/PartyCountdown'
import { sfx } from '../lib/sfx'

export default function PartyPlayer() {
  const { code } = useParams()
  const navigate = useNavigate()

  const room = usePartyStore(s => s.room)
  const rankings = usePartyStore(s => s.rankings)
  const players = usePartyStore(s => s.players)
  const currentClues = usePartyStore(s => s.currentClues)
  const reset = usePartyStore(s => s.reset)
  const reconnect = usePartyStore(s => s.reconnect)
  const isDoubleRound = usePartyStore(s => s.isDoubleRound)
  const hostDisconnected = usePartyStore(s => s.hostDisconnected)
  const rematchCode = usePartyStore(s => s.rematchCode)
  const progressionResult = usePartyStore(s => s.progressionResult)
  const skipVotes = usePartyStore(s => s.skipVotes)
  const voteSkip = usePartyStore(s => s.voteSkip)
  const showCountdown = usePartyStore(s => s.showCountdown)

  const {
    handleSubmitAnswer,
    submitting,
    shaking,
    answeredThisRound,
    lastAnswerResult,
    myPosition,
    playerId,
  } = usePartyPlayer()

  const [input, setInput] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [localClueIndex, setLocalClueIndex] = useState(0)

  // Try reconnect on mount if no room
  useEffect(() => {
    if (!room && code) {
      setReconnecting(true)
      reconnect(code).then(ok => {
        if (!ok) navigate('/party/join?code=' + code)
        setReconnecting(false)
      })
    }
  }, [])

  // Clear input and reset local clue on new round
  useEffect(() => {
    setInput('')
    setLocalClueIndex(0)
  }, [room?.current_round])

  // Sync localClueIndex when server clue advances past it
  useEffect(() => {
    const serverClue = room?.current_clue || 0
    setLocalClueIndex(prev => Math.max(prev, serverClue))
  }, [room?.current_clue])

  // SFX: power-up when entering double round
  useEffect(() => {
    if (isDoubleRound && room?.status === 'playing') sfx.play('powerUp')
  }, [isDoubleRound, room?.current_round])

  // SFX: podium on game finished
  useEffect(() => {
    if (room?.status === 'finished') sfx.play('podium')
  }, [room?.status])

  const handleSkipClue = useCallback(() => {
    setLocalClueIndex(prev => Math.min(prev + 1, 4))
  }, [])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (!input.trim()) return
    sfx.warmup()
    const result = await handleSubmitAnswer(input.trim(), localClueIndex)
    if (result?.correct) {
      setInput('')
      // SFX: correct + first blood + streak
      if (result.first_blood) sfx.play('firstBlood')
      else sfx.play('correct')
      try { navigator.vibrate?.(200) } catch {}
    } else if (result && !result.already_answered) {
      sfx.play('incorrect')
    }
  }, [input, handleSubmitAnswer])

  const handleExit = useCallback(() => {
    reset()
    navigate('/party')
  }, [reset, navigate])

  if (reconnecting) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-dark">
        <p className="text-text-secondary animate-fadeIn">Reconectando...</p>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-dark">
        <p className="text-text-secondary">Cargando...</p>
      </div>
    )
  }

  const status = room.status
  const currentRound = room.current_round || 0
  const currentClue = room.current_clue || 0
  const totalRounds = room.num_rounds || 5

  // Build local clues: server clues + any locally skipped-ahead clues
  const localClues = (() => {
    if (!room?.movies || status !== 'playing') return currentClues
    const movie = room.movies[currentRound]
    if (!movie?.clues) return currentClues
    const clues = []
    for (let i = 0; i <= localClueIndex; i++) clues.push(movie.clues[i])
    return clues
  })()

  // ==================== WAITING ====================
  if (status === 'waiting') {
    return (
      <div className="min-h-dvh bg-dark flex flex-col items-center justify-center p-6 max-w-[480px] mx-auto">
        {showCountdown && <PartyCountdown from={3} />}
        <div className="text-center space-y-4 animate-fadeIn">
          <span className="text-5xl">🎬</span>
          <h1 className="font-serif text-2xl text-gold">Estás en la sala</h1>
          <p className="text-4xl font-mono text-gold tracking-[0.3em]">{code}</p>
          <p className="text-text-secondary text-sm animate-pulse-border border border-gold/20 rounded-xl px-4 py-3">
            Esperando a que el host arranque el juego...
          </p>
        </div>
      </div>
    )
  }

  // ==================== HOST DISCONNECTED ====================
  if (hostDisconnected) {
    return (
      <div className="min-h-dvh bg-dark flex flex-col items-center justify-center p-6 max-w-[480px] mx-auto">
        <div className="text-center space-y-4 animate-fadeIn">
          <span className="text-5xl">📡</span>
          <h1 className="font-serif text-2xl text-gold">El host se desconectó</h1>
          <p className="text-text-secondary text-sm">La partida no puede continuar sin el host.</p>
          <button
            onClick={handleExit}
            className="bg-gold text-dark font-bold px-8 py-3 rounded-xl hover:bg-gold-light transition-colors"
          >
            Volver
          </button>
        </div>
      </div>
    )
  }

  // ==================== PLAYING ====================
  if (status === 'playing') {
    return (
      <div className="min-h-dvh bg-dark flex flex-col max-w-[480px] mx-auto">
        {/* Top info */}
        <div className="px-4 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-secondary">
              Peli {currentRound + 1}/{totalRounds}
            </span>
            {isDoubleRound && (
              <span className="text-xs font-bold text-gold animate-pulse">x2</span>
            )}
            <span className="text-xs text-text-secondary">
              {CLUE_LABELS[localClueIndex]}
            </span>
            {myPosition > 0 && (
              <span className="text-xs font-mono text-gold">
                #{myPosition}
              </span>
            )}
          </div>
          <PartyTimerBar
            duration={PARTY_CLUE_TIMERS[currentClue]}
            startedAt={room.clue_started_at}
          />
        </div>

        {/* Current clue */}
        <div className="flex-1 px-4 py-3 overflow-y-auto">
          {localClues.map((clue, i) => (
            <div
              key={i}
              className={`mb-2 p-3 rounded-xl border animate-fadeIn ${
                i === localClueIndex
                  ? 'border-gold/30 bg-dark-card'
                  : 'border-dark-border/30 bg-dark-card/50 opacity-60'
              }`}
            >
              {i === localClueIndex ? (
                <p className={`${i === 0 ? 'text-3xl text-center' : 'text-sm'} text-white`}>{clue}</p>
              ) : (
                <p className={`${i === 0 ? 'text-xl text-center' : 'text-xs'} text-white opacity-50`}>{clue}</p>
              )}
            </div>
          ))}
          {/* Skip clue button */}
          {!answeredThisRound && localClueIndex < 4 && (
            <button
              onClick={handleSkipClue}
              className="w-full mt-2 text-text-secondary text-xs py-2 border border-dark-border/30 rounded-xl hover:border-gold/30 hover:text-gold transition-colors"
            >
              Siguiente pista →
            </button>
          )}
          {/* Vote skip movie button */}
          {(() => {
            const alreadyVoted = skipVotes.includes(playerId)
            const connectedCount = players.filter(p => p.connected).length
            return (
              <button
                onClick={voteSkip}
                disabled={alreadyVoted}
                className={`w-full mt-2 text-xs py-2 rounded-xl border transition-colors ${
                  alreadyVoted
                    ? 'border-gold/30 text-gold/60 bg-gold/5'
                    : 'border-dark-border/30 text-text-secondary hover:border-error/30 hover:text-error'
                }`}
              >
                {alreadyVoted
                  ? `Saltear película (${skipVotes.length}/${connectedCount})`
                  : `Saltear película${skipVotes.length > 0 ? ` (${skipVotes.length}/${connectedCount})` : ''}`
                }
              </button>
            )
          })()}
        </div>

        {/* Answer input */}
        <div className="px-4 pb-6 pt-2 safe-bottom">
          {answeredThisRound ? (
            <div className="text-center space-y-2 animate-fadeIn">
              <p className="text-success font-bold text-lg">Correcto!</p>
              {lastAnswerResult?.first_blood && (
                <p className="text-red-400 font-bold text-sm animate-fadeIn">🩸 First Blood! +100 bonus</p>
              )}
              {lastAnswerResult?.multiplier > 1 && (
                <p className="text-gold font-bold text-sm animate-fadeIn">x{lastAnswerResult.multiplier} Multiplicador!</p>
              )}
              <p className="text-gold font-mono text-2xl">+{lastAnswerResult?.points || 0} pts</p>
              <p className="text-text-secondary text-xs">Esperando siguiente película...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className={`flex gap-2 ${shaking ? 'animate-shake' : ''}`}>
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Nombre de la película..."
                  className="flex-1 bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-base text-white placeholder-text-secondary/50 focus:outline-none focus:border-gold"
                  autoFocus
                  autoComplete="off"
                />
                <button
                  type="submit"
                  disabled={submitting || !input.trim()}
                  className="bg-gold text-dark font-bold px-6 py-3.5 rounded-xl hover:bg-gold-light transition-colors disabled:opacity-40"
                >
                  {submitting ? '...' : 'OK'}
                </button>
              </div>
              {lastAnswerResult && !lastAnswerResult.correct && !lastAnswerResult.already_answered && (
                <p className="text-error text-xs text-center animate-fadeIn">Respuesta incorrecta, intentá de nuevo</p>
              )}
            </form>
          )}
        </div>
      </div>
    )
  }

  // ==================== FINISHED ====================
  if (status === 'finished') {
    return (
      <div className="min-h-dvh bg-dark flex flex-col items-center justify-center p-6 max-w-[480px] mx-auto">
        <div className="w-full space-y-5 animate-fadeIn">
          <h1 className="font-serif text-2xl text-gold text-center">Resultados</h1>

          {myPosition > 0 && (
            <div className="text-center">
              <p className="text-text-secondary text-xs">Tu posición</p>
              <p className="text-4xl font-mono text-gold">#{myPosition}</p>
            </div>
          )}

          {progressionResult && (
            <div className="flex gap-3 justify-center animate-fadeIn">
              {progressionResult.elo_delta !== 0 && (
                <div className={`text-center px-4 py-2 rounded-xl border ${progressionResult.elo_delta > 0 ? 'border-success/30 bg-success/10' : 'border-error/30 bg-error/10'}`}>
                  <p className="text-xs text-text-secondary">ELO</p>
                  <p className={`text-lg font-mono font-bold ${progressionResult.elo_delta > 0 ? 'text-success' : 'text-error'}`}>
                    {progressionResult.elo_delta > 0 ? '+' : ''}{progressionResult.elo_delta}
                  </p>
                </div>
              )}
              {progressionResult.xp_earned > 0 && (
                <div className="text-center px-4 py-2 rounded-xl border border-gold/30 bg-gold/10">
                  <p className="text-xs text-text-secondary">XP</p>
                  <p className="text-lg font-mono font-bold text-gold">+{progressionResult.xp_earned}</p>
                </div>
              )}
            </div>
          )}

          <PartyRanking rankings={rankings} highlightPlayerId={playerId} />

          {(() => {
            const myData = rankings?.find(r => r.player_id === playerId)
            const myScore = myData?.total_score || 0
            const myName = myData?.display_name || ''
            return (
              <ShareButton
                generateImage={() => generatePartyImage({
                  rankings,
                  playerCount: players.length || rankings?.length || 0,
                  numRounds: totalRounds,
                  myName,
                  myPosition,
                  myScore,
                })}
                getText={() => partyShareText({
                  myName,
                  myPosition,
                  myScore,
                  playerCount: players.length || rankings?.length || 0,
                  numRounds: totalRounds,
                })}
                label="Compartir resultado"
              />
            )
          })()}

          <div className="flex flex-col items-center gap-3 pt-2">
            {rematchCode && (
              <button
                onClick={() => {
                  const savedName = sessionStorage.getItem('party_display_name')
                  const savedAvatar = sessionStorage.getItem('party_avatar')
                  reset()
                  const params = new URLSearchParams({ code: rematchCode })
                  if (savedName) params.set('name', savedName)
                  if (savedAvatar) params.set('avatar', savedAvatar)
                  navigate(`/party/join?${params.toString()}`)
                }}
                className="w-full bg-gold text-dark font-bold py-3 rounded-xl hover:bg-gold-light transition-colors animate-fadeIn"
              >
                Revancha
              </button>
            )}
            <PartyQR url="https://cineclue.vercel.app" size={160} />
            <p className="text-text-secondary text-xs">Descargá la app</p>
            <button
              onClick={handleExit}
              className="border border-dark-border text-text-secondary font-bold px-8 py-3 rounded-xl hover:text-white hover:border-gold transition-colors"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
