import { useState, useEffect } from 'react'

export default function PartyTimerBar({ duration, startedAt, onExpire }) {
  const [progress, setProgress] = useState(1)
  const [seconds, setSeconds] = useState(duration || 0)

  useEffect(() => {
    if (!duration || !startedAt) return
    const totalMs = duration * 1000
    const interval = setInterval(() => {
      const elapsed = Date.now() - startedAt
      const remaining = Math.max(0, 1 - elapsed / totalMs)
      setProgress(remaining)
      setSeconds(Math.ceil(remaining * duration))
      if (remaining <= 0) {
        clearInterval(interval)
        onExpire?.()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [duration, startedAt, onExpire])

  const color = progress > 0.5 ? '#4caf50' : progress > 0.2 ? '#d4af37' : '#e53935'
  const isLow = seconds <= 5

  return (
    <div className="flex items-center gap-3">
      <div className="timer-bar flex-1">
        <div
          className="timer-bar-fill"
          style={{
            width: `${progress * 100}%`,
            backgroundColor: color,
            color: color,
          }}
        />
      </div>
      <span className={`font-mono text-lg min-w-[2ch] text-right ${isLow ? 'text-error timer-pulse' : 'text-text-secondary'}`}>
        {seconds}
      </span>
    </div>
  )
}
