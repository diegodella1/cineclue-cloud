import { useUiStore } from '../../stores/uiStore'

export default function Toast() {
  const toast = useUiStore(s => s.toast)
  if (!toast) return null

  const colors = {
    info: 'bg-dark-card/95 border-dark-border',
    success: 'bg-dark-card/95 border-success',
    error: 'bg-dark-card/95 border-error',
  }

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-slide-up max-w-[90vw] px-5 py-3 rounded-xl border backdrop-blur-md text-sm shadow-lg ${colors[toast.type]}`}>
      {toast.message}
    </div>
  )
}
