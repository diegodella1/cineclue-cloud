import { useRef, useEffect } from 'react'

export default function RadarChart({ data }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!data || data.length === 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const size = 240
    const center = size / 2
    const radius = 90
    const n = data.length

    canvas.width = size
    canvas.height = size

    ctx.clearRect(0, 0, size, size)

    // Draw grid
    for (let level = 1; level <= 4; level++) {
      const r = (radius / 4) * level
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const x = center + r * Math.cos(angle)
        const y = center + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.stroke()
    }

    // Draw data
    ctx.beginPath()
    data.forEach((d, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const r = (d.rate / 100) * radius
      const x = center + r * Math.cos(angle)
      const y = center + r * Math.sin(angle)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.closePath()
    ctx.fillStyle = 'rgba(212, 175, 55, 0.2)'
    ctx.fill()
    ctx.strokeStyle = '#d4af37'
    ctx.lineWidth = 2
    ctx.stroke()

    // Labels
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.font = '11px "DM Sans", sans-serif'
    ctx.textAlign = 'center'
    data.forEach((d, i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2
      const x = center + (radius + 20) * Math.cos(angle)
      const y = center + (radius + 20) * Math.sin(angle)
      ctx.fillText(d.category_value, x, y + 4)
    })
  }, [data])

  if (!data || data.length < 3) return null

  return (
    <div className="flex justify-center">
      <canvas ref={canvasRef} className="w-[240px] h-[240px]" />
    </div>
  )
}
