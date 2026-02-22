const W = 1080
const H = 1920

let fontsLoaded = false
async function ensureFonts() {
  if (fontsLoaded) return
  const load = (family, url) => {
    const f = new FontFace(family, `url(${url})`)
    return f.load().then(() => document.fonts.add(f))
  }
  await Promise.all([
    load('Playfair Display', 'https://fonts.gstatic.com/s/playfairdisplay/v30/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDXbtM.woff2'),
    load('DM Mono', 'https://fonts.gstatic.com/s/dmmono/v10/aFTU7PB1QTsUX8KYhh2aBYyMcKJHl0Yw.woff2'),
  ])
  fontsLoaded = true
}

function createCanvas() {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return c
}

function drawBackground(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, H)
  g.addColorStop(0, '#0a0a0a')
  g.addColorStop(1, '#141414')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#d4af37'
  ctx.fillRect(0, 0, W, 6)
}

function drawLogo(ctx, y = 110) {
  ctx.fillStyle = '#d4af37'
  ctx.font = 'italic 64px "Playfair Display"'
  ctx.textAlign = 'center'
  ctx.fillText('CineClue', W / 2, y)
}

function drawDiffColor(diff) {
  const d = (diff || '').toLowerCase()
  if (d === 'fácil' || d === 'facil') return '#4caf50'
  if (d === 'medio') return '#d4af37'
  return '#e53935'
}

function drawRoundResults(ctx, results, startY) {
  let y = startY
  ctx.textAlign = 'left'
  results.forEach((r) => {
    // dot indicator
    ctx.fillStyle = r.guessed ? '#4caf50' : '#e53935'
    ctx.beginPath()
    ctx.arc(80, y - 8, 10, 0, Math.PI * 2)
    ctx.fill()

    // title
    ctx.fillStyle = r.guessed ? '#ffffff' : 'rgba(255,255,255,0.4)'
    ctx.font = '32px "DM Mono"'
    const title = r.title && r.title.length > 28 ? r.title.slice(0, 26) + '..' : r.title
    ctx.fillText(title || '', 110, y)

    // diff badge
    ctx.fillStyle = drawDiffColor(r.diff)
    ctx.font = '22px "DM Mono"'
    ctx.textAlign = 'right'
    ctx.fillText((r.diff || '').toUpperCase(), 860, y)

    // points
    ctx.fillStyle = r.guessed ? '#d4af37' : 'rgba(255,255,255,0.25)'
    ctx.font = 'bold 28px "DM Mono"'
    ctx.fillText(`${r.points_earned}pts`, W - 80, y)
    ctx.textAlign = 'left'
    y += 70
  })
  return y
}

function drawCTA(ctx) {
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.font = '26px "DM Mono"'
  ctx.fillText('Cual es tu huella cinematografica?', W / 2, H - 110)
  ctx.fillStyle = '#d4af37'
  ctx.font = 'bold 34px "DM Mono"'
  ctx.fillText('cineclue.game', W / 2, H - 60)
}

function drawEloDelta(ctx, eloDelta, eloAfter, y) {
  ctx.textAlign = 'center'
  ctx.font = 'bold 48px "DM Mono"'
  ctx.fillStyle = eloDelta >= 0 ? '#4caf50' : '#e53935'
  ctx.fillText(`${eloDelta >= 0 ? '+' : ''}${eloDelta} PuntEmes`, W / 2, y)
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '26px "DM Mono"'
  ctx.fillText(`Tengo ${eloAfter} PuntEmes!`, W / 2, y + 45)
}

// =============================================================================
// SOLO / DAILY
// =============================================================================
export async function generateSoloImage({ mode, date, totalScore, maxScore, eloDelta, eloAfter, roundResults, badge }) {
  await ensureFonts()
  const c = createCanvas()
  const ctx = c.getContext('2d')
  drawBackground(ctx)
  drawLogo(ctx)

  // Mode label
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '30px "DM Mono"'
  ctx.textAlign = 'center'
  const label = mode === 'daily'
    ? `Peli del Dia — ${date || new Date().toLocaleDateString('es-AR')}`
    : 'Modo Solo'
  ctx.fillText(label, W / 2, 190)

  // Big score
  ctx.fillStyle = '#d4af37'
  ctx.font = 'bold 120px "DM Mono"'
  ctx.fillText(`${totalScore} / ${maxScore}`, W / 2, 370)

  // Badge
  if (badge) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '34px "DM Mono"'
    ctx.fillText(`${badge.icon || ''} ${badge.label}`, W / 2, 435)
  }

  // ELO
  if (eloDelta !== undefined && eloAfter !== undefined) {
    drawEloDelta(ctx, eloDelta, eloAfter, 530)
  }

  // Results
  if (roundResults && roundResults.length > 0) {
    drawRoundResults(ctx, roundResults, 670)
  }

  drawCTA(ctx)
  return c.toDataURL('image/png')
}

