import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import AppShell from '../components/layout/AppShell'

export default function Onboarding() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const profile = useAuthStore(s => s.profile)
  const updateProfile = useAuthStore(s => s.updateProfile)

  const isEditing = profile && !profile.username.startsWith('user_')
  const [username, setUsername] = useState(isEditing ? profile.username : '')
  const [displayName, setDisplayName] = useState(profile?.display_name || '')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState(isEditing ? true : null)
  const [loading, setLoading] = useState(false)

  const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/

  useEffect(() => {
    if (!username || !usernameRegex.test(username)) {
      setAvailable(null)
      return
    }
    // If editing and username didn't change, it's available
    if (isEditing && username.toLowerCase() === profile.username.toLowerCase()) {
      setAvailable(true)
      return
    }
    const timeout = setTimeout(async () => {
      setChecking(true)
      const { data } = await supabase
        .from('cc_profiles')
        .select('id')
        .eq('username', username.toLowerCase())
        .maybeSingle()
      // Available if no result, or if the result is our own profile
      setAvailable(!data || data.id === user?.id)
      setChecking(false)
    }, 400)
    return () => clearTimeout(timeout)
  }, [username])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!available || !displayName.trim()) return
    setLoading(true)
    setError('')
    const { error: err } = await updateProfile({
      username: username.toLowerCase(),
      display_name: displayName.trim(),
    })
    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }
    navigate('/home')
  }

  return (
    <AppShell>
      <div className="min-h-dvh flex flex-col items-center justify-center">
        <h1 className="font-serif text-3xl italic text-gold mb-2">
          {isEditing ? 'Editar perfil' : 'Elegí tu identidad'}
        </h1>
        <p className="text-text-secondary mb-8">Tu nombre público en CineClue</p>

        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <div>
            <label className="text-sm text-text-secondary mb-1 block">Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">@</span>
              <input
                type="text"
                inputMode="text"
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="cinefilo_99"
                maxLength={20}
                className={`w-full bg-dark-card border rounded-xl pl-8 pr-4 py-3.5 text-white placeholder-text-secondary focus:outline-none transition-all ${
                  username && available ? 'border-success/50 focus:border-success' :
                  username && available === false ? 'border-error/50 focus:border-error' :
                  'border-dark-border focus:border-gold focus:shadow-[0_0_0_1px_rgba(212,175,55,0.3)]'
                }`}
              />
            </div>
            <p className={`text-xs mt-1.5 h-4 ${
              !username ? 'text-text-secondary/50' :
              !usernameRegex.test(username) ? 'text-error' :
              checking ? 'text-text-secondary' :
              available ? 'text-success' : 'text-error'
            }`}>
              {!username ? 'Letras, números, guión, guión bajo' :
               !usernameRegex.test(username) ? '3-20 caracteres: letras, números, _ y -' :
               checking ? 'Verificando disponibilidad...' :
               available ? 'Disponible' : 'Ya está tomado'}
            </p>
          </div>

          <div>
            <label className="text-sm text-text-secondary mb-1 block">Nombre público</label>
            <input
              type="text"
              inputMode="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Tu nombre"
              maxLength={40}
              className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-white placeholder-text-secondary focus:outline-none focus:border-gold focus:shadow-[0_0_0_1px_rgba(212,175,55,0.3)] transition-all"
            />
          </div>

          {error && (
            <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 animate-fadeIn">
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !available || !displayName.trim()}
            className="w-full bg-gold text-dark font-bold py-3.5 rounded-xl hover:bg-gold-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:saturate-50"
          >
            {loading ? 'Guardando...' : isEditing ? 'Guardar cambios' : 'Empezar a jugar'}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full text-text-secondary text-sm py-2 hover:text-white transition-colors"
            >
              Cancelar
            </button>
          )}
        </form>
      </div>
    </AppShell>
  )
}
