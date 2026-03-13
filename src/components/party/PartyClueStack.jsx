import { CLUE_LABELS } from '../../lib/constants'

export default function PartyClueStack({ clues, currentClue }) {
  return (
    <div className="space-y-4">
      {clues.map((clue, i) => (
        <div
          key={i}
          className={`bg-dark-card border rounded-2xl p-6 animate-fadeIn ${
            i === currentClue ? 'border-gold/40 glow-gold' : 'border-dark-border/50'
          }`}
        >
          <p className={`text-text-secondary uppercase tracking-widest mb-2 ${
            i === currentClue ? 'text-sm' : 'text-xs'
          }`}>
            Pista {i + 1}: {CLUE_LABELS[i]}
          </p>
          {i === currentClue ? (
            <p className={`${i === 0 ? 'text-8xl' : 'text-4xl'} text-white leading-relaxed`}>
              {clue}
            </p>
          ) : (
            <p className={`${i === 0 ? 'text-4xl' : 'text-xl'} text-white opacity-40 leading-relaxed`}>
              {clue}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
