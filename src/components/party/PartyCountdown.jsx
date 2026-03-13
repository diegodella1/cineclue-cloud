import { useState, useEffect } from 'react'
import { sfx } from '../../lib/sfx'

export default function PartyCountdown({ from = 3, onComplete }) {
  const [count, setCount] = useState(from)

  useEffect(() => {
    if (count <= 0) {
      sfx.play('go')
      onComplete?.()
      return
    }
    sfx.play('tick')
    const t = setTimeout(() => setCount(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count, onComplete])

  if (count <= 0) return null

  return (
    <div className="fixed inset-0 z-50 bg-dark/90 flex items-center justify-center">
      <span className="text-9xl font-serif text-gold animate-pop" key={count}>
        {count}
      </span>
    </div>
  )
}
