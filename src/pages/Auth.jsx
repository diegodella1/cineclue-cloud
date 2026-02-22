import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { signIn, signUp, signInWithGoogle } from '../lib/auth'
import { useAuthStore } from '../stores/authStore'
import AppShell from '../components/layout/AppShell'

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  // Redirect when user state is set (after login or if already logged in)
  useEffect(() => {
    if (user) navigate('/home', { replace: true })
  }, [user])

  const handleGoogle = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(err.message)
      setGoogleLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isSignUp) {
        await signUp(email, password)
      } else {
        await signIn(email, password)
      }
      // onAuthStateChange handles user/profile state → useEffect navigates
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <AppShell>
      <div className="min-h-dvh flex flex-col items-center justify-center">
        <h1 className="font-serif text-4xl italic text-gold mb-2">CineClue</h1>
        <p className="text-text-secondary mb-8">Trivia de cine con identidad</p>

        <div className="w-full max-w-sm space-y-4">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {googleLoading ? 'Redirigiendo...' : 'Continuar con Google'}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-dark-border"></div>
            <span className="text-text-secondary text-sm">o con email</span>
            <div className="flex-1 h-px bg-dark-border"></div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-white placeholder-text-secondary focus:outline-none focus:border-gold focus:shadow-[0_0_0_1px_rgba(212,175,55,0.3)] transition-all"
          />
          <input
            type="password"
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignUp ? 'Contraseña (mín. 6 caracteres)' : 'Contraseña'}
            required
            minLength={6}
            className="w-full bg-dark-card border border-dark-border rounded-xl px-4 py-3.5 text-white placeholder-text-secondary focus:outline-none focus:border-gold focus:shadow-[0_0_0_1px_rgba(212,175,55,0.3)] transition-all"
          />

          {error && (
            <div className="bg-error/10 border border-error/30 rounded-xl px-4 py-3 animate-fadeIn">
              <p className="text-error text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-dark font-bold py-3.5 rounded-xl hover:bg-gold-light transition-colors disabled:opacity-50 disabled:saturate-50"
          >
            {loading ? 'Cargando...' : isSignUp ? 'Crear cuenta' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={() => { setIsSignUp(!isSignUp); setError('') }}
            className="w-full text-text-secondary text-sm py-2 hover:text-white transition-colors"
          >
            {isSignUp ? 'Ya tengo cuenta' : 'Crear cuenta nueva'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
