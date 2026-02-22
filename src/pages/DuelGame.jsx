import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDuel } from '../hooks/useDuel'
import { supabase } from '../lib/supabase'
import { getLevelInfo } from '../lib/xp'
import { generateDuelImage, duelShareText, generateSoloImage, soloShareText } from '../lib/share'
import AppShell from '../components/layout/AppShell'
import ClueCard from '../components/game/ClueCard'
import GuessInput from '../components/game/GuessInput'
import RoundResult from '../components/game/RoundResult'
import ShareButton from '../components/shared/ShareButton'
import Loading from '../components/shared/Loading'

function DuelResultView({ duel, userId }) {
  const navigate = useNavigate()
  const isChallenger = duel.challenger.id === userId
  const me = isChallenger ? duel.challenger : duel.opponent
  const rival = isChallenger ? duel.opponent : duel.challenger
  const myScore = isChallenger ? duel.challenger_score : duel.opponent_score
  const rivalScore = isChallenger ? duel.opponent_score : duel.challenger_score
  const iWon = duel.winner_id === userId
  const draw = duel.winner_id === null

  return (
    <div className="pt-6 pb-24 space-y-6 animate-fadeIn">
      <h1 className="font-serif text-2xl text-gold text-center">
        {duel.status === 'expired' ? 'Duelo Expirado' : 'Resultado del Duelo'}
      </h1>

      <div className="grid grid-cols-2 gap-4 text-center">
        <div className={`bg-dark-card border rounded-xl p-4 ${iWon || (draw && !isChallenger) ? 'border-gold glow-gold' : 'border-dark-border'}`}>
          <p className="text-sm text-text-secondary">{me.display_name}</p>
          <p className="text-xs text-text-secondary">@{me.username}</p>
          <p className="text-3xl font-mono text-gold">{myScore ?? '-'}</p>
        </div>
        <div className={`bg-dark-card border rounded-xl p-4 ${!iWon && !draw ? 'border-gold glow-gold' : 'border-dark-border'}`}>
          <p className="text-sm text-text-secondary">{rival.display_name}</p>
          <p className="text-xs text-text-secondary">@{rival.username}</p>
          <p className="text-3xl font-mono text-gold">{rivalScore ?? '-'}</p>
        </div>
      </div>

      <p className="text-center text-lg font-bold text-gold">
        {duel.status === 'expired'
          ? 'No se respondió a tiempo'
          : draw ? 'Empate!' : iWon ? 'Ganaste!' : 'Perdiste'}
      </p>

      {duel.status === 'completed' && (
        <ShareButton
          generateImage={() => generateDuelImage({
            myName: me.display_name, myScore: myScore,
            rivalName: rival.display_name, rivalScore: rivalScore,
            iWon, isDraw: draw,
          })}
          getText={() => duelShareText({
            myName: me.display_name, myScore: myScore,
            rivalName: rival.username, rivalScore: rivalScore,
            iWon, isDraw: draw,
          })}
          label="Compartir resultado"
        />
      )}

      <button
        onClick={() => navigate('/duel')}
        className="w-full border border-dark-border text-text-secondary py-3 rounded-lg hover:text-white transition-colors"
      >
        Volver a Duelos
      </button>
    </div>
  )
}

