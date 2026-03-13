import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { usePartyStore } from '../stores/partyStore'
import { PARTY_AVATAR_EMOJIS } from '../lib/constants'
import AppShell from '../components/layout/AppShell'

export default function PartyJoin() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const joinRoom = usePartyStore(s => s.joinRoom)

  const paramCode = searchParams.get('code')?.toUpperCase() || ''
  const paramName = searchParams.get('name') || ''
  const paramAvatar = searchParams.get('avatar') || ''

  const [code, setCode] = useState(paramCode)
  const [name, setName] = useState(paramName)
  const [avatar, setAvatar] = useState(
    paramAvatar && PARTY_AVATAR_EMOJIS.includes(paramAvatar)
      ? paramAvatar
      : PARTY_AVATAR_EMOJIS[Math.floor(Math.random() * PARTY_AVATAR_EMOJIS.length)]
  )
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState('')
  const autoJoinAttempted = useRef(false)

  const doJoin = async (joinCode, joinName, joinAvatar) => {
    if (!joinCode || joinCode.length !== 4 || !joinName.trim()) return
    setJoining(true)
    setError('')
    try {
      await joinRoom(joinCode, joinName.trim(), joinAvatar)
      navigate(`/party/room/${joinCode}/player`)
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('Room not found')) setError('Sala no encontrada. Revisá el código.')
      else if (msg.includes('already started')) setError('El juego ya empezó.')
      else if (msg.includes('full')) setError('La sala está llena.')
      else setError('No se pudo unir a la sala.')
    } finally {
      setJoining(false)
    }
  }

  // Auto-join on mount if all params present (rematch flow)
  useEffect(() => {
    if (autoJoinAttempted.current) return
    if (paramCode && paramCode.length === 4 && paramName && paramAvatar) {
      autoJoinAttempted.current = true
      doJoin(paramCode, paramName, paramAvatar)
    }
  }, [])

  const handleJoin = async (e) => {
    e.preventDefault()
    await doJoin(code, name, avatar)
  }

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-6 page-enter">
        <div className="text-center">
          <h1 className="font-serif text-2xl text-gold">Unirme a la sala</h1>
        </div>

        <form onSubmit={handleJoin} className="space-y-5">
          {/* Code input */}
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Código de sala</label>
            <input
              type="text"
              maxLength={4}
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder="ABCD"
              className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3.5 text-center text-2xl font-mono text-gold tracking-[0.3em] placeholder-text-secondary/30 focus:outline-none focus:border-gold"
              autoFocus
            />
          </div>

          {/* Name input */}
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Tu nombre</label>
            <input
              type="text"
              maxLength={20}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Nombre"
              className="w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-sm text-white placeholder-text-secondary/50 focus:outline-none focus:border-gold"
            />
          </div>

          {/* Avatar picker */}
          <div>
            <label className="text-xs text-text-secondary mb-1.5 block">Tu avatar</label>
            <div className="grid grid-cols-8 gap-2">
              {PARTY_AVATAR_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatar(emoji)}
                  className={`text-2xl p-1.5 rounded-lg transition-all ${
                    avatar === emoji
                      ? 'bg-gold/20 border border-gold/40 scale-110'
                      : 'hover:bg-dark-card'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-error text-xs text-center animate-fadeIn">{error}</p>
          )}

          <button
            type="submit"
            disabled={joining || code.length !== 4 || !name.trim()}
            className="w-full bg-gold text-dark font-bold py-3.5 rounded-xl hover:bg-gold-light transition-colors disabled:opacity-50"
          >
            {joining ? 'Uniéndome...' : 'Unirme'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
