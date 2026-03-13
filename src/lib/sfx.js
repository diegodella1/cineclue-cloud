/**
 * SFX module — Web Audio API synthesized game sounds.
 * Zero audio files, ~3KB, instant load.
 *
 * Usage: import { sfx } from '../lib/sfx'
 *        sfx.play('correct')
 */

let ctx = null
let muted = false

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
  }
  // Resume if suspended (autoplay policy)
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// ── Helpers ──

function osc(freq, type, startTime, duration, gain = 0.3) {
  const c = getCtx()
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.value = freq
  g.gain.setValueAtTime(gain, startTime)
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  o.connect(g).connect(c.destination)
  o.start(startTime)
  o.stop(startTime + duration)
}

function noise(startTime, duration, gain = 0.15) {
  const c = getCtx()
  const bufferSize = c.sampleRate * duration
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buffer
  const g = c.createGain()
  g.gain.setValueAtTime(gain, startTime)
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
  const filter = c.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 3000
  src.connect(filter).connect(g).connect(c.destination)
  src.start(startTime)
  src.stop(startTime + duration)
}

// ── Sounds ──

const sounds = {
  /** Ascending two-note chime — correct answer */
  correct() {
    const t = getCtx().currentTime
    osc(523, 'sine', t, 0.15, 0.25)         // C5
    osc(784, 'sine', t + 0.1, 0.25, 0.3)    // G5
  },

  /** Low buzz — incorrect answer */
  incorrect() {
    const t = getCtx().currentTime
    osc(150, 'sawtooth', t, 0.25, 0.15)
    osc(140, 'sawtooth', t + 0.05, 0.2, 0.12)
  },

  /** Single countdown tick */
  tick() {
    const t = getCtx().currentTime
    osc(880, 'square', t, 0.08, 0.15)
  },

  /** Final countdown "GO" — higher pitch */
  go() {
    const t = getCtx().currentTime
    osc(1047, 'square', t, 0.06, 0.2)       // C6
    osc(1319, 'sine', t + 0.06, 0.15, 0.25) // E6
    osc(1568, 'sine', t + 0.12, 0.3, 0.3)   // G6
  },

  /** Dramatic whoosh + impact — first blood */
  firstBlood() {
    const c = getCtx()
    const t = c.currentTime
    // Swoosh (noise burst)
    noise(t, 0.3, 0.2)
    // Impact hit
    osc(80, 'sine', t + 0.15, 0.4, 0.35)
    osc(60, 'sine', t + 0.15, 0.5, 0.25)
    // Dramatic sting
    osc(440, 'sawtooth', t + 0.2, 0.15, 0.12)
    osc(554, 'sawtooth', t + 0.25, 0.2, 0.15)
  },

  /** Ascending arpeggio — power-up (x2 round) */
  powerUp() {
    const t = getCtx().currentTime
    const notes = [523, 659, 784, 1047] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      osc(freq, 'sine', t + i * 0.08, 0.2, 0.2)
    })
  },

  /** Short fanfare — round end */
  fanfare() {
    const t = getCtx().currentTime
    // Brass-like with sawtooth
    osc(523, 'sawtooth', t, 0.2, 0.1)        // C5
    osc(659, 'sawtooth', t + 0.15, 0.2, 0.12) // E5
    osc(784, 'sawtooth', t + 0.3, 0.3, 0.15)  // G5
    osc(1047, 'sawtooth', t + 0.45, 0.5, 0.18) // C6
    // Reinforcement
    osc(523, 'sine', t + 0.45, 0.5, 0.1)
    osc(784, 'sine', t + 0.45, 0.5, 0.1)
  },

  /** Grand fanfare — podium / game finished */
  podium() {
    const t = getCtx().currentTime
    // Triumphant chord progression
    const chords = [
      { notes: [523, 659, 784], time: 0 },      // C major
      { notes: [587, 740, 880], time: 0.3 },     // D major
      { notes: [659, 831, 988], time: 0.6 },     // E major
      { notes: [698, 880, 1047], time: 0.9 },    // F major -> C
      { notes: [784, 988, 1175, 1568], time: 1.1 }, // G major (big)
    ]
    chords.forEach(({ notes, time }) => {
      notes.forEach(freq => {
        osc(freq, 'sawtooth', t + time, 0.4, 0.08)
        osc(freq, 'sine', t + time, 0.5, 0.06)
      })
    })
  },

  /** Fire crackle — streak hit (3+) */
  streak() {
    const t = getCtx().currentTime
    // Crackle bursts
    noise(t, 0.1, 0.12)
    noise(t + 0.08, 0.08, 0.15)
    noise(t + 0.15, 0.06, 0.1)
    // Rising tone
    osc(400, 'sine', t, 0.1, 0.1)
    osc(600, 'sine', t + 0.08, 0.1, 0.12)
    osc(800, 'sine', t + 0.15, 0.15, 0.15)
  },

  /** Soft ding — generic notification on TV (someone answered) */
  ding() {
    const t = getCtx().currentTime
    osc(1200, 'sine', t, 0.15, 0.12)
  },

  /** Timer warning — last 3 seconds */
  timerWarn() {
    const t = getCtx().currentTime
    osc(660, 'square', t, 0.06, 0.1)
  },
}

// ── Public API ──

export const sfx = {
  /** Warm up AudioContext — call from a user gesture (click/tap) */
  warmup() {
    try { getCtx() } catch {}
  },
  play(name) {
    if (muted) return
    try {
      sounds[name]?.()
    } catch {
      // AudioContext may fail on some browsers silently
    }
  },
  mute() { muted = true },
  unmute() { muted = false },
  toggle() { muted = !muted; return !muted },
  get isMuted() { return muted },
}
