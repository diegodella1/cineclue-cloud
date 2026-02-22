export default function RoundResult({ result, onNext }) {
  const diffColors = {
    'fácil': 'text-success',
    'medio': 'text-gold',
    'difícil': 'text-error',
  }

  return (
    <div className="animate-fadeIn text-center space-y-4 py-4">
      {result.guessed ? (
        <div className="space-y-1">
          <p className="text-5xl animate-pop">
            {result.points_earned >= 4 ? '🎯' : result.points_earned >= 2 ? '👏' : '😅'}
          </p>
          <p className="text-success text-lg font-bold">Correcto!</p>
          <p className="text-gold text-4xl font-mono font-bold animate-pop">+{result.points_earned} pts</p>
        </div>
      ) : (
        <div className="space-y-1">
          <p className="text-4xl">🎬</p>
          <p className="text-text-secondary text-lg">No era esta vez</p>
        </div>
      )}

      <h2 className="text-2xl font-serif text-gold">{result.title}</h2>

      <span className={`inline-block text-xs font-mono px-3 py-1 rounded-full border border-dark-border ${diffColors[result.diff]}`}>
        {result.diff.toUpperCase()}
      </span>

      <div>
        <a
          href={`https://letterboxd.com/film/${result.lb}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gold-light text-sm hover:underline"
        >
          {result.guessed ? 'Ver en Letterboxd' : 'Descubrila en Letterboxd'}
        </a>
      </div>

      <button
        onClick={onNext}
        className="w-full bg-gold text-dark font-bold py-3.5 rounded-xl hover:bg-gold-light transition-colors mt-2"
      >
        Siguiente
      </button>
    </div>
  )
}
