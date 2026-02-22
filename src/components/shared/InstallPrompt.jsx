import { useState, useEffect, useCallback } from 'react'

const DISMISS_KEY = 'cineclue_install_dismissed'
const SHOW_DELAY = 10000

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [platform, setPlatform] = useState(null) // 'native' | 'ios'

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const timer = setTimeout(() => {
      if (isIOS()) {
        setPlatform('ios')
        setShowBanner(true)
      }
    }, SHOW_DELAY)

    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setPlatform('native')
      clearTimeout(timer)
      setTimeout(() => setShowBanner(true), SHOW_DELAY)
    }

    window.addEventListener('beforeinstallprompt', handler)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setShowBanner(false)
    }
    setDeferredPrompt(null)
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setShowBanner(false)
    localStorage.setItem(DISMISS_KEY, '1')
  }, [])

  if (!showBanner) return null

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-[500px] mx-auto animate-slide-up">
      <div className="bg-dark-card border border-dark-border rounded-xl p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="text-2xl shrink-0">🎬</div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium text-sm">Instalar CineClue</p>
            {platform === 'ios' ? (
              <p className="text-text-secondary text-xs mt-1">
                Tocá <span className="inline-flex items-center align-middle mx-0.5"><ShareIcon /></span> y después <strong className="text-white">Agregar a Inicio</strong>
              </p>
            ) : (
              <p className="text-text-secondary text-xs mt-1">
                Agregala a tu pantalla de inicio para acceso rápido
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="text-text-secondary hover:text-white text-lg leading-none p-1 -mt-1 -mr-1"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        {platform === 'native' && (
          <button
            onClick={handleInstall}
            className="w-full mt-3 bg-gold text-dark font-bold py-2.5 rounded-lg text-sm hover:bg-gold-light transition-colors"
          >
            Instalar
          </button>
        )}
      </div>
    </div>
  )
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}
