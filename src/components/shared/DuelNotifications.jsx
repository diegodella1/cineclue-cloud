import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { supabase } from '../../lib/supabase'

const POLL_INTERVAL = 60_000

export default function DuelNotifications() {
  const user = useAuthStore(s => s.user)
  const [notifications, setNotifications] = useState([])
  const [dismissed, setDismissed] = useState(new Set())
  const navigate = useNavigate()
  const intervalRef = useRef(null)
  const prevUrgentRef = useRef(new Set())

  const setPendingDuels = useAuthStore(s => s.setPendingDuels)

  const fetchNotifications = async () => {
    if (!user) return
    const { data, error } = await supabase.rpc('cc_get_duel_notifications', { p_user_id: user.id })
    if (error) {
      console.error('DuelNotifications poll error:', error)
      return
    }
    const list = Array.isArray(data) ? data : []
    setNotifications(list)
    setPendingDuels(list.length)
  }

  useEffect(() => {
    if (!user) return
    fetchNotifications()
    intervalRef.current = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => clearInterval(intervalRef.current)
  }, [user])

  useEffect(() => {
    const newUrgent = new Set()
    notifications.forEach(n => { if (n.urgent) newUrgent.add(n.id) })
    newUrgent.forEach(id => {
      if (!prevUrgentRef.current.has(id)) {
        setDismissed(d => { const s = new Set(d); s.delete(id); return s })
        if (navigator.vibrate) navigator.vibrate([100, 50, 100])
      }
    })
    prevUrgentRef.current = newUrgent
  }, [notifications])

  const handleDismiss = (id) => {
    setDismissed(d => new Set(d).add(id))
  }

  const visible = notifications.filter(n => !dismissed.has(n.id))
  if (visible.length === 0) return null

  return (
    <div className="fixed top-4 left-4 right-4 z-[55] space-y-2 pointer-events-none max-w-[600px] mx-auto">
      {visible.map(n => (
        <div
          key={n.id}
          className={`pointer-events-auto animate-slide-up rounded-xl border p-4 backdrop-blur-md shadow-lg ${
            n.urgent
              ? 'bg-error/90 border-error animate-pulse-border'
              : 'bg-dark-card/95 border-gold/40'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0 text-xl">{n.urgent ? '!' : '?'}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">
                {n.urgent ? 'Duelo por vencer' : 'Duelo pendiente'}
              </p>
              <p className="text-xs text-white/80 mt-0.5">
                {n.challenger_display_name} te desafió
                {n.urgent
                  ? ` — ${n.minutes_left} min`
                  : ` — ${Math.floor(n.minutes_left / 60)}h ${n.minutes_left % 60}m`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate(`/duel/play?id=${n.id}`)}
                className={`text-xs font-bold px-4 py-2 rounded-lg transition-colors ${
                  n.urgent
                    ? 'bg-white text-error hover:bg-white/90'
                    : 'bg-gold text-dark hover:bg-gold-light'
                }`}
              >
                Jugar
              </button>
              <button
                onClick={() => handleDismiss(n.id)}
                className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white rounded-lg hover:bg-white/10 transition-colors text-lg"
                aria-label="Cerrar"
              >
                x
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
