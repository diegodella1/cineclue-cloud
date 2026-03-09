import { useState, useRef, useEffect } from 'react'

export default function GuessInput({ onGuess, onSkip, onReveal, canReveal, shaking, disabled }) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  // Prevent iOS Safari from auto-opening keyboard when this component mounts
  // (happens when transitioning from RoundResult back to the game)
  useEffect(() => {
    const t = setTimeout(() => {
      if (inputRef.current) inputRef.current.blur()
    }, 50)
    return () => clearTimeout(t)
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!value.trim() || disabled || submitting) return
    setSubmitting(true)
    const correct = onGuess(value.trim())
    if (correct) {
      setValue('')
    } else {
      if (navigator.vibrate) navigator.vibrate([40, 30, 40])
    }
    // Small delay to prevent rapid re-submits
    setTimeout(() => setSubmitting(false), 200)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        spellCheck="false"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Nombre de la película"
        maxLength={100}
        disabled={disabled}
        className={`w-full bg-dark-card border rounded-xl px-4 py-3.5 text-white placeholder-text-secondary focus:outline-none transition-all ${
          shaking ? 'animate-shake border-error' : 'border-dark-border focus:border-gold focus:shadow-[0_0_0_1px_rgba(212,175,55,0.3)]'
        }`}
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className="flex-1 bg-gold text-dark font-bold py-3.5 rounded-xl hover:bg-gold-light transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:saturate-50"
        >
          Adivinar
        </button>
        {canReveal && (
          <button
            type="button"
            onClick={onReveal}
            disabled={disabled}
            className="flex-1 border border-dark-border text-text-secondary py-3.5 rounded-xl hover:border-gold/50 hover:text-white transition-all disabled:opacity-40"
          >
            Siguiente pista
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        className="w-full text-text-secondary/60 text-sm py-2 hover:text-text-secondary transition-colors disabled:opacity-40"
      >
        No la sé, pasar
      </button>
    </form>
  )
}
