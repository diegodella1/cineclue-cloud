import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useProfile } from '../hooks/useProfile'
import { getEloRank } from '../lib/constants'
import { xpProgress } from '../lib/xp'
import AppShell from '../components/layout/AppShell'
import RadarChart from '../components/profile/RadarChart'
import Loading from '../components/shared/Loading'

export default function PublicProfile() {
  const { username } = useParams()
  const { profileData, loading, loadPublicProfile, getSpecialties, getWeaknesses, getFavoriteDecade, getGenreStats } = useProfile()

  useEffect(() => {
    if (username) loadPublicProfile(username)
  }, [username])

  if (loading) return <AppShell><Loading /></AppShell>

  if (!profileData) {
    return (
      <AppShell>
        <div className="min-h-dvh flex items-center justify-center">
          <p className="text-text-secondary">Usuario no encontrado</p>
        </div>
      </AppShell>
    )
  }

  const rank = getEloRank(profileData.elo)
  const xp = xpProgress(profileData.xp)
  const specialties = getSpecialties(profileData.category_stats)
  const weaknesses = getWeaknesses(profileData.category_stats)
  const favoriteDecade = getFavoriteDecade(profileData.category_stats)
  const genreStats = getGenreStats(profileData.category_stats)

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 rounded-full bg-dark-card border-2 border-gold mx-auto flex items-center justify-center text-3xl">
            {profileData.avatar_url ? (
              <img src={profileData.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : '🎬'}
          </div>
          <h1 className="font-bold text-xl">{profileData.display_name}</h1>
          <p className="text-text-secondary text-sm">@{profileData.username}</p>
          <p className="text-gold font-mono">{rank.icon} {rank.title} · {profileData.elo} PuntEmes</p>
        </div>

        <div className="bg-dark-card rounded-xl border border-dark-border p-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Nivel {xp.level}</span>
            <span className="text-text-secondary">{profileData.xp} XP</span>
          </div>
          <div className="h-3 bg-dark-border/30 rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full" style={{ width: `${xp.percent}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Partidas', value: profileData.games_played },
            { label: 'Puntos', value: profileData.total_score },
            { label: 'Mejor racha', value: profileData.streak_best },
          ].map(s => (
            <div key={s.label} className="bg-dark-card border border-dark-border rounded-xl p-3 text-center">
              <p className="text-2xl font-mono text-gold">{s.value}</p>
              <p className="text-xs text-text-secondary">{s.label}</p>
            </div>
          ))}
        </div>

        {(specialties.length > 0 || weaknesses.length > 0 || favoriteDecade) && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-2">
            <h2 className="font-serif text-lg text-gold">Huella cinematográfica</h2>
            {specialties.length > 0 && <p className="text-sm">Especialista en {specialties.join(' y ')}.</p>}
            {favoriteDecade && <p className="text-sm">Década fuerte: los {favoriteDecade}.</p>}
            {weaknesses.length > 0 && <p className="text-sm text-text-secondary">Por descubrir: {weaknesses.join(', ')}.</p>}
          </div>
        )}

        {genreStats.length >= 3 && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4">
            <h2 className="font-serif text-lg text-gold mb-3">Mapa de géneros</h2>
            <RadarChart data={genreStats} />
          </div>
        )}

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

        {/* CTA for non-logged users */}
        <div className="text-center bg-dark-card border border-gold/20 rounded-xl p-4">
          <p className="text-sm text-text-secondary mb-2">Cual es tu huella cinematográfica?</p>
          <a href="/auth" className="inline-block bg-gold text-dark font-bold py-2 px-6 rounded-lg hover:bg-gold-light transition-colors text-sm">
            Jugá gratis
          </a>
        </div>
      </div>
    </AppShell>
  )
}
