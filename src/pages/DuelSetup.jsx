import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useDuelHub } from '../hooks/useDuelHub'
import { getEloRank } from '../lib/constants'
import AppShell from '../components/layout/AppShell'

import Loading from '../components/shared/Loading'

function TimeLeft({ expiresAt }) {
  const diff = new Date(expiresAt) - Date.now()
  if (diff <= 0) return <span className="text-error text-xs">Expirado</span>
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return <span className="text-text-secondary text-xs">{h}h {m}m</span>
}

function UserCard({ user, onSelect }) {
  const rank = getEloRank(user.elo)
  const disabled = user.duels_enabled === false
  return (
    <button
      onClick={() => !disabled && onSelect(user)}
      disabled={disabled}
      className={`w-full flex items-center gap-3 bg-dark-card border border-dark-border rounded-xl p-3 transition-colors text-left ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gold/50'
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-dark-border flex items-center justify-center text-lg shrink-0">
        {user.avatar_url ? (
          <img src={user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : '🎬'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-bold truncate">{user.display_name}</p>
        <p className="text-text-secondary text-xs">@{user.username}</p>
        {disabled && <p className="text-error text-xs">No acepta duelos</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-gold text-xs font-mono">{rank.icon} {user.elo}</p>
        <p className="text-text-secondary text-xs">Nv. {user.level}</p>
      </div>
    </button>
  )
}

function DuelCard({ duel, userId, onPlay, onView }) {
  const isChallenger = duel.challenger.id === userId
  const rival = isChallenger ? duel.opponent : duel.challenger
  const status = duel.duel_status

  const statusIcon = { pending: '⚔️', sent: '⏳', completed: duel.winner_id === userId ? '✅' : duel.winner_id === null ? '🤝' : '❌', expired: '⏰' }
  const statusLabel = {
    pending: 'Te desafió',
    sent: 'Esperando',
    completed: duel.winner_id === userId ? 'Ganaste' : duel.winner_id === null ? 'Empate' : 'Perdiste',
    expired: 'Expirado',
  }
  const statusColor = {
    pending: 'text-gold',
    sent: 'text-text-secondary',
    completed: duel.winner_id === userId ? 'text-success' : duel.winner_id === null ? 'text-gold' : 'text-error',
    expired: 'text-text-secondary',
  }

  return (
    <div className="bg-dark-card border border-dark-border rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-dark-border flex items-center justify-center text-sm">
            {rival.avatar_url ? (
              <img src={rival.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : '🎬'}
          </div>
          <div>
            <p className="text-white text-sm font-bold">{rival.display_name}</p>
            <p className="text-text-secondary text-xs">@{rival.username}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-xs font-bold ${statusColor[status]}`}>{statusIcon[status]} {statusLabel[status]}</p>
          {status === 'sent' && <TimeLeft expiresAt={duel.expires_at} />}
        </div>
      </div>

      {status === 'completed' && (
        <div className="flex justify-between items-center text-sm pt-1">
          <span className="text-text-secondary">
            {duel.challenger.username}: <span className="text-gold font-mono">{duel.challenger_score}</span>
          </span>
          <span className="text-text-secondary">
            {duel.opponent.username}: <span className="text-gold font-mono">{duel.opponent_score}</span>
          </span>
        </div>
      )}

      {status === 'expired' && (
        <p className="text-text-secondary text-xs">
          {isChallenger
            ? `${rival.display_name} no respondió`
            : 'No respondiste a tiempo'}
        </p>
      )}

      {status === 'pending' && (
        <button
          onClick={() => onPlay(duel.id)}
          className="w-full bg-gold text-dark font-bold py-2 rounded-lg text-sm hover:bg-gold-light transition-colors"
        >
          Jugar
        </button>
      )}
      {status === 'completed' && (
        <button
          onClick={() => onView(duel.id)}
          className="w-full border border-dark-border text-text-secondary py-2 rounded-lg text-sm hover:text-white transition-colors"
        >
          Ver detalle
        </button>
      )}
    </div>
  )
}

