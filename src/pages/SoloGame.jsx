import { useEffect, useState } from 'react'
import { useGame } from '../hooks/useGame'
import { useUiStore } from '../stores/uiStore'
import AppShell from '../components/layout/AppShell'
import ClueCard from '../components/game/ClueCard'
import GuessInput from '../components/game/GuessInput'
import RoundResult from '../components/game/RoundResult'
import GameOver from '../components/game/GameOver'
import Loading from '../components/shared/Loading'

export default function SoloGame() {
  const [gameResult, setGameResult] = useState(null)
  const {
    movies, currentRound, currentClue, currentMovie,
    roundResults, totalScore, gameOver, loading,
    showResult, lastResult, shaking,
    loadSoloMovies, revealNextClue,
    handleGuess, handleSkip, handleNext, handleFinish, reset,
  } = useGame()

  useEffect(() => {
    loadSoloMovies()
  }, [])

  useEffect(() => {
    if (gameOver) {
      handleFinish().then(r => {
        if (r?.error) useUiStore.getState().showToast('Error al guardar partida', 'error')
        else setGameResult(r)
      })
    }
  }, [gameOver])

  if (loading) return <AppShell><Loading /></AppShell>

  if (!movies.length) {
    return (
      <AppShell>
        <div className="min-h-dvh flex items-center justify-center">
          <p className="text-text-secondary">No hay películas disponibles</p>
        </div>
      </AppShell>
    )
  }

  if (gameOver) {
    return (
      <AppShell>
        <div className="pt-6">
          <h1 className="font-serif text-2xl text-gold text-center mb-4">Fin de la partida</h1>
          <GameOver
            totalScore={totalScore}
            maxScore={movies.length * 5}
            roundResults={roundResults}
            gameResult={gameResult}
            onPlayAgain={() => { reset(); setGameResult(null); loadSoloMovies() }}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-5 page-enter">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="font-serif text-xl text-gold">Ronda {currentRound + 1} / {movies.length}</h1>
          <span className="font-mono text-gold text-lg">{totalScore} pts</span>
        </div>

        {/* Round progress dots */}
        <div className="flex justify-center gap-1.5">
          {movies.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${
              i < currentRound ? (roundResults[i]?.guessed ? 'bg-success' : 'bg-error/60') :
              i === currentRound ? 'bg-gold scale-125' : 'bg-dark-border'
            }`} />
          ))}
        </div>

        {showResult && lastResult ? (
          <RoundResult result={lastResult} onNext={handleNext} />
        ) : currentMovie ? (
          <>
            {/* Difficulty badge */}
            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
                currentMovie.diff === 'fácil' ? 'text-success border-success/30' :
                currentMovie.diff === 'medio' ? 'text-gold border-gold/30' :
                'text-error border-error/30'
              }`}>
                {currentMovie.diff.toUpperCase()}
              </span>
            </div>

            {/* Clues */}
            <ClueCard clues={currentMovie.clues} currentClue={currentClue} />

            {/* Input */}
            <GuessInput
              onGuess={handleGuess}
              onSkip={handleSkip}
              onReveal={revealNextClue}
              canReveal={currentClue < 4}
              shaking={shaking}
              disabled={showResult}
            />
          </>
        ) : null}
      </div>
    </AppShell>
  )
}
