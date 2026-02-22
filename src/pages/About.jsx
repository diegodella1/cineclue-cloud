import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import AppShell from '../components/layout/AppShell'

export default function About() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)

  return (
    <AppShell>
      <div className="pt-10 pb-24 flex flex-col items-center text-center px-4">
        <h1 className="font-serif text-5xl italic text-gold mb-6">CineClue</h1>

        <div className="bg-dark-card border border-dark-border rounded-xl p-6 max-w-sm w-full space-y-4 text-left">
          <div>
            <h2 className="font-serif text-lg text-gold mb-2">Que es CineClue?</h2>
            <p className="text-text-secondary text-sm leading-relaxed">
              CineClue es un juego de trivia cinematografica donde tenés que adivinar peliculas a partir de 5 pistas.
              Jugá solo, competí en el ranking semanal, enfrentá a otros jugadores en duelos y descubrí tu huella cinematográfica.
            </p>
          </div>

          <div>
            <h2 className="font-serif text-lg text-gold mb-2">Como se juega?</h2>
            <ul className="text-text-secondary text-sm space-y-1.5">
              <li>5 pistas por pelicula, de mas dificil a mas facil</li>
              <li>Mientras menos pistas uses, mas puntos ganas</li>
              <li>Peli del Dia: una pelicula diaria, igual para todos</li>
              <li>Duelos: desafiá a otros jugadores</li>
              <li>Misiones y logros para desbloquear</li>
            </ul>
          </div>

          <div className="pt-2 border-t border-dark-border">
            <p className="text-text-secondary text-sm">
              Creado por{' '}
              <a
                href="https://instagram.com/agustineme"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold font-bold hover:underline"
              >
                Agustin Eme
              </a>
            </p>
          </div>
        </div>

        {!user && (
          <button
            onClick={() => navigate('/')}
            className="mt-6 text-text-secondary text-sm hover:text-gold transition-colors"
          >
            Volver al inicio
          </button>
        )}
      </div>
    </AppShell>
  )
}
