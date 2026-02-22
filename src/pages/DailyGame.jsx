import { useEffect } from 'react'
import { useDaily } from '../hooks/useDaily'
import { dailyShareText, generateDailyImage } from '../lib/share'
import AppShell from '../components/layout/AppShell'
import ClueCard from '../components/game/ClueCard'
import GuessInput from '../components/game/GuessInput'
import DailyStats from '../components/game/DailyStats'
import Countdown from '../components/game/Countdown'
import ShareButton from '../components/shared/ShareButton'
import Loading from '../components/shared/Loading'

export default function DailyGame() {
  const {
    movie, currentClue, alreadyPlayed, previousGame,
    result, gameResult, stats, loading, shaking,
    loadDaily, handleGuess, handleSkip, revealNextClue,
  } = useDaily()

  useEffect(() => {
    loadDaily()
  }, [])

  if (loading) return <AppShell><Loading /></AppShell>

  if (!movie) {
    return (
      <AppShell>
        <div className="min-h-dvh flex flex-col items-center justify-center gap-4">
          <p className="text-text-secondary">No hay peli del día programada</p>
          <Countdown />
        </div>
      </AppShell>
    )
  }

  // Already played or just finished — resolve share data from result (just played) or previousGame (returning)
  if (alreadyPlayed || result) {
    // previousGame has movies_played JSONB from cc_games row
    const prevRound = previousGame?.movies_played?.[0]
    const shareGuessed = result?.guessed ?? prevRound?.guessed ?? false
    const sharePoints = result?.points_earned ?? prevRound?.points_earned ?? 0
    const shareClue = result?.clue_revealed ?? prevRound?.clue_revealed ?? 0
    const shareEloDelta = gameResult?.elo_delta ?? previousGame?.elo_delta
    const shareEloAfter = gameResult?.elo_after ?? previousGame?.elo_after

    return (
      <AppShell>
        <div className="pt-6 pb-24 space-y-6">
          <h1 className="font-serif text-xl text-gold text-center">Peli del Día</h1>

          <div className="text-center space-y-2">
            {result?.guessed ? (
              <>
                <p className="text-success text-lg font-bold">Correcto!</p>
                <p className="text-gold text-3xl font-mono animate-pop">+{result.points_earned} pts</p>
              </>
            ) : alreadyPlayed && !result ? (
              <>
                <p className="text-text-secondary">Ya jugaste hoy</p>
                {shareGuessed && <p className="text-gold text-2xl font-mono">{sharePoints} pts</p>}
              </>
            ) : (
              <p className="text-text-secondary text-lg">Sin puntos</p>
            )}
            <h2 className="text-3xl font-serif text-gold">{movie.title}</h2>
            <span className={`inline-block text-xs font-mono px-2 py-1 rounded border border-dark-border ${
              movie.diff === 'fácil' ? 'text-success' : movie.diff === 'medio' ? 'text-gold' : 'text-error'
            }`}>
              {movie.diff.toUpperCase()}
            </span>
            <div>
              <a
                href={`https://letterboxd.com/film/${movie.lb}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold-light text-sm hover:underline"
              >
                Ver en Letterboxd
              </a>
            </div>
          </div>

          <ShareButton
            generateImage={() => generateDailyImage({
              date: new Date().toLocaleDateString('es-AR'),
              movieTitle: movie.title,
              guessed: shareGuessed,
              pointsEarned: sharePoints,
              clueUsed: shareClue,
              eloDelta: shareEloDelta,
              eloAfter: shareEloAfter,
            })}
            getText={() => dailyShareText({
              guessed: shareGuessed,
              pointsEarned: sharePoints,
              date: new Date().toLocaleDateString('es-AR'),
            })}
            label="Compartir resultado"
          />

          <DailyStats stats={stats} />
          <Countdown />
        </div>
      </AppShell>
    )
  }

  // Playing
  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-6">
        <div className="text-center">
          <h1 className="font-serif text-xl text-gold">Peli del Día</h1>
          <p className="text-xs text-text-secondary">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        <div className="flex items-center justify-center">
          <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
            movie.diff === 'fácil' ? 'text-success border-success/30' :
            movie.diff === 'medio' ? 'text-gold border-gold/30' :
            'text-error border-error/30'
          }`}>
            {movie.diff.toUpperCase()}
          </span>
        </div>

        <ClueCard clues={movie.clues} currentClue={currentClue} />

        <GuessInput
          onGuess={handleGuess}
          onSkip={handleSkip}
          onReveal={revealNextClue}
          canReveal={currentClue < 4}
          shaking={shaking}
          disabled={false}
        />
      </div>
    </AppShell>
  )
}
