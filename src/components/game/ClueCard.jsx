import { CLUE_LABELS, POINTS_BY_CLUE } from '../../lib/constants'

const POINT_COLORS = ['text-success', 'text-success/80', 'text-gold', 'text-gold/70', 'text-text-secondary']

export default function ClueCard({ clues, currentClue }) {
  return (
    <div className="space-y-2.5">
      {clues.map((clue, i) => {
        const revealed = i <= currentClue
        const isCurrent = i === currentClue
        return (
          <div
            key={i}
            role={isCurrent ? 'status' : undefined}
            aria-live={isCurrent ? 'polite' : undefined}
            className={`rounded-xl p-4 transition-all duration-300 ${
              isCurrent
                ? 'bg-dark-card border border-gold/30 glow-gold scale-[1.01]'
                : revealed
                  ? 'bg-dark-card/50 border border-dark-border/60 opacity-50'
                  : 'bg-dark-card/20 border border-dark-border/20 opacity-25'
            }`}
          >
            <div className="flex justify-between items-center mb-1.5">
              <span className={`text-xs font-mono ${isCurrent ? 'text-gold' : 'text-text-secondary'}`}>
                Pista {i + 1} — {CLUE_LABELS[i]}
              </span>
              <span className={`text-xs font-mono font-bold ${isCurrent ? POINT_COLORS[i] : 'text-text-secondary'}`}>
                {POINTS_BY_CLUE[i]} pts
              </span>
            </div>
            {revealed ? (
              <p className={`leading-relaxed ${i === 0 ? 'text-3xl tracking-wider text-center py-2' : 'text-sm'}`}>
                {clue}
              </p>
            ) : (
              <p className="text-sm text-text-secondary/40">???</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
