import { useRef, useEffect } from 'react'

export default function BarChart({ data, labelKey, valueKey, secondaryKey, color = '#d4af37', secondaryColor = '#4caf50', height = 180 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!data || data.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = canvas.parentElement.offsetWidth
    const h = height

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, w, h)

    const padding = { top: 10, right: 10, bottom: 36, left: 40 }
    const chartW = w - padding.left - padding.right
    const chartH = h - padding.top - padding.bottom

    const values = data.map(d => d[valueKey] || 0)
    const secondaryValues = secondaryKey ? data.map(d => d[secondaryKey] || 0) : []
    const allValues = [...values, ...secondaryValues]
    const maxVal = Math.max(...allValues, 1)

    const barWidth = Math.max(2, (chartW / data.length) * 0.6)
    const gap = (chartW / data.length) * 0.4

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + chartH - (chartH / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding.left, y)
      ctx.lineTo(w - padding.right, y)
      ctx.stroke()

      // Y-axis labels
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '10px "DM Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillText(Math.round((maxVal / 4) * i), padding.left - 4, y + 3)
    }

    // Bars
    data.forEach((d, i) => {
      const x = padding.left + i * (barWidth + gap) + gap / 2

      // Primary bar
      const val = d[valueKey] || 0
      const barH = (val / maxVal) * chartH
      ctx.fillStyle = color
      ctx.globalAlpha = 0.8
      ctx.fillRect(x, padding.top + chartH - barH, barWidth / (secondaryKey ? 2 : 1), barH)

      // Secondary bar
      if (secondaryKey) {
        const val2 = d[secondaryKey] || 0
        const barH2 = (val2 / maxVal) * chartH
        ctx.fillStyle = secondaryColor
        ctx.fillRect(x + barWidth / 2, padding.top + chartH - barH2, barWidth / 2, barH2)
      }

      ctx.globalAlpha = 1

      // X-axis label
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '9px "DM Mono", monospace'
      ctx.textAlign = 'center'
      const label = String(d[labelKey] || '')
      // Show abbreviated label
      const shortLabel = label.length > 5 ? label.slice(5) : label
      ctx.save()
      ctx.translate(x + barWidth / 2, padding.top + chartH + 12)
      ctx.rotate(-0.4)
      ctx.fillText(shortLabel, 0, 0)
      ctx.restore()
    })
  }, [data, labelKey, valueKey, secondaryKey, color, secondaryColor, height])

  if (!data || data.length === 0) {
    return <p className="text-text-secondary text-xs text-center py-4">Sin datos</p>
  }

  return <canvas ref={canvasRef} className="w-full" />
}
