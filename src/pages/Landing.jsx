import { useNavigate, Navigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import AppShell from '../components/layout/AppShell'

export default function Landing() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  if (user) {
    return <Navigate to="/home" replace />
  }

  return (
    <AppShell>
      <div className="min-h-dvh flex flex-col items-center justify-center text-center px-4">
        {/* Logo */}
        <h1 className="font-serif text-5xl italic text-gold mb-3">CineClue</h1>
        <p className="text-text-secondary text-lg mb-2">Trivia de cine con identidad</p>
        <p className="text-text-secondary text-sm mb-10 max-w-sm">
          Adivina peliculas a partir de 5 pistas. Construi tu perfil cinematografico, competi en el ranking semanal y descubri que tipo de cinefilo sos.
        </p>

        {/* Features */}
        <div className="grid grid-cols-1 gap-4 w-full max-w-sm mb-10">
          {[
            { title: 'Peli del Dia', desc: 'Una pelicula por dia, igual para todos. Estilo Wordle.' },
            { title: 'PuntEmes + Ranking', desc: 'Rating real. Competi cada semana contra otros cinéfilos.' },
            { title: 'Huella cinematográfica', desc: 'Tu perfil muestra en qué generos y decadas sos experto.' },
          ].map(f => (
            <div key={f.title} className="bg-dark-card border border-dark-border rounded-xl p-4 text-left">
              <h3 className="font-bold text-gold text-sm mb-1">{f.title}</h3>
              <p className="text-text-secondary text-xs">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* Party Mode — no requiere cuenta */}
        <div className="w-full max-w-sm bg-dark-card border border-dark-border rounded-xl p-4 mb-6 text-left">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🎉</span>
            <h3 className="font-bold text-gold text-sm">Party Mode</h3>
          </div>
          <p className="text-text-secondary text-xs mb-3">Jugá con amigos en la tele. Sin necesidad de cuenta.</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => navigate('/party')}
              className="bg-gold text-dark font-bold py-2 rounded-lg text-xs hover:bg-gold-light transition-colors"
            >
              Crear sala
            </button>
            <button
              onClick={() => navigate('/party/join')}
              className="border border-gold text-gold font-bold py-2 rounded-lg text-xs hover:bg-gold hover:text-dark transition-colors"
            >
              Unirme
            </button>
          </div>
        </div>

        {/* CTA */}
        <button
          onClick={() => navigate('/auth')}
          className="w-full max-w-sm bg-gold text-dark font-bold py-4 rounded-xl hover:bg-gold-light transition-colors text-lg"
        >
          Empezar a jugar
        </button>
        <p className="text-text-secondary text-xs mt-3">Gratis. Sin anuncios.</p>
        <button
          onClick={() => navigate('/about')}
          className="text-text-secondary text-xs mt-4 hover:text-gold transition-colors"
        >
          Sobre CineClue
        </button>
      </div>
    </AppShell>
  )
}
