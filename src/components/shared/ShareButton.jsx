import { useState } from 'react'

export default function ShareButton({ generateImage, getText, label, className }) {
  const [status, setStatus] = useState('idle')

  const handleShare = async () => {
    setStatus('loading')
    try {
      const { shareImage } = await import('../../lib/share.js')
      const text = getText()
      let dataUrl = null
      try {
        dataUrl = await generateImage()
      } catch (e) {
        console.error('Image generation failed:', e)
      }

      let result
      if (dataUrl) {
        result = await shareImage(dataUrl, text)
      } else {
        if (navigator.share) {
          try { await navigator.share({ text }); result = 'shared' }
          catch (e) { if (e.name === 'AbortError') result = 'cancelled' }
        }
        if (!result) {
          try { await navigator.clipboard.writeText(text); result = 'copied' }
          catch { result = null }
        }
      }

      if (result === 'copied') {
        setStatus('copied')
        if (navigator.vibrate) navigator.vibrate(50)
        setTimeout(() => setStatus('idle'), 2000)
      } else if (result === 'downloaded') {
        setStatus('downloaded')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('idle')
      }
    } catch (e) {
      console.error('Share error:', e)
      setStatus('idle')
    }
  }

  const labels = {
    idle: label || 'Compartir',
    loading: 'Generando...',
    copied: 'Copiado!',
    downloaded: 'Guardado!',
  }

  const defaultClass = 'w-full flex items-center justify-center gap-2 border border-gold/40 text-gold font-bold py-3 rounded-xl hover:bg-gold/10 transition-all disabled:opacity-50'

  return (
    <button
      onClick={handleShare}
      disabled={status === 'loading'}
      className={className || defaultClass}
    >
      {status === 'loading' ? (
        <span className="w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
      ) : status === 'copied' || status === 'downloaded' ? (
        <span>✓</span>
      ) : null}
      {labels[status]}
    </button>
  )
}