export default function DuelSetup() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const {
    duels, loadingDuels, loadDuels,
    searchResults, searching, searchUsers, setSearchResults,
  } = useDuelHub(user?.id)

  useEffect(() => {
    if (user) loadDuels()
  }, [user])

  const handleSearch = (q) => {
    setSearchQuery(q)
    searchUsers(q)
  }

  const handleSelectUser = (u) => {
    navigate(`/duel/play?opponent=${encodeURIComponent(u.username)}`)
  }

  const handlePlay = (duelId) => {
    navigate(`/duel/play?id=${duelId}`)
  }

  const handleView = (duelId) => {
    navigate(`/duel/play?id=${duelId}&view=1`)
  }

  const pending = duels.filter(d => d.duel_status === 'pending')
  const sent = duels.filter(d => d.duel_status === 'sent')
  const completed = duels.filter(d => d.duel_status === 'completed')
  const expired = duels.filter(d => d.duel_status === 'expired')

  return (
    <AppShell>
      <div className="pt-6 pb-24 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-serif text-2xl text-gold">Duelos</h1>
          <button
            onClick={() => { setShowSearch(!showSearch); setSearchQuery(''); setSearchResults([]) }}
            className="bg-gold text-dark font-bold px-4 py-2 rounded-lg text-sm hover:bg-gold-light transition-colors"
          >
            {showSearch ? 'Cancelar' : 'Nuevo Desafío'}
          </button>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="space-y-3 animate-fadeIn">
            <div className="relative">
              <input
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Buscar por username o nombre..."
                autoFocus
                className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 pr-10 text-white placeholder-text-secondary focus:outline-none focus:border-gold focus:shadow-[0_0_0_1px_rgba(212,175,55,0.3)] transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-text-secondary hover:text-white rounded-full hover:bg-white/10 transition-colors text-sm"
                  aria-label="Limpiar búsqueda"
                >
                  x
                </button>
              )}
            </div>
            {searching && <p className="text-text-secondary text-sm text-center">Buscando...</p>}
            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(u => (
                  <UserCard key={u.id} user={u} onSelect={handleSelectUser} />
                ))}
              </div>
            )}
            {searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
              <p className="text-text-secondary text-sm text-center">No se encontraron usuarios</p>
            )}
          </div>
        )}

        {loadingDuels && <Loading />}

        {!loadingDuels && !showSearch && duels.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <p className="text-4xl">🎬</p>
            <p className="text-text-secondary">No tenés duelos todavía</p>
            <p className="text-text-secondary text-sm">Tocá "Nuevo Desafío" para buscar un oponente</p>
          </div>
        )}

        {!showSearch && (
          <>
            {/* Pending */}
            {pending.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-gold uppercase tracking-wider">
                  Pendientes ({pending.length})
                </h2>
                {pending.map(d => (
                  <DuelCard key={d.id} duel={d} userId={user.id} onPlay={handlePlay} onView={handleView} />
                ))}
              </section>
            )}

            {/* Sent */}
            {sent.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
                  Enviados ({sent.length})
                </h2>
                {sent.map(d => (
                  <DuelCard key={d.id} duel={d} userId={user.id} onPlay={handlePlay} onView={handleView} />
                ))}
              </section>
            )}

            {/* Completed */}
            {completed.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
                  Completados ({completed.length})
                </h2>
                {completed.map(d => (
                  <DuelCard key={d.id} duel={d} userId={user.id} onPlay={handlePlay} onView={handleView} />
                ))}
              </section>
            )}

            {/* Expired */}
            {expired.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider">
                  Expirados ({expired.length})
                </h2>
                {expired.map(d => (
                  <DuelCard key={d.id} duel={d} userId={user.id} onPlay={handlePlay} onView={handleView} />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}