// =============================================================================
// DAILY (single movie result)
// =============================================================================
export async function generateDailyImage({ date, movieTitle, guessed, pointsEarned, clueUsed, eloDelta, eloAfter }) {
  await ensureFonts()
  const c = createCanvas()
  const ctx = c.getContext('2d')
  drawBackground(ctx)
  drawLogo(ctx)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '30px "DM Mono"'
  ctx.textAlign = 'center'
  ctx.fillText(`Peli del Dia — ${date || new Date().toLocaleDateString('es-AR')}`, W / 2, 190)

  // Result
  ctx.font = 'bold 52px "DM Mono"'
  ctx.fillStyle = guessed ? '#4caf50' : '#e53935'
  ctx.fillText(guessed ? 'Acerte!' : 'No la saque', W / 2, 340)

  // Movie title (hidden for spoiler-free share by default)
  ctx.fillStyle = '#d4af37'
  ctx.font = 'italic 56px "Playfair Display"'
  ctx.fillText(movieTitle || '???', W / 2, 440)

  if (guessed) {
    ctx.fillStyle = '#d4af37'
    ctx.font = 'bold 100px "DM Mono"'
    ctx.fillText(`+${pointsEarned} pts`, W / 2, 590)

    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '28px "DM Mono"'
    ctx.fillText(`Pista ${clueUsed + 1} de 5`, W / 2, 650)
  }

  if (eloDelta !== undefined && eloAfter !== undefined) {
    drawEloDelta(ctx, eloDelta, eloAfter, 770)
  }

  drawCTA(ctx)
  return c.toDataURL('image/png')
}

// =============================================================================
// DUEL RESULT
// =============================================================================
export async function generateDuelImage({ myName, myScore, rivalName, rivalScore, iWon, isDraw, eloDelta, eloAfter }) {
  await ensureFonts()
  const c = createCanvas()
  const ctx = c.getContext('2d')
  drawBackground(ctx)
  drawLogo(ctx)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '30px "DM Mono"'
  ctx.textAlign = 'center'
  ctx.fillText('Duelo 1v1', W / 2, 190)

  // Result headline
  ctx.font = 'bold 56px "DM Mono"'
  ctx.fillStyle = isDraw ? '#d4af37' : iWon ? '#4caf50' : '#e53935'
  ctx.fillText(isDraw ? 'Empate!' : iWon ? 'Victoria!' : 'Derrota', W / 2, 320)

  // VS scoreboard
  const boxW = 420, boxH = 280, gap = 40
  const leftX = W / 2 - boxW - gap / 2
  const rightX = W / 2 + gap / 2
  const boxY = 400

  // My box
  ctx.fillStyle = iWon || isDraw ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.05)'
  ctx.strokeStyle = iWon || isDraw ? '#d4af37' : 'rgba(255,255,255,0.15)'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.roundRect(leftX, boxY, boxW, boxH, 20)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '28px "DM Mono"'
  ctx.textAlign = 'center'
  const myLabel = myName && myName.length > 14 ? myName.slice(0, 12) + '..' : (myName || 'Vos')
  ctx.fillText(myLabel, leftX + boxW / 2, boxY + 80)
  ctx.fillStyle = '#d4af37'
  ctx.font = 'bold 90px "DM Mono"'
  ctx.fillText(`${myScore ?? '-'}`, leftX + boxW / 2, boxY + 210)

  // Rival box
  ctx.fillStyle = !iWon && !isDraw ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.05)'
  ctx.strokeStyle = !iWon && !isDraw ? '#d4af37' : 'rgba(255,255,255,0.15)'
  ctx.beginPath()
  ctx.roundRect(rightX, boxY, boxW, boxH, 20)
  ctx.fill()
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.font = '28px "DM Mono"'
  const rvLabel = rivalName && rivalName.length > 14 ? rivalName.slice(0, 12) + '..' : (rivalName || 'Rival')
  ctx.fillText(rvLabel, rightX + boxW / 2, boxY + 80)
  ctx.fillStyle = '#d4af37'
  ctx.font = 'bold 90px "DM Mono"'
  ctx.fillText(`${rivalScore ?? '-'}`, rightX + boxW / 2, boxY + 210)

  // VS
  ctx.fillStyle = '#d4af37'
  ctx.font = 'italic 40px "Playfair Display"'
  ctx.fillText('vs', W / 2, boxY + 160)

  // ELO
  if (eloDelta !== undefined && eloAfter !== undefined) {
    drawEloDelta(ctx, eloDelta, eloAfter, 800)
  }

  drawCTA(ctx)
  return c.toDataURL('image/png')
}

