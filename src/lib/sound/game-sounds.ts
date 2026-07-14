/**
 * Sons de jeu SYNTHÉTISÉS (WebAudio) — aucun fichier audio, aucun réseau.
 *
 * Tous les sons sont générés par oscillateurs/bruit blanc à la volée : dé qui
 * roule, pas de pion, gorgée, changement de tour, victoire… Le contexte audio
 * n'est créé qu'au premier son (après un geste utilisateur, donc compatible
 * avec les politiques d'autoplay). Coupure persistée dans localStorage.
 */

export type GameSound =
  | 'dice-roll'
  | 'dice-result'
  | 'step'
  | 'drink'
  | 'reveal'
  | 'turn'
  | 'victory'
  | 'wheel'
  | 'hunter'

const MUTE_KEY = 'lp-sound-muted'

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

export function isSoundMuted(): boolean {
  if (typeof window === 'undefined') return true
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export function setSoundMuted(muted: boolean) {
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  } catch {
    // stockage indisponible — le réglage ne persiste pas, tant pis
  }
}

/** Note simple : oscillateur + enveloppe (attaque brève, décroissance douce). */
function tone(
  ac: AudioContext,
  opts: { freq: number; at?: number; dur?: number; type?: OscillatorType; gain?: number; slideTo?: number }
) {
  const { freq, at = 0, dur = 0.12, type = 'sine', gain = 0.12, slideTo } = opts
  const t0 = ac.currentTime + at
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur)
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

/** Souffle de bruit blanc court (clac de dé, roulement). */
function noiseBurst(ac: AudioContext, opts: { at?: number; dur?: number; gain?: number; freq?: number }) {
  const { at = 0, dur = 0.06, gain = 0.1, freq = 1800 } = opts
  const t0 = ac.currentTime + at
  const length = Math.max(1, Math.floor(ac.sampleRate * dur))
  const buffer = ac.createBuffer(1, length, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  src.buffer = buffer
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  const g = ac.createGain()
  g.gain.setValueAtTime(gain, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(g).connect(ac.destination)
  src.start(t0)
}

const PLAYERS: Record<GameSound, (ac: AudioContext) => void> = {
  // Roulement : petites percussions de bruit qui s'accélèrent légèrement.
  'dice-roll': (ac) => {
    for (let i = 0; i < 6; i += 1) noiseBurst(ac, { at: i * 0.11, dur: 0.045, gain: 0.07, freq: 2200 })
  },
  // Clac d'arrêt : impact grave + claquement clair.
  'dice-result': (ac) => {
    noiseBurst(ac, { dur: 0.05, gain: 0.14, freq: 3000 })
    tone(ac, { freq: 190, dur: 0.16, type: 'triangle', gain: 0.18, slideTo: 120 })
  },
  // Tic discret à chaque case franchie.
  step: (ac) => tone(ac, { freq: 700, dur: 0.045, type: 'square', gain: 0.045 }),
  // « Glou » descendant.
  drink: (ac) => {
    tone(ac, { freq: 320, dur: 0.1, type: 'sine', gain: 0.12, slideTo: 180 })
    tone(ac, { freq: 240, at: 0.1, dur: 0.12, type: 'sine', gain: 0.1, slideTo: 130 })
  },
  // Révélation de case : petit sweep montant.
  reveal: (ac) => tone(ac, { freq: 420, dur: 0.16, type: 'sine', gain: 0.09, slideTo: 880 }),
  // Changement de tour : ding doux.
  turn: (ac) => {
    tone(ac, { freq: 660, dur: 0.18, type: 'sine', gain: 0.08 })
    tone(ac, { freq: 990, at: 0.07, dur: 0.22, type: 'sine', gain: 0.06 })
  },
  // Victoire : arpège majeur ascendant.
  victory: (ac) => {
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => tone(ac, { freq: f, at: i * 0.13, dur: 0.28, type: 'triangle', gain: 0.1 }))
    tone(ac, { freq: 1318.5, at: 0.55, dur: 0.4, type: 'sine', gain: 0.08 })
  },
  // Roue : tic-tic qui ralentit (~4,3 s, calé sur la rotation de la roue).
  wheel: (ac) => {
    let at = 0
    for (let i = 0; i < 24; i += 1) {
      tone(ac, { freq: 1100, at, dur: 0.03, type: 'square', gain: 0.05 })
      at += 0.04 + i * 0.012
    }
  },
  // Le Chasseur arme son fusil (Loup-Garou) : détonation sourde + deux notes
  // de tension en tierce mineure — LE moment dramatique de la partie.
  hunter: (ac) => {
    noiseBurst(ac, { dur: 0.22, gain: 0.16, freq: 420 })
    tone(ac, { freq: 95, dur: 0.5, type: 'sawtooth', gain: 0.2, slideTo: 42 })
    tone(ac, { freq: 220, at: 0.45, dur: 0.28, type: 'triangle', gain: 0.09 })
    tone(ac, { freq: 261.63, at: 0.78, dur: 0.45, type: 'triangle', gain: 0.12 })
  },
}

export function playGameSound(name: GameSound) {
  if (isSoundMuted()) return
  const ac = getCtx()
  if (!ac) return
  try {
    PLAYERS[name](ac)
  } catch {
    // l'audio ne doit jamais casser le jeu
  }
}
