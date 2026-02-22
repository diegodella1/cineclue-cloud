import { CLUE_LABELS } from '../../lib/constants'

export default function DailyStats({ stats }) {
  if (!stats) return null

  const distribution = stats.distribution || []
  const maxCount = Math.max(...distribution.map(d => d.count), 1)

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-3">
      <h3 className="text-sm font-bold text-gold">Estadísticas de hoy</h3>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div>
          <p className="text-xl font-mono text-gold">{stats.total_players}</p>
          <p className="text-xs text-text-secondary">Jugaron</p>
        </div>
        <div>
          <p className="text-xl font-mono text-gold">{stats.guess_rate}%</p>
          <p className="text-xs text-text-secondary">Adivinaron</p>
        </div>
      </div>

      {distribution.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-text-secondary">Distribución de aciertos</p>
          {[0, 1, 2, 3, 4].map(clueIdx => {
            const d = distribution.find(x => x.clue === clueIdx)
            const count = d?.count || 0
            const width = maxCount > 0 ? (count / maxCount) * 100 : 0
            return (
              <div key={clueIdx} className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-secondary w-5">{clueIdx + 1}</span>
                <div className="flex-1 h-5 bg-dark-border/30 rounded overflow-hidden">
                  <div
                    className="h-full bg-gold/60 rounded flex items-center justify-end pr-1"
                    style={{ width: `${Math.max(width, count > 0 ? 10 : 0)}%` }}
                  >
                    {count > 0 && <span className="text-[10px] font-mono text-white">{count}</span>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
