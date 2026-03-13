export default function PartyPodium({ rankings }) {
  if (!rankings?.length) return null

  const top3 = rankings.slice(0, 3)
  // Reorder for podium display: [2nd, 1st, 3rd]
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
      ? [top3[1], top3[0]]
      : [top3[0]]

  const podiumHeights = ['h-40', 'h-56', 'h-32']
  const podiumColors = ['border-gray-400', 'border-gold', 'border-amber-700']
  const medals = ['🥈', '🥇', '🥉']
  const staggerClasses = ['podium-stagger-2', 'podium-stagger-1', 'podium-stagger-3']

  return (
    <div className="flex items-end justify-center gap-8 py-10">
      {podiumOrder.map((player, i) => (
        <div key={player.player_id} className={`flex flex-col items-center gap-3 ${staggerClasses[i]}`}>
          <span className="text-8xl">{player.avatar}</span>
          <span className="text-2xl font-bold text-white text-center max-w-[180px] truncate">
            {player.display_name}
          </span>
          <span className="text-2xl font-mono text-gold">{player.total_score} pts</span>
          <div
            className={`w-40 ${podiumHeights[i] || 'h-28'} rounded-t-xl border-t-4 ${podiumColors[i] || 'border-dark-border'} bg-dark-card flex items-start justify-center pt-5`}
          >
            <span className="text-6xl">{medals[i]}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
