import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

const NAV_ITEMS = [
  { to: '/home', label: 'Inicio', icon: '🏠' },
  { to: '/ranking', label: 'Ranking', icon: '🏆' },
  { to: '/duel', label: 'Duelos', icon: '⚔️' },
  { to: '/missions', label: 'Misiones', icon: '🎯' },
  { to: '/profile', label: 'Perfil', icon: '👤' },
]

export default function BottomNav() {
  const pendingDuels = useAuthStore(s => s.pendingDuels)

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-dark-card/95 backdrop-blur-md border-t border-dark-border safe-bottom z-40">
      <div className="max-w-[600px] mx-auto flex justify-around">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex flex-col items-center py-2.5 px-3 text-xs transition-colors ${
                isActive ? 'text-gold' : 'text-text-secondary hover:text-white'
              }`
            }
          >
            <span className="text-lg mb-0.5">{item.icon}</span>
            {item.label}
            {item.to === '/duel' && pendingDuels > 0 && (
              <span className="absolute top-1 right-1 bg-error text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {pendingDuels > 9 ? '9+' : pendingDuels}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