// =============================================================================
// PROFILE CARD
// =============================================================================
export async function generateProfileImage({ displayName, username, elo, rank, level, gamesPlayed, totalScore, streakCurrent, streakBest, specialties, badges }) {
  await ensureFonts()
  const c = createCanvas()
  const ctx = c.getContext('2d')
  drawBackground(ctx)
  drawLogo(ctx)

  // Name
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 56px "Playfair Display"'
  ctx.textAlign = 'center'
  const dName = displayName && displayName.length > 20 ? displayName.slice(0, 18) + '..' : (displayName || '')
  ctx.fillText(dName, W / 2, 230)

  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '30px "DM Mono"'
  ctx.fillText(`@${username || ''}`, W / 2, 280)

  // Rank + ELO
  ctx.fillStyle = '#d4af37'
  ctx.font = 'bold 48px "DM Mono"'
  ctx.fillText(`${rank?.icon || ''} ${rank?.title || ''}`, W / 2, 380)
  ctx.font = 'bold 80px "DM Mono"'
  ctx.fillText(`${elo || 0} PuntEmes`, W / 2, 490)

  // Level
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '32px "DM Mono"'
  ctx.fillText(`Nivel ${level || 1}`, W / 2, 550)

  // Stats boxes
  const stats = [
    { label: 'Partidas', value: gamesPlayed || 0 },
    { label: 'Puntos', value: totalScore || 0 },
    { label: 'Racha', value: streakCurrent || 0 },
    { label: 'Mejor racha', value: streakBest || 0 },
  ]
  const bw = 220, bh = 140, startX = 70, startY = 640, gapX = 27
  stats.forEach((s, i) => {
    const x = startX + (i % 4) * (bw + gapX)
    const y = startY
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.roundRect(x, y, bw, bh, 16)
    ctx.fill()
    ctx.stroke()

    ctx.fillStyle = '#d4af37'
    ctx.font = 'bold 48px "DM Mono"'
    ctx.textAlign = 'center'
    ctx.fillText(`${s.value}`, x + bw / 2, y + 65)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '22px "DM Mono"'
    ctx.fillText(s.label, x + bw / 2, y + 105)
  })

  // Specialties
  if (specialties && specialties.length > 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.font = '28px "DM Mono"'
    ctx.fillText(`Especialista en ${specialties.join(' y ')}`, W / 2, 880)
  }

  // Badges
  if (badges && badges.length > 0) {
    ctx.textAlign = 'center'
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.font = '26px "DM Mono"'
    ctx.fillText('Logros', W / 2, 970)
    const badgeStr = badges.map(b => `${b.icon} ${b.name}`).join('  ·  ')
    ctx.fillStyle = '#d4af37'
    ctx.font = '28px "DM Mono"'
    // Wrap if needed
    if (badgeStr.length > 45) {
      ctx.fillText(badgeStr.slice(0, 44) + '..', W / 2, 1020)
    } else {
      ctx.fillText(badgeStr, W / 2, 1020)
    }
  }

  drawCTA(ctx)
  return c.toDataURL('image/png')
}

// =============================================================================
// SHARE DISPATCHER
// =============================================================================
export async function shareImage(dataUrl, text) {
  const blob = await (await fetch(dataUrl)).blob()
  const file = new File([blob], 'cineclue.png', { type: 'image/png' })

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ text, files: [file] })
      return 'shared'
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled'
    }
  }

  // Fallback: try text-only share
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled'
    }
  }

  // Fallback: clipboard
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    // Last resort: download the image
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = 'cineclue.png'
    a.click()
    return 'downloaded'
  }
}

// =============================================================================
// TEXT GENERATORS (for clipboard / text-only share)
// =============================================================================
export function soloShareText({ totalScore, maxScore, eloDelta, eloAfter }) {
  const sign = eloDelta >= 0 ? '+' : ''
  return `Hice ${totalScore}/${maxScore} en CineClue! ${sign}${eloDelta} PuntEmes (${eloAfter}) 🎬 cineclue.game`
}

export function dailyShareText({ guessed, pointsEarned, date }) {
  if (guessed) {
    return `Peli del Dia (${date}) — Acerte con ${pointsEarned} pts! 🎬 cineclue.game`
  }
  return `Peli del Dia (${date}) — No la saque 😅 cineclue.game`
}

export function duelShareText({ myName, myScore, rivalName, rivalScore, iWon, isDraw }) {
  if (isDraw) return `Empate ${myScore}-${rivalScore} con @${rivalName} en CineClue! 🎬 cineclue.game`
  if (iWon) return `Le gane a @${rivalName} ${myScore}-${rivalScore} en CineClue! 🎬 cineclue.game`
  return `@${rivalName} me gano ${rivalScore}-${myScore} en CineClue 😅 cineclue.game`
}

export function profileShareText({ displayName, username, elo, rank, level, streakCurrent }) {
  return `${displayName} (@${username}) — ${rank?.icon || ''} ${rank?.title || ''} · ${elo} PuntEmes · Nivel ${level}${streakCurrent > 0 ? ` · Racha ${streakCurrent}` : ''} 🎬 cineclue.game`
}
