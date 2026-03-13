import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'

export default function PartyQR({ code, url, size = 200 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current || (!code && !url)) return
    const target = url || `${window.location.origin}/party/join?code=${code}`
    QRCode.toCanvas(canvasRef.current, target, {
      width: size,
      margin: 2,
      color: { dark: '#d4af37', light: '#1a1a1a' },
    })
  }, [code, url, size])

  return <canvas ref={canvasRef} className="rounded-xl" />
}