export default function DuelGame() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const fetchProfile = useAuthStore(s => s.fetchProfile)

  const opponentUsername = searchParams.get('opponent')
  const duelId = searchParams.get('id')
  const viewOnly = searchParams.get('view') === '1'

  const isChallenger = !!opponentUsername
  const isOpponent = !!duelId && !viewOnly

  const [finishing, setFinishing] = useState(false)
  const [viewDuel, setViewDuel] = useState(null)
  const [error, setError] = useState(null)

  const {
    movies, currentRound, currentClue, currentMovie,
    roundResults, totalScore, gameOver, loading,
    showResult, lastResult, shaking,
    duelInfo, submitResult,
    startAsChallenger, startAsOpponent,
    revealNextClue, handleGuess, handleSkip, handleNext,
    finishAsChallenger, finishAsOpponent,
  } = useDuel()

  // Init
  useEffect(() => {
    if (!user) return
    if (viewOnly && duelId) {
      // View-only mode: fetch duel details
      supabase.rpc('cc_get_duel', { p_duel_id: duelId, p_user_id: user.id })
        .then(({ data, error }) => {
          if (error) setError(error.message)
          else setViewDuel(data)
        })
    } else if (isChallenger) {
      startAsChallenger()
    } else if (isOpponent) {
      startAsOpponent(duelId, user.id).then(result => {
        if (result?.error === 'already_played') {
          setViewDuel(result.duel)
        } else if (result?.error) {
          setError(result.error)
        }
      })
    }
  }, [user])

  // Auto-finish when game over
  useEffect(() => {
    if (!gameOver || finishing || !user) return
    setFinishing(true)

    const finish = async () => {
      let result
      if (isChallenger) {
        result = await finishAsChallenger(user.id, opponentUsername)
      } else if (isOpponent) {
        result = await finishAsOpponent(duelId, user.id)
      }
      if (result?.error) {
        setError(result.error)
      } else {
        await fetchProfile(user.id)
      }
      setFinishing(false)
    }
    finish()
  }, [gameOver])

  if (loading) return <AppShell><Loading /></AppShell>

  if (error) {
    return (
      <AppShell>
        <div className="pt-6 pb-24 space-y-4 text-center">
          <p className="text-error text-lg">Error</p>
          <p className="text-text-secondary">{error}</p>
          <button
            onClick={() => navigate('/duel')}
            className="border border-dark-border text-text-secondary py-3 px-6 rounded-lg hover:text-white transition-colors"
          >
            Volver
          </button>
        </div>
      </AppShell>
    )
  }

  // View-only mode
  if (viewDuel) {
    return (
      <AppShell>
        <DuelResultView duel={viewDuel} userId={user.id} />
      </AppShell>
    )
  }

  // Game over — challenger
  if (gameOver && isChallenger) {
    return (
      <AppShell>
        <div className="pt-6 pb-24 space-y-6 animate-fadeIn">
          <h1 className="font-serif text-2xl text-gold text-center">Desafío Enviado</h1>

          <div className="text-center space-y-2">
            <p className="text-4xl font-mono text-gold font-bold">{totalScore} / {movies.length * 5}</p>
            <p className="text-text-secondary">Tu puntaje</p>
          </div>

          {submitResult?.game_result && (
            <div className="flex justify-center gap-6 text-center">
              <div>
                <p className={`text-lg font-mono font-bold ${submitResult.game_result.elo_delta >= 0 ? 'text-success' : 'text-error'}`}>
                  {submitResult.game_result.elo_delta >= 0 ? '+' : ''}{submitResult.game_result.elo_delta} PuntEmes
                </p>
                <p className="text-xs text-text-secondary">{submitResult.game_result.elo_after}</p>
              </div>
              <div>
                <p className="text-lg font-mono font-bold text-gold">+{submitResult.game_result.xp_earned} XP</p>
                <p className="text-xs text-text-secondary">{getLevelInfo(submitResult.game_result.new_xp ?? 0).icon} {getLevelInfo(submitResult.game_result.new_xp ?? 0).name}</p>
              </div>
            </div>
          )}

          <div className="bg-dark-card border border-gold/20 rounded-xl p-5 text-center space-y-2">
            <p className="text-white">Desafío enviado a <span className="text-gold font-bold">@{opponentUsername}</span></p>
            <p className="text-text-secondary text-sm">Tiene 12 horas para responder</p>
          </div>

          {/* Round results */}
          <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
            {roundResults.map((r, i) => (
              <div key={i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-dark-border' : ''}`}>
                <p className="text-sm text-white flex-1 min-w-0 truncate">{r.title}</p>
                <span className={`text-sm font-mono ml-3 ${r.guessed ? 'text-gold' : 'text-text-secondary'}`}>
                  {r.points_earned} pts
                </span>
              </div>
            ))}
          </div>

          <ShareButton
            generateImage={() => generateSoloImage({
              mode: 'solo', totalScore, maxScore: movies.length * 5,
              eloDelta: submitResult?.game_result?.elo_delta,
              eloAfter: submitResult?.game_result?.elo_after,
              roundResults, badge: null,
            })}
            getText={() => soloShareText({
              totalScore, maxScore: movies.length * 5,
              eloDelta: submitResult?.game_result?.elo_delta || 0,
              eloAfter: submitResult?.game_result?.elo_after || 0,
            })}
            label="Compartir"
          />

          <button
            onClick={() => navigate('/duel')}
            className="w-full border border-dark-border text-text-secondary py-3 rounded-lg hover:text-white transition-colors"
          >
            Volver a Duelos
          </button>
        </div>
      </AppShell>
    )
  }

  // Game over — opponent
  if (gameOver && isOpponent) {
    const challengerName = duelInfo?.challenger?.display_name || 'Challenger'
    const challengerUsername = duelInfo?.challenger?.username || ''
    const challengerScore = submitResult?.challenger_score
    const opponentScore = submitResult?.opponent_score ?? totalScore
    const winnerId = submitResult?.winner_id
    const iWon = winnerId === user.id
    const draw = winnerId === null

    return (
      <AppShell>
        <div className="pt-6 pb-24 space-y-6 animate-fadeIn">
          <h1 className="font-serif text-2xl text-gold text-center">Resultado del Duelo</h1>

          <div className="grid grid-cols-2 gap-4 text-center">
            <div className={`bg-dark-card border rounded-xl p-4 ${!iWon && !draw ? 'border-gold glow-gold' : 'border-dark-border'}`}>
              <p className="text-sm text-text-secondary">{challengerName}</p>
              <p className="text-xs text-text-secondary">@{challengerUsername}</p>
              <p className="text-3xl font-mono text-gold">{challengerScore ?? '-'}</p>
            </div>
            <div className={`bg-dark-card border rounded-xl p-4 ${iWon || draw ? 'border-gold glow-gold' : 'border-dark-border'}`}>
              <p className="text-sm text-text-secondary">Vos</p>
              <p className="text-3xl font-mono text-gold">{opponentScore}</p>
            </div>
          </div>

          <p className="text-center text-lg font-bold text-gold">
            {draw ? 'Empate!' : iWon ? 'Ganaste!' : 'Perdiste'}
          </p>

          {submitResult?.game_result && (
            <div className="flex justify-center gap-6 text-center">
              <div>
                <p className={`text-lg font-mono font-bold ${submitResult.game_result.elo_delta >= 0 ? 'text-success' : 'text-error'}`}>
                  {submitResult.game_result.elo_delta >= 0 ? '+' : ''}{submitResult.game_result.elo_delta} PuntEmes
                </p>
                <p className="text-xs text-text-secondary">{submitResult.game_result.elo_after}</p>
              </div>
              <div>
                <p className="text-lg font-mono font-bold text-gold">+{submitResult.game_result.xp_earned} XP</p>
                <p className="text-xs text-text-secondary">{getLevelInfo(submitResult.game_result.new_xp ?? 0).icon} {getLevelInfo(submitResult.game_result.new_xp ?? 0).name}</p>
              </div>
            </div>
          )}

          {/* Round results */}
          <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
            {roundResults.map((r, i) => (
              <div key={i} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-dark-border' : ''}`}>
                <p className="text-sm text-white flex-1 min-w-0 truncate">{r.title}</p>
                <span className={`text-sm font-mono ml-3 ${r.guessed ? 'text-gold' : 'text-text-secondary'}`}>
                  {r.points_earned} pts
                </span>
              </div>
            ))}
          </div>

          <ShareButton
            generateImage={() => generateDuelImage({
              myName: 'Vos', myScore: opponentScore,
              rivalName: challengerName, rivalScore: challengerScore,
              iWon, isDraw: draw,
              eloDelta: submitResult?.game_result?.elo_delta,
              eloAfter: submitResult?.game_result?.elo_after,
            })}
            getText={() => duelShareText({
              myName: 'Yo', myScore: opponentScore,
              rivalName: challengerUsername, rivalScore: challengerScore,
              iWon, isDraw: draw,
            })}
            label="Compartir resultado"
          />

          <button
            onClick={() => navigate('/duel')}
            className="w-full border border-dark-border text-text-secondary py-3 rounded-lg hover:text-white transition-colors"
          >
            Volver a Duelos
          </button>
        </div>
      </AppShell>
    )
  }

  // No movies loaded yet
  if (!movies.length) return <AppShell><Loading /></AppShell>

  // Playing — same UI as Solo (5 movies, clues, input)
  const rivalInfo = isChallenger
    ? opponentUsername
    : duelInfo?.challenger?.display_name || 'Rival'

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-5 page-enter">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="font-serif text-xl text-gold">Ronda {currentRound + 1} / {movies.length}</h1>
          <span className="font-mono text-gold text-lg">{totalScore} pts</span>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-1.5">
          {movies.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-all ${
              i < currentRound ? (roundResults[i]?.guessed ? 'bg-success' : 'bg-error/60') :
              i === currentRound ? 'bg-gold scale-125' : 'bg-dark-border'
            }`} />
          ))}
        </div>

        <div className="bg-dark-card border border-gold/20 rounded-xl px-4 py-2 text-center">
          <span className="text-sm text-text-secondary">
            Duelo vs <span className="text-gold font-bold">@{rivalInfo}</span>
          </span>
        </div>

        {/* Difficulty badge */}
        {currentMovie && !showResult && (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-2 py-0.5 rounded border ${
              currentMovie.diff === 'fácil' ? 'text-success border-success/30' :
              currentMovie.diff === 'medio' ? 'text-gold border-gold/30' :
              'text-error border-error/30'
            }`}>
              {currentMovie.diff.toUpperCase()}
            </span>
          </div>
        )}

        {showResult && lastResult ? (
          <RoundResult result={lastResult} onNext={handleNext} />
        ) : currentMovie ? (
          <>
            <ClueCard clues={currentMovie.clues} currentClue={currentClue} />
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
