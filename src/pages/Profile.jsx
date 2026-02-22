import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useProfile } from '../hooks/useProfile'
import { getEloRank } from '../lib/constants'
import { xpProgress } from '../lib/xp'
import { signOut } from '../lib/auth'
import { generateProfileImage, profileShareText } from '../lib/share'
import AppShell from '../components/layout/AppShell'
import RadarChart from '../components/profile/RadarChart'
import ShareButton from '../components/shared/ShareButton'
import Loading from '../components/shared/Loading'

export default function Profile() {
  const user = useAuthStore(s => s.user)
  const profile = useAuthStore(s => s.profile)
  const navigate = useNavigate()
  const updateProfile = useAuthStore(s => s.updateProfile)
  const { profileData, loading, loadPublicProfile, getSpecialties, getWeaknesses, getFavoriteDecade, getGenreStats } = useProfile()
  const [duelsEnabled, setDuelsEnabled] = useState(profile?.duels_enabled ?? true)

  useEffect(() => {
    if (profile?.username) loadPublicProfile(profile.username)
  }, [profile?.username])

  useEffect(() => {
    if (profile) setDuelsEnabled(profile.duels_enabled ?? true)
  }, [profile])

  const handleToggleDuels = async () => {
    const newVal = !duelsEnabled
    setDuelsEnabled(newVal)
    await updateProfile({ duels_enabled: newVal })
  }

  const handleSignOut = async () => {
    await signOut()
    navigate('/auth')
  }

  if (loading || !profileData) return <AppShell><Loading /></AppShell>

  const rank = getEloRank(profileData.elo)
  const xp = xpProgress(profileData.xp)
  const specialties = getSpecialties(profileData.category_stats)
  const weaknesses = getWeaknesses(profileData.category_stats)
  const favoriteDecade = getFavoriteDecade(profileData.category_stats)
  const genreStats = getGenreStats(profileData.category_stats)

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-20 h-20 rounded-full bg-dark-card border-2 border-gold mx-auto flex items-center justify-center text-3xl">
            {profileData.avatar_url ? (
              <img src={profileData.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : '🎬'}
          </div>
          <h1 className="font-bold text-xl">{profileData.display_name}</h1>
          <p className="text-text-secondary text-sm">@{profileData.username}</p>
          <p className="text-gold font-mono">{rank.icon} {rank.title} · {profileData.elo} PuntEmes</p>
          <ShareButton
            generateImage={() => generateProfileImage({
              displayName: profileData.display_name,
              username: profileData.username,
              elo: profileData.elo,
              rank,
              level: xp.level,
              gamesPlayed: profileData.games_played,
              totalScore: profileData.total_score,
              streakCurrent: profileData.streak_current,
              streakBest: profileData.streak_best,
              specialties,
              badges: profileData.badges,
            })}
            getText={() => profileShareText({
              displayName: profileData.display_name,
              username: profileData.username,
              elo: profileData.elo,
              rank,
              level: xp.level,
              streakCurrent: profileData.streak_current,
            })}
            label="Compartir perfil"
            className="inline-block border border-gold/40 text-gold text-sm font-bold px-4 py-1.5 rounded-lg hover:bg-gold hover:text-dark transition-colors"
          />
        </div>

        {/* XP Bar */}
        <div className="bg-dark-card rounded-xl border border-dark-border p-4">
          <div className="flex justify-between text-sm mb-1">
            <span>{xp.icon} {xp.name} <span className="text-text-secondary text-xs">(Nv {xp.level})</span></span>
            <span className="text-text-secondary">{xp.isMax ? 'MAX' : `${xp.current} / ${xp.needed} XP`}</span>
          </div>
          <div className="h-3 bg-dark-border/30 rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all" style={{ width: `${xp.percent}%` }} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Partidas', value: profileData.games_played },
            { label: 'Puntos', value: profileData.total_score },
            { label: 'Racha', value: profileData.streak_current },
          ].map(s => (
            <div key={s.label} className="bg-dark-card border border-dark-border rounded-xl p-3 text-center">
              <p className="text-2xl font-mono text-gold">{s.value}</p>
              <p className="text-xs text-text-secondary">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Streak */}
        {profileData.streak_best > 0 && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-bold">Mejor racha</p>
              <p className="text-xs text-text-secondary">{profileData.streak_best} días</p>
            </div>
            <p className="text-2xl font-mono text-gold">{profileData.streak_current}</p>
          </div>
        )}

        {/* Cinematographic identity */}
        {(specialties.length > 0 || weaknesses.length > 0 || favoriteDecade) && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-2">
            <h2 className="font-serif text-lg text-gold">Tu huella cinematográfica</h2>
            {specialties.length > 0 && (
              <p className="text-sm">Especialista en {specialties.join(' y ')}.</p>
            )}
            {favoriteDecade && (
              <p className="text-sm">Tu década fuerte es los {favoriteDecade}.</p>
            )}
            {weaknesses.length > 0 && (
              <p className="text-sm text-text-secondary">Todavía por descubrir: {weaknesses.join(', ')}.</p>
            )}
          </div>
        )}

        {/* Radar chart */}
        {genreStats.length >= 3 && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4">
            <h2 className="font-serif text-lg text-gold mb-3">Mapa de géneros</h2>
            <RadarChart data={genreStats} />
          </div>
        )}

        {/* Badges */}
        {profileData.badges && profileData.badges.length > 0 && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4">
            <h2 className="font-serif text-lg text-gold mb-3">Logros</h2>
            <div className="grid grid-cols-3 gap-3">
              {profileData.badges.map(b => (
                <div key={b.slug} className="text-center">
                  <div className="w-12 h-12 rounded-full bg-gold/10 border border-gold/30 mx-auto flex items-center justify-center text-lg font-bold text-gold">
                    {b.icon}
                  </div>
                  <p className="text-xs mt-1">{b.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Edit profile */}
        <button
          onClick={() => navigate('/onboarding')}
          className="w-full bg-dark-card border border-dark-border rounded-xl p-4 text-left hover:border-gold/50 transition-colors"
        >
          <p className="text-sm font-bold">Editar perfil</p>
          <p className="text-xs text-text-secondary">Cambiar username o nombre público</p>
        </button>

        {/* Duel preferences */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">Aceptar duelos</p>
              <p className="text-xs text-text-secondary">Otros jugadores pueden desafiarte</p>
            </div>
            <button
              onClick={handleToggleDuels}
              className={`relative w-12 h-7 rounded-full transition-colors ${duelsEnabled ? 'bg-gold' : 'bg-dark-border'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white transition-transform ${duelsEnabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>
        </div>

        {/* About link */}
        <button
          onClick={() => navigate('/about')}
          className="w-full text-text-secondary text-sm py-2 hover:text-gold transition-colors"
        >
          Sobre CineClue
        </button>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full text-text-secondary text-sm py-2 hover:text-error transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </AppShell>
  )
}
