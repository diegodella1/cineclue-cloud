import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePartyStore } from '../stores/partyStore'
import { usePartyHost } from '../hooks/usePartyHost'
import { PARTY_CLUE_TIMERS, CLUE_LABELS } from '../lib/constants'
import PartyQR from '../components/party/PartyQR'
import PartyTimerBar from '../components/party/PartyTimerBar'
import PartyRanking from '../components/party/PartyRanking'
import PartyPodium from '../components/party/PartyPodium'
import PartyClueStack from '../components/party/PartyClueStack'
import PartyCountdown from '../components/party/PartyCountdown'
import ShareButton from '../components/shared/ShareButton'
import { generatePartyImage, partyShareText } from '../lib/share'
import { sfx } from '../lib/sfx'

export default function PartyHost() {
  const { code } = useParams()
  const navigate = useNavigate()

  const room = usePartyStore(s => s.room)
  const players = usePartyStore(s => s.players)
  const rankings = usePartyStore(s => s.rankings)
  const currentClues = usePartyStore(s => s.currentClues)
  const reset = usePartyStore(s => s.reset)
  const lastFirstBlood = usePartyStore(s => s.lastFirstBlood)
  const isDoubleRound = usePartyStore(s => s.isDoubleRound)
  const previousRankings = usePartyStore(s => s.previousRankings)
  const playerStreaks = usePartyStore(s => s.playerStreaks)

  const {
    handleStartGame,
    handleNextRound,
    handleTimerExpiry,
    skipAutoAdvance,
    startClueTimer,
    autoAdvanceCountdownRef,
  } = usePartyHost()

  const [showCountdown, setShowCountdown] = useState(false)
  const [showRoundEnd, setShowRoundEnd] = useState(false)
  const [copied, setCopied] = useState(false)
  const [autoAdvanceSecs, setAutoAdvanceSecs] = useState(0)

  const joinUrl = `${window.location.origin}/party/join?code=${code}`

  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }, () => {})
  }, [joinUrl])

  const handleShare = useCallback(() => {
    if (navigator.share) {
      navigator.share({
        title: 'CineClue Party',
        text: `Unite a mi sala de CineClue! Código: ${code}`,
        url: joinUrl,
      }).catch(() => {})
    } else {
      handleCopyLink()
    }
  }, [joinUrl, code, handleCopyLink])

  // Derive state
  const status = room?.status || 'waiting'
  const currentRound = room?.current_round || 0
  const currentClue = room?.current_clue || 0
  const totalRounds = room?.num_rounds || 5
  const currentMovie = room?.movies?.[currentRound]

  const handleStart = useCallback(() => {
    setShowCountdown(true)
  }, [])

  const onCountdownComplete = useCallback(async () => {
    setShowCountdown(false)
    await handleStartGame()
  }, [handleStartGame])

  const onTimerExpire = useCallback(async () => {
    if (currentClue < 4) {
      // Advance clue (handled by host hook)
      await handleTimerExpiry()
    } else {
      // Round end
      setShowRoundEnd(true)
    }
  }, [currentClue, handleTimerExpiry])

  const handleContinue = useCallback(async () => {
    setShowRoundEnd(false)
    await handleNextRound()
  }, [handleNextRound])

  const handleExit = useCallback(() => {
    reset()
    navigate('/party')
  }, [reset, navigate])

  // Show round end when all clues exhausted
  useEffect(() => {
    if (room?._roundEndTitle) {
      setShowRoundEnd(true)
    }
  }, [room?._roundEndTitle])

  // Auto-advance countdown ticker for UI
  useEffect(() => {
    if (!showRoundEnd || !room?.auto_advance) {
      setAutoAdvanceSecs(0)
      return
    }
    setAutoAdvanceSecs(4)
    const interval = setInterval(() => {
      const remaining = autoAdvanceCountdownRef.current
      if (remaining <= 0) {
        setAutoAdvanceSecs(0)
        clearInterval(interval)
      } else {
        setAutoAdvanceSecs(Math.ceil(remaining / 1000))
      }
    }, 200)
    return () => clearInterval(interval)
  }, [showRoundEnd, room?.auto_advance])

  // SFX: first blood on TV
  useEffect(() => {
    if (lastFirstBlood) sfx.play('firstBlood')
  }, [lastFirstBlood])

  // SFX: ding when someone answers correctly
  const answeredPlayerIds = usePartyStore(s => s.answeredPlayerIds)
  useEffect(() => {
    if (answeredPlayerIds.length > 0) sfx.play('ding')
  }, [answeredPlayerIds.length])

  // SFX: fanfare on round end
  useEffect(() => {
    if (showRoundEnd) sfx.play('fanfare')
  }, [showRoundEnd])

  // SFX: podium on game finished
  useEffect(() => {
    if (status === 'finished') sfx.play('podium')
  }, [status])

  // SFX: power-up when entering double round
  useEffect(() => {
    if (isDoubleRound && status === 'playing') sfx.play('powerUp')
  }, [isDoubleRound, currentRound])

  if (!room) {
    return (
      <div className="party-host-layout">
        <div className="flex items-center justify-center h-full">
          <p className="text-text-secondary">Cargando sala...</p>
        </div>
      </div>
    )
  }

  // ==================== WAITING ====================
  if (status === 'waiting') {
    return (
      <div className="party-host-layout">
        {showCountdown && <PartyCountdown from={3} onComplete={onCountdownComplete} />}
        <div className="flex flex-col items-center justify-center h-full gap-8 p-10">
          <h1 className="font-serif text-6xl text-gold italic">CineClue Party</h1>
          <div className="flex items-center gap-12">
            <PartyQR code={code} size={280} />
            <div className="text-center space-y-4">
              <p className="text-text-secondary text-xl">Código de sala</p>
              <p className="text-9xl font-mono text-gold tracking-[0.5em]">{code}</p>
              <p className="text-text-secondary text-base">Escaneá el QR o ingresá el código en tu celular</p>
              <div className="flex gap-3 justify-center pt-3">
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 bg-dark-card border border-dark-border text-text-secondary text-sm px-5 py-3 rounded-xl hover:text-white hover:border-gold/40 transition-colors"
                >
                  {copied ? '✓ Copiado!' : '🔗 Copiar link'}
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 bg-gold/10 border border-gold/30 text-gold text-sm px-5 py-3 rounded-xl hover:bg-gold/20 transition-colors"
                >
                  📤 Compartir
                </button>
              </div>
            </div>
          </div>

          {/* Players list */}
          <div className="w-full max-w-3xl">
            <p className="text-lg text-text-secondary mb-3 text-center">{players.length} jugador{players.length !== 1 ? 'es' : ''} conectado{players.length !== 1 ? 's' : ''}</p>
            <div className="flex flex-wrap gap-4 justify-center">
              {players.map(p => (
                <div key={p.id} className="flex items-center gap-4 bg-dark-card border border-dark-border rounded-2xl px-6 py-4 animate-fadeIn">
                  <span className="text-5xl">{p.avatar}</span>
                  <span className="text-xl font-bold text-white">{p.display_name}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={players.length < 2}
            className="bg-gold text-dark font-bold text-2xl px-16 py-5 rounded-2xl hover:bg-gold-light transition-colors disabled:opacity-40"
          >
            {players.length < 2 ? 'Esperando jugadores...' : `Arrancar (${totalRounds} pelis)`}
          </button>
        </div>
      </div>
    )
  }

  // ==================== PLAYING ====================
  if (status === 'playing' && !showRoundEnd) {
    return (
      <div className="party-host-layout">
        {/* Top bar */}
        <div className="flex items-center justify-between px-10 py-5 bg-dark-card/80 border-b border-dark-border">
          <span className="font-serif text-3xl text-gold italic">CineClue Party</span>
          <div className="flex items-center gap-4">
            <span className="text-xl text-text-secondary">
              Película {currentRound + 1} de {totalRounds}
            </span>
            {isDoubleRound && (
              <span className="text-xl font-bold text-gold animate-pulse">x2</span>
            )}
          </div>
          <span className="font-mono text-lg text-text-secondary">
            Pista {currentClue + 1}/5: {CLUE_LABELS[currentClue]}
          </span>
        </div>

        {/* First Blood banner */}
        {lastFirstBlood && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-50 bg-red-900/90 border border-red-500/50 text-white font-bold text-2xl px-8 py-4 rounded-2xl animate-fadeIn">
            🩸 {lastFirstBlood.display_name} — First Blood!
          </div>
        )}

        {/* Timer */}
        <div className="px-10 pt-4">
          <PartyTimerBar
            duration={PARTY_CLUE_TIMERS[currentClue]}
            startedAt={room.clue_started_at}
            onExpire={onTimerExpire}
          />
        </div>

        {/* Main content: 75/25 split */}
        <div className="flex flex-1 gap-8 p-10 overflow-hidden">
          {/* Clues — 75% */}
          <div className="flex-[3] overflow-y-auto">
            <PartyClueStack clues={currentClues} currentClue={currentClue} />
          </div>

          {/* Rankings — 25% */}
          <div className="flex-[1] overflow-y-auto">
            <h3 className="text-base text-text-secondary uppercase tracking-widest mb-4">Ranking</h3>
            <PartyRanking rankings={rankings} previousRankings={previousRankings} playerStreaks={playerStreaks} tv />
          </div>
        </div>
      </div>
    )
  }

  // ==================== ROUND END ====================
  if (status === 'playing' && showRoundEnd) {
    return (
      <div className="party-host-layout">
        <div className="flex flex-col items-center justify-center h-full gap-10 p-10">
          {/* Round number */}
          <p className="text-text-secondary text-lg uppercase tracking-[0.3em]">
            Película {currentRound + 1} de {totalRounds}
          </p>

          {/* Movie title — cinematic reveal */}
          <div className="text-center space-y-4 animate-reveal-title">
            <p className="text-8xl mb-3">🎬</p>
            <h2 className="font-serif text-7xl md:text-9xl text-gold italic leading-tight glow-gold px-6">
              {room?._roundEndTitle || currentMovie?.title}
            </h2>
            {(room?._roundEndDiff || currentMovie?.diff) && (
              <p className={`text-xl font-mono tracking-widest ${
                (room?._roundEndDiff || currentMovie?.diff) === 'fácil' ? 'text-success' : (room?._roundEndDiff || currentMovie?.diff) === 'medio' ? 'text-gold' : 'text-error'
              }`}>
                {(room?._roundEndDiff || currentMovie?.diff).toUpperCase()}
              </p>
            )}
          </div>

          {/* Rankings */}
          <div className="w-full max-w-2xl">
            <PartyRanking rankings={rankings} previousRankings={previousRankings} playerStreaks={playerStreaks} tv />
          </div>

          {room?.auto_advance && autoAdvanceSecs > 0 ? (
            <button
              onClick={skipAutoAdvance}
              className="bg-gold/20 text-gold font-bold text-2xl px-20 py-6 rounded-2xl border-2 border-gold hover:bg-gold hover:text-dark transition-colors"
            >
              Siguiente en {autoAdvanceSecs}s — Saltear
            </button>
          ) : (
            <button
              onClick={handleContinue}
              className="bg-gold text-dark font-bold text-2xl px-20 py-6 rounded-2xl hover:bg-gold-light transition-colors animate-pulse-border border-2 border-gold"
            >
              {currentRound + 1 >= totalRounds ? 'Ver resultados' : 'Siguiente película'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // ==================== FINISHED ====================
  if (status === 'finished') {
    return (
      <div className="party-host-layout">
        <div className="flex flex-col items-center justify-center h-full gap-8 p-10">
          <h1 className="font-serif text-8xl text-gold italic">Resultados finales</h1>
          <PartyPodium rankings={rankings} />
          <div className="w-full max-w-3xl">
            <PartyRanking rankings={rankings} tv />
          </div>
          <div className="flex gap-4">
            <ShareButton
              generateImage={() => generatePartyImage({
                rankings,
                playerCount: players.length,
                numRounds: totalRounds,
              })}
              getText={() => partyShareText({
                playerCount: players.length,
                numRounds: totalRounds,
                myScore: rankings?.[0]?.total_score,
                myPosition: 1,
                myName: rankings?.[0]?.display_name,
              })}
              label="Compartir resultados"
              className="flex items-center justify-center gap-2 bg-gold text-dark font-bold text-xl px-12 py-4 rounded-2xl hover:bg-gold-light transition-colors"
            />
            <button
              onClick={handleExit}
              className="border-2 border-gold text-gold font-bold text-xl px-12 py-4 rounded-2xl hover:bg-gold hover:text-dark transition-colors"
            >
              Volver al inicio
            </button>
          </div>
          <div className="flex flex-col items-center gap-2 mt-4">
            <PartyQR url="https://cineclue.vercel.app" size={200} />
            <p className="text-text-secondary text-base">Descargá la app</p>
          </div>
        </div>
      </div>
    )
  }

  return null
}
