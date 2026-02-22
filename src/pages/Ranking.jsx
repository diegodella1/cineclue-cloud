import { useNavigate } from 'react-router-dom'
import { useRanking } from '../hooks/useRanking'
import { getEloRank } from '../lib/constants'
import AppShell from '../components/layout/AppShell'

import Loading from '../components/shared/Loading'

export default function Ranking() {
  const navigate = useNavigate()
  const { ranking, userPosition, weekStart, total, hallOfFame, loading, tab, setTab } = useRanking()

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-4">
        <h1 className="font-serif text-2xl text-gold">Ranking</h1>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setTab('current')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === 'current' ? 'bg-gold text-dark' : 'bg-dark-card text-text-secondary border border-dark-border'
            }`}
          >
            Esta Semana
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === 'history' ? 'bg-gold text-dark' : 'bg-dark-card text-text-secondary border border-dark-border'
            }`}
          >
            Histórico
          </button>
        </div>

        {loading ? <Loading /> : tab === 'current' ? (
          <>
            {ranking.length === 0 ? (
              <p className="text-text-secondary text-center py-8">Nadie jugó esta semana todavía</p>
            ) : (
              <div className="bg-dark-card rounded-xl border border-dark-border overflow-hidden">
                {ranking.map((r, i) => {
                  const rank = getEloRank(r.elo)
                  return (
                    <button key={r.user_id} onClick={() => navigate(`/u/${r.username}`)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors ${i > 0 ? 'border-t border-dark-border' : ''}`}>
                      <span className={`w-7 text-center font-mono text-sm ${
                        r.position === 1 ? 'text-gold' : r.position === 2 ? 'text-gray-300' : r.position === 3 ? 'text-amber-600' : 'text-text-secondary'
                      }`}>
                        {r.position <= 3 ? ['', '🥇', '🥈', '🥉'][r.position] : r.position}
                      </span>
                      <div className="w-8 h-8 rounded-full bg-dark-border flex items-center justify-center text-sm">
                        {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-full h-full rounded-full object-cover" /> : '🎬'}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <p className="text-sm font-bold truncate">{r.display_name}</p>
                        <p className="text-xs text-text-secondary">@{r.username}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-mono text-gold">{rank.icon} {r.elo}</p>
                        <p className="text-xs text-text-secondary">{r.score} pts</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* User position sticky */}
            {userPosition && (
              <div className="bg-dark-card border border-gold/30 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Tu posición</p>
                  <p className="text-xs text-text-secondary">#{userPosition.position} de {total}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-gold">{userPosition.elo} PuntEmes</p>
                  <p className="text-xs text-text-secondary">{userPosition.score} pts</p>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Hall of Fame */
          hallOfFame.length === 0 ? (
            <p className="text-text-secondary text-center py-8">Sin historial todavía</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(
                hallOfFame.reduce((acc, h) => {
                  const key = h.week_start
                  if (!acc[key]) acc[key] = []
                  acc[key].push(h)
                  return acc
                }, {})
              ).map(([week, entries]) => (
                <div key={week} className="bg-dark-card rounded-xl border border-dark-border p-4">
                  <p className="text-xs text-text-secondary mb-2">Semana del {new Date(week).toLocaleDateString('es-AR')}</p>
                  {entries.map(e => (
                    <div key={e.id} className="flex items-center gap-2 py-1">
                      <span className="text-sm">{['', '🥇', '🥈', '🥉'][Math.min(e.position, 3)]}</span>
                      <span className="text-sm flex-1">{e.cc_profiles?.display_name || 'Usuario'}</span>
                      <span className="text-xs font-mono text-gold">{e.elo} PuntEmes</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </AppShell>
  )
}
