export default function PartyRanking({ rankings, highlightPlayerId, previousRankings, playerStreaks, compact, tv }) {
  if (!rankings?.length) return null

  return (
    <div className={compact ? 'space-y-1.5' : tv ? 'space-y-3' : 'space-y-2'}>
      {rankings.map((r, i) => {
        const isMe = r.player_id === highlightPlayerId
        const positionIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`

        // Position change arrow
        let arrow = null
        if (previousRankings?.length) {
          const prevIdx = previousRankings.findIndex(p => p.player_id === r.player_id)
          if (prevIdx >= 0 && prevIdx !== i) {
            arrow = prevIdx > i
              ? <span className="text-green-400 text-xs font-bold">↑</span>
              : <span className="text-red-400 text-xs font-bold">↓</span>
          }
        }

        // Streak fire
        const streak = playerStreaks?.[r.player_id] || 0

        return (
          <div
            key={r.player_id}
            className={`flex items-center gap-3 rounded-xl transition-all ${
              compact ? 'px-3 py-2' : tv ? 'px-6 py-4' : 'px-4 py-3'
            } ${
              isMe ? 'bg-gold/15 border border-gold/30' : 'bg-dark-card/60'
            }`}
          >
            <span className={`text-center ${compact ? 'w-8 text-sm' : tv ? 'w-12 text-2xl' : 'w-10 text-xl'}`}>{positionIcon}</span>
            {arrow && <span className={tv ? 'text-lg' : 'text-sm'}>{arrow}</span>}
            <span className={compact ? 'text-lg' : tv ? 'text-3xl' : 'text-2xl'}>{r.avatar}</span>
            <span className={`flex-1 font-bold truncate ${compact ? 'text-sm' : tv ? 'text-xl' : 'text-lg'} ${isMe ? 'text-gold' : 'text-white'}`}>
              {r.display_name}
              {streak >= 3 && ' 🔥'}
            </span>
            <span className={`font-mono text-gold ${compact ? 'text-sm' : tv ? 'text-2xl' : 'text-xl'}`}>{r.total_score}</span>
          </div>
        )
      })}
    </div>
  )
}
