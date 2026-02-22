import { useMissions } from '../hooks/useMissions'
import AppShell from '../components/layout/AppShell'

import Loading from '../components/shared/Loading'

export default function Missions() {
  const { weeklyMissions, permanentMissions, loading, tab, setTab } = useMissions()

  const displayMissions = tab === 'weekly' ? weeklyMissions : permanentMissions

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-4">
        <h1 className="font-serif text-2xl text-gold">Misiones</h1>

        <div className="flex gap-2">
          <button
            onClick={() => setTab('weekly')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === 'weekly' ? 'bg-gold text-dark' : 'bg-dark-card text-text-secondary border border-dark-border'
            }`}
          >
            Semanales
          </button>
          <button
            onClick={() => setTab('permanent')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tab === 'permanent' ? 'bg-gold text-dark' : 'bg-dark-card text-text-secondary border border-dark-border'
            }`}
          >
            Permanentes
          </button>
        </div>

        {loading ? <Loading /> : (
          <div className="space-y-3">
            {displayMissions.length === 0 ? (
              <p className="text-text-secondary text-center py-8">No hay misiones</p>
            ) : displayMissions.map(m => (
              <div key={m.id} className={`bg-dark-card border rounded-xl p-4 transition-all ${
                m.completed ? 'border-success/30 opacity-70' : 'border-dark-border'
              }`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className={`font-bold text-sm ${m.completed ? 'text-success' : 'text-white'}`}>
                      {m.completed ? '✓ ' : ''}{m.title}
                    </h3>
                    <p className="text-xs text-text-secondary">{m.description}</p>
                  </div>
                  <span className="text-xs font-mono text-gold">+{m.reward_xp} XP</span>
                </div>

                {/* Progress bar */}
                <div className="mt-2">
                  <div className="flex justify-between text-xs text-text-secondary mb-1">
                    <span>{m.progress} / {m.target}</span>
                    <span>{Math.round((m.progress / m.target) * 100)}%</span>
                  </div>
                  <div className="h-2 bg-dark-border/30 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${m.completed ? 'bg-success' : 'bg-gold'}`}
                      style={{ width: `${Math.min((m.progress / m.target) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
