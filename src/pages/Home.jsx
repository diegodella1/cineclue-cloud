import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { getEloRank } from '../lib/constants'
import { getLevelInfo } from '../lib/xp'
import AppShell from '../components/layout/AppShell'


export default function Home() {
  const navigate = useNavigate()
  const profile = useAuthStore(s => s.profile)
  const pendingDuels = useAuthStore(s => s.pendingDuels)
  const rank = profile ? getEloRank(profile.elo) : null
  const lvl = profile ? getLevelInfo(profile.xp) : null

  const isNewUser = profile && profile.games_played === 0

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-5 page-enter">
        {/* Header */}
        {profile && (
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-dark-card border border-dark-border flex items-center justify-center text-xl shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                '🎬'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-white truncate">{profile.display_name}</p>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-secondary">@{profile.username}</span>
                {rank && (
                  <span className="text-gold font-mono text-xs">{rank.icon} {profile.elo}</span>
                )}
              </div>
            </div>
            {profile.streak_current > 0 && (
              <div className="text-center shrink-0">
                <p className="text-lg font-mono text-gold leading-none">{profile.streak_current}</p>
                <p className="text-[10px] text-text-secondary">racha</p>
              </div>
            )}
          </div>
        )}

        {/* Welcome message for new users */}
        {isNewUser && (
          <div className="bg-gold/10 border border-gold/20 rounded-xl p-4 text-center animate-fadeIn">
            <p className="text-gold font-bold text-sm">Bienvenido a CineClue!</p>
            <p className="text-text-secondary text-xs mt-1">Jugá tu primera partida para empezar a construir tu perfil cinematográfico.</p>
          </div>
        )}

        {/* Daily movie card — prominent */}
        <div className="bg-dark-card border border-gold/20 rounded-xl p-5 space-y-3 glow-gold">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎬</span>
            <h2 className="font-serif text-xl text-gold">Peli del Día</h2>
          </div>
          <p className="text-text-secondary text-sm">1 película para todos. Demostrá tu ojo cinéfilo.</p>
          <button
            onClick={() => navigate('/daily')}
            className="w-full bg-gold text-dark font-bold py-3.5 rounded-xl hover:bg-gold-light transition-colors"
          >
            Jugar Peli del Día
          </button>
        </div>

        {/* Solo + Duel row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Solo */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-2.5">
            <h2 className="font-serif text-lg text-gold">Solo</h2>
            <p className="text-text-secondary text-xs leading-relaxed">5 pelis, 5 pistas cada una.</p>
            <button
              onClick={() => navigate('/solo')}
              className="w-full bg-gold text-dark font-bold py-2.5 rounded-lg text-sm hover:bg-gold-light transition-colors"
            >
              Jugar
            </button>
          </div>

          {/* Duels */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-2.5 relative">
            {pendingDuels > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-error text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {pendingDuels}
              </span>
            )}
            <h2 className="font-serif text-lg text-gold">Duelos</h2>
            <p className="text-text-secondary text-xs leading-relaxed">Desafiá a otros jugadores.</p>
            <button
              onClick={() => navigate('/duel')}
              className="w-full border border-gold text-gold font-bold py-2.5 rounded-lg text-sm hover:bg-gold hover:text-dark transition-colors"
            >
              {pendingDuels > 0 ? `${pendingDuels} pendiente${pendingDuels > 1 ? 's' : ''}` : 'Ver Duelos'}
            </button>
          </div>
        </div>

        {/* Stats */}
        {profile && !isNewUser && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-dark-card border border-dark-border rounded-xl p-3 text-center">
              <p className="text-2xl font-mono text-gold">{profile.games_played}</p>
              <p className="text-[11px] text-text-secondary">Partidas</p>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-xl p-3 text-center">
              <p className="text-2xl font-mono text-gold">{profile.total_score}</p>
              <p className="text-[11px] text-text-secondary">Puntos</p>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-xl p-3 text-center">
              <p className="text-2xl font-mono text-gold">{lvl?.icon}</p>
              <p className="text-[11px] text-text-secondary">{lvl?.name || `Nv ${profile.level}`}</p>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
