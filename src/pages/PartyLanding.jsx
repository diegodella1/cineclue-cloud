import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePartyStore } from '../stores/partyStore'
import { useAuthStore } from '../stores/authStore'
import AppShell from '../components/layout/AppShell'

export default function PartyLanding() {
  const navigate = useNavigate()
  const createRoom = usePartyStore(s => s.createRoom)
  const user = useAuthStore(s => s.user)
  const [numRounds, setNumRounds] = useState(5)
  const [maxPlayers, setMaxPlayers] = useState(20)
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      const result = await createRoom(numRounds, user?.id || null, autoAdvance, maxPlayers)
      navigate(`/party/room/${result.code}/host`)
    } catch (e) {
      alert(e.message || 'Error al crear sala')
    } finally {
      setCreating(false)
    }
  }

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-6 page-enter">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="font-serif text-3xl text-gold">Party Mode</h1>
          <p className="text-text-secondary text-sm">Jugá con amigos en la misma sala. Proyectá en la tele y que cada uno juegue desde su celular.</p>
        </div>

        {/* Create room */}
        <div className="bg-dark-card border border-gold/20 rounded-xl p-5 space-y-4 glow-gold">
          <h2 className="font-serif text-lg text-gold">Crear sala</h2>
          <div>
            <p className="text-xs text-text-secondary mb-2">Cantidad de películas</p>
            <div className="flex gap-2">
              {[5, 10, 15].map(n => (
                <button
                  key={n}
                  onClick={() => setNumRounds(n)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                    numRounds === n
                      ? 'bg-gold text-dark'
                      : 'bg-dark border border-dark-border text-text-secondary hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-text-secondary mb-2">Máximo de jugadores</p>
            <div className="flex gap-2">
              {[5, 10, 20, 50].map(n => (
                <button
                  key={n}
                  onClick={() => setMaxPlayers(n)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors ${
                    maxPlayers === n
                      ? 'bg-gold text-dark'
                      : 'bg-dark border border-dark-border text-text-secondary hover:text-white'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setAutoAdvance(!autoAdvance)}
              className={`w-11 h-6 rounded-full transition-colors relative ${autoAdvance ? 'bg-gold' : 'bg-dark-border'}`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${autoAdvance ? 'translate-x-5' : ''}`} />
            </div>
            <div>
              <span className="text-sm text-white">Avance automático</span>
              <p className="text-xs text-text-secondary">Pasa a la siguiente peli sin tocar botón</p>
            </div>
          </label>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full bg-gold text-dark font-bold py-3.5 rounded-xl hover:bg-gold-light transition-colors disabled:opacity-50"
          >
            {creating ? 'Creando...' : 'Crear sala'}
          </button>
        </div>

        {/* Join room */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-5 space-y-3">
          <h2 className="font-serif text-lg text-gold">Unirme a una sala</h2>
          <p className="text-text-secondary text-xs">Ingresá el código de 4 letras que aparece en pantalla.</p>
          <button
            onClick={() => navigate('/party/join')}
            className="w-full border border-gold text-gold font-bold py-3.5 rounded-xl hover:bg-gold hover:text-dark transition-colors"
          >
            Unirme
          </button>
        </div>

        {/* How it works */}
        <div className="space-y-3 px-1">
          <h3 className="font-serif text-sm text-gold">Cómo funciona</h3>
          <div className="space-y-2 text-xs text-text-secondary">
            <p>1. Creá una sala y proyectá la pantalla del host en la tele.</p>
            <p>2. Los jugadores escanean el QR o ingresan el código desde su celular.</p>
            <p>3. Aparecen las pistas en la tele. Cada jugador responde desde su celular.</p>
            <p>4. Cuanto más rápido adivinás, más puntos sumás.</p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
