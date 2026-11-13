"use client"

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Fingerprint, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { useAmbianceMode, type AmbianceMode } from '@/components/providers/AmbianceAttribute'
import { isSoundMuted, playGameSound, setSoundMuted, type GameSound } from '@/lib/sound/game-sounds'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { getSafeStorage } from '@/lib/storage'
import { cn } from '@/lib/utils'
import {
  DOIGT_MODES,
  ELIMINATED_SIPS,
  LIFTED_SIPS,
  LIFTED_SOFT_POINTS,
  MAX_FINGERS,
  MIN_FINGERS,
  SURVIVOR_SIPS,
  VICTIM_SIPS,
  clockwiseOrder,
  countdownSecondsLeft,
  createDoigtState,
  eliminatedAtVerdict,
  fingerAdmission,
  fingerRole,
  isDoigtMode,
  liftedToAnnounce,
  nextDoigtDeadline,
  reduceDoigt,
  seedDoigt,
  selectionSchedule,
  selectionStepIndex,
  type DoigtMode,
  type DoigtState,
} from '@/lib/doigt-du-destin/engine'
import { FingerMark, type FingerBadge, type FingerLook } from './finger-mark'

/** Dernier mode choisi sur cet appareil : une table qui tire toujours l'ordre le retrouve. */
const MODE_STORAGE_KEY = 'lp-doigt-du-destin-mode'

const HEADER_BUTTON = 'shrink-0 border border-gold/20 bg-black/20 text-cream/70 hover:bg-black/30 hover:text-gold'

/** Plus haut que ça dans la zone, les étiquettes d'un cercle sortiraient par le haut : elles passent dessous. */
const BADGE_FLIP_PX = 104
/** Demi-largeur de la plus longue rangée d'étiquettes (« ¡Tú! » + « Levantado ») : elle reste dans la zone près des bords. */
const BADGE_HALF_PX = 72

/**
 * Horodatage d'un geste sur l'horloge de `performance.now()`, celle des ticks.
 * Un vieux moteur donnait l'heure murale dans `timeStamp` : on retombe alors
 * sur l'instant de traitement, sinon le décompte ne partirait jamais.
 */
function eventTime(timeStamp: number): number {
  const now = performance.now()
  return Math.abs(now - timeStamp) < 10_000 ? timeStamp : now
}

/** Le son coupé coupe aussi la vibration : un seul réglage pour tout le retour (convention Plinko). */
function vibrate(pattern: number) {
  if (isSoundMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // vibration absente (iPhone) ou refusée : le verdict reste à l'écran
  }
}

function zonePoint(zone: HTMLElement, clientX: number, clientY: number) {
  const rect = zone.getBoundingClientRect()
  return {
    x: Math.min(Math.max(clientX - rect.left, 0), rect.width),
    y: Math.min(Math.max(clientY - rect.top, 0), rect.height),
  }
}

/** Lignes du verdict lues d'une traite : un point entre deux lignes qui n'en ont pas, pour que la voix marque la pause. */
function spoken(lines: readonly (string | null)[]): string {
  return lines.reduce<string>((text, line) => {
    if (!line) return text
    if (!text) return line
    return /[.!?…:]$/.test(text) ? `${text} ${line}` : `${text}. ${line}`
  }, '')
}

function verdictSound(state: DoigtState): GameSound {
  if (state.phase === 'between') return 'skip'
  const outcome = state.round ? state.round.outcome : null
  if (outcome?.mode === 'survival') return state.survival?.winner ? 'victory' : 'skip'
  return outcome?.mode === 'teams' ? 'turn' : 'reveal'
}

/**
 * L'arène : un seul écran plein feutre, posé sur la table. Pas de pré-partie
 * ni de table de joueurs (les doigts SONT les joueurs), pas de sauvegarde (une
 * partie dure dix secondes), pas d'écran de fin : le verdict reste affiché
 * jusqu'à « Rejouer » ou jusqu'au doigt suivant.
 */
export default function Game() {
  const t = useTranslations('games.doigt-du-destin')
  const tc = useTranslations('common')
  const format = useFormatter()
  const reduced = useReducedMotion() ?? false
  const { mode: ambiance } = useAmbianceMode()

  // Graine posée au montage (rien d'aléatoire au rendu serveur).
  const [state, setState] = useState<DoigtState>(() => createDoigtState({ seed: 0, now: 0 }))
  const [clock, setClock] = useState(0)
  const [lit, setLit] = useState<string | null>(null)
  /** Ambiance figée au premier tirage d'une partie : le barème ne change pas en route. */
  const [gameAmbiance, setGameAmbiance] = useState<AmbianceMode>('alcool')
  const [touchPoints, setTouchPoints] = useState<number | null>(null)
  const [muted, setMuted] = useState(true)
  const [zoneWidth, setZoneWidth] = useState(0)
  /** `<body>`, une fois hydraté : l'arène y est portée (voir le rendu). */
  const [host, setHost] = useState<HTMLElement | null>(null)

  // Les gestes s'enchaînent plus vite que les rendus : la vérité est dans la
  // ref, l'état React n'en est que l'affichage.
  const stateRef = useRef(state)
  const reducedRef = useRef(reduced)
  const ambianceRef = useRef(ambiance)
  const zoneRef = useRef<HTMLDivElement>(null)
  const modesRef = useRef<HTMLDivElement>(null)
  const pointersRef = useRef(new Map<number, string>())
  // Positions écrites au fil des `pointermove` directement dans le DOM : un
  // rendu React par mouvement de dix doigts saccadait les vieux Android.
  const positionsRef = useRef(new Map<string, { x: number; y: number }>())
  const nodesRef = useRef(new Map<string, HTMLDivElement>())
  const nodeRefsRef = useRef(new Map<string, (node: HTMLDivElement | null) => void>())
  const fingerSeqRef = useRef(0)
  // iPhone : l'audio ne démarre que dans un vrai geste (doigt LEVÉ, clic), pas
  // sur un doigt posé. Joués avant, les sons s'empileraient dans un contexte
  // suspendu et partiraient tous d'un coup au premier geste.
  const audioReadyRef = useRef(false)

  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])

  useEffect(() => {
    ambianceRef.current = ambiance
  }, [ambiance])

  const sound = useCallback((name: GameSound) => {
    if (audioReadyRef.current) playGameSound(name)
  }, [])

  /** Débloque l'audio dans le geste en cours ; vrai si un son vient d'y être joué. */
  const armAudio = useCallback((): boolean => {
    if (audioReadyRef.current) return false
    audioReadyRef.current = true
    playGameSound('step')
    return true
  }, [])

  const commit = useCallback((next: DoigtState) => {
    const prev = stateRef.current
    if (next === prev) return
    stateRef.current = next
    setState(next)
    if (next.round && next.round !== prev.round && prev.phase !== 'between') setGameAmbiance(ambianceRef.current)
    // Ménage fait ici, sur l'état à jour : un effet verrait les doigts du rendu
    // précédent et effacerait la position d'un doigt posé entre-temps.
    if (next.fingers !== prev.fingers) {
      const kept = new Set(next.fingers.map((finger) => finger.id))
      positionsRef.current.forEach((_, id) => {
        if (!kept.has(id)) positionsRef.current.delete(id)
      })
      nodeRefsRef.current.forEach((_, id) => {
        if (!kept.has(id)) nodeRefsRef.current.delete(id)
      })
    }
  }, [])

  const tick = useCallback(() => {
    const now = performance.now()
    const current = stateRef.current
    const points = current.down.flatMap((id) => {
      const point = positionsRef.current.get(id)
      return point ? [{ id, x: point.x, y: point.y }] : []
    })
    setClock(now)
    commit(reduceDoigt(current, { type: 'tick', now, order: clockwiseOrder(points), animate: !reducedRef.current }))
  }, [commit])

  /**
   * Oublie tous les doigts suivis : un onglet caché ne rendra peut-être jamais
   * leurs `pointerup`. Perdus, pas levés : aucune pénalité, et le tirage en
   * cours est annulé plutôt que joué dans l'ordre où on les parcourt.
   */
  const releaseAll = useCallback(() => {
    const now = performance.now()
    let current = stateRef.current
    pointersRef.current.forEach((id) => {
      current = reduceDoigt(current, { type: 'cancel', id, now })
    })
    pointersRef.current.clear()
    commit(current)
  }, [commit])

  useEffect(() => {
    setTouchPoints(navigator.maxTouchPoints || 0)
    setMuted(isSoundMuted())
    let saved: string | null = null
    try {
      saved = getSafeStorage()?.getItem(MODE_STORAGE_KEY) ?? null
    } catch {
      // stockage refusé : le mode par défaut fera l'affaire
    }
    const seeded = seedDoigt(stateRef.current, randomSeed())
    commit(isDoigtMode(saved) ? reduceDoigt(seeded, { type: 'mode', mode: saved, now: performance.now() }) : seeded)
  }, [commit])

  // Une seule échéance armée à la fois (fin de l'attente, chiffre suivant,
  // verdict, tirage de survie), recalculée à chaque changement.
  useEffect(() => {
    const now = performance.now()
    const deadline = nextDoigtDeadline(state, now)
    if (deadline === null) return
    const timer = window.setTimeout(tick, Math.max(0, deadline - now))
    return () => window.clearTimeout(timer)
  }, [state, clock, tick])

  // iOS gèle les minuteurs d'un onglet caché : au retour, on rattrape.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick()
      else releaseAll()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [tick, releaseAll])

  // Rendue sur place au serveur, l'arène passe dans <body> après l'hydratation :
  // dans la coquille des jeux, la marge `space-y` de son conteneur la décalait
  // et laissait dépasser la Navbar.
  useEffect(() => {
    setHost(document.body)
  }, [])

  // La Navbar et ses tiroirs, cachés sous le calque, deviennent inertes : Tab
  // et le lecteur d'écran passaient d'abord par leurs commandes invisibles.
  // Pas `.content-container` : la bulle du vocal, que la coquille des jeux y
  // monte pendant un appel, flotte au-dessus du calque et doit rester joignable
  // (comme le portail d'âge et les toasts, hors de `.fullscreen-container`).
  useEffect(() => {
    if (!host) return
    const shell = document.querySelector('.fullscreen-container')
    if (!shell) return
    const hidden = Array.from(shell.children).filter(
      (node) => !node.classList.contains('content-container') && !node.hasAttribute('inert')
    )
    hidden.forEach((node) => node.setAttribute('inert', ''))
    return () => hidden.forEach((node) => node.removeAttribute('inert'))
  }, [host])

  // `touch-action: none` suffit à Chrome ; Safari iOS veut en plus qu'on
  // annule le défilement et le pincement (écouteurs non passifs : ceux de
  // React le sont). Réarmé quand l'arène change de nœud (passage dans <body>).
  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return
    const block = (event: Event) => event.preventDefault()
    zone.addEventListener('touchmove', block, { passive: false })
    zone.addEventListener('gesturestart', block)
    return () => {
      zone.removeEventListener('touchmove', block)
      zone.removeEventListener('gesturestart', block)
    }
  }, [host])

  const round = state.round
  const selecting = state.phase === 'selecting'
  useEffect(() => {
    if (!selecting || !round) return
    const schedule = selectionSchedule(round.sequence.length)
    let frame = 0
    let shown = -1
    const draw = () => {
      const index = selectionStepIndex(schedule, performance.now() - round.startedAt)
      if (index !== shown) {
        shown = index
        setLit(round.sequence[index] ?? null)
        sound('tick')
      }
      if (index < schedule.length - 1) frame = window.requestAnimationFrame(draw)
    }
    draw()
    return () => window.cancelAnimationFrame(frame)
  }, [selecting, round, sound])

  const seconds = countdownSecondsLeft(state, clock)
  useEffect(() => {
    if (seconds !== null) sound('tick')
  }, [seconds, sound])

  const verdictKey =
    (state.phase === 'between' || state.phase === 'result') && round ? `${state.phase}:${round.startedAt}` : null
  useEffect(() => {
    if (!verdictKey) return
    const current = stateRef.current
    sound(verdictSound(current))
    vibrate(current.phase === 'between' ? 60 : 120)
  }, [verdictKey, sound])

  const fingers = state.fingers

  useEffect(() => {
    const measure = () => setZoneWidth(zoneRef.current?.clientWidth ?? 0)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [host])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Un bouton de souris enfoncé est un geste pour l'audio ; un doigt posé ne l'est pas.
    let armed = false
    if (event.pointerType === 'mouse') {
      if (event.button !== 0) return
      armed = armAudio()
    }
    if (pointersRef.current.has(event.pointerId)) return
    const zone = zoneRef.current
    const current = stateRef.current
    if (!zone || fingerAdmission(current) !== 'open') return
    fingerSeqRef.current += 1
    const id = `f${fingerSeqRef.current}`
    const next = reduceDoigt(current, { type: 'down', id, now: eventTime(event.timeStamp) })
    if (!next.down.includes(id)) return
    try {
      zone.setPointerCapture(event.pointerId)
    } catch {
      // pointeur déjà relâché : il ne sera simplement pas suivi hors de la zone
    }
    pointersRef.current.set(event.pointerId, id)
    positionsRef.current.set(id, zonePoint(zone, event.clientX, event.clientY))
    commit(next)
    if (!armed) sound('step')
  }

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const id = pointersRef.current.get(event.pointerId)
    const zone = zoneRef.current
    if (!id || !zone) return
    const point = zonePoint(zone, event.clientX, event.clientY)
    positionsRef.current.set(id, point)
    const node = nodesRef.current.get(id)
    if (node) node.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
  }

  /**
   * `voluntary` : un vrai `pointerup`, le doigt est levé. Sinon il est perdu
   * sans l'avoir été (`pointercancel` du système, capture perdue) : aucune
   * pénalité, et le tirage en cours est annulé.
   */
  const endPointer = (event: ReactPointerEvent<HTMLDivElement>, voluntary: boolean) => {
    const id = pointersRef.current.get(event.pointerId)
    if (!id) return
    pointersRef.current.delete(event.pointerId)
    const before = stateRef.current.phase
    commit(reduceDoigt(stateRef.current, { type: voluntary ? 'up' : 'cancel', id, now: eventTime(event.timeStamp) }))
    const armed = voluntary && event.pointerType !== 'mouse' ? armAudio() : false
    if (!armed && (before === 'gathering' || before === 'countdown')) sound('step')
  }
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => endPointer(event, true)
  const onPointerLost = (event: ReactPointerEvent<HTMLDivElement>) => endPointer(event, false)

  const selectMode = (mode: DoigtMode) => {
    if (!armAudio()) sound('step')
    commit(reduceDoigt(stateRef.current, { type: 'mode', mode, now: performance.now() }))
    try {
      getSafeStorage()?.setItem(MODE_STORAGE_KEY, mode)
    } catch {
      // stockage plein ou refusé : le choix vaut pour cette visite
    }
  }

  const replay = () => {
    if (!armAudio()) sound('step')
    commit(reduceDoigt(stateRef.current, { type: 'replay', now: performance.now() }))
    // Le bouton disparaît avec le verdict : le focus clavier irait sur <body>.
    modesRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]')?.focus({ preventScroll: true })
  }

  const toggleSound = () => {
    const next = !isSoundMuted()
    setSoundMuted(next)
    setMuted(next)
    if (next) return
    audioReadyRef.current = true
    playGameSound('step')
  }

  const markRef = (id: string) => {
    let callback = nodeRefsRef.current.get(id)
    if (!callback) {
      callback = (node: HTMLDivElement | null) => {
        if (node) nodesRef.current.set(id, node)
        else nodesRef.current.delete(id)
      }
      nodeRefsRef.current.set(id, callback)
    }
    return callback
  }

  // ─── Textes ────────────────────────────────────────────────────────────────
  const soft = gameAmbiance === 'soft'
  const survival = state.survival
  const outcome = round ? round.outcome : null
  const gathering = state.phase === 'gathering' || state.phase === 'countdown'
  const deviceMax = touchPoints !== null && touchPoints >= MIN_FINGERS ? Math.min(MAX_FINGERS, touchPoints) : MAX_FINGERS
  const limitReached = gathering && (fingerAdmission(state) === 'full' || fingers.length >= deviceMax)
  const modesLocked = state.phase === 'selecting' || state.phase === 'between'

  const modeHint = (() => {
    const hintSoft = ambiance === 'soft'
    switch (state.mode) {
      case 'victim':
        return hintSoft ? t('soft.hints.victim') : t('hints.victim', { count: VICTIM_SIPS })
      case 'teams':
        return t('hints.teams')
      case 'order':
        return t('hints.order')
      case 'survival':
        return hintSoft
          ? t('soft.hints.survival')
          : t('hints.survival', { eliminated: ELIMINATED_SIPS, survivor: SURVIVOR_SIPS })
    }
  })()

  const verdict = ((): { main: string; detail: string | null } | null => {
    if (!outcome || (state.phase !== 'between' && state.phase !== 'result')) return null
    switch (outcome.mode) {
      case 'victim':
        return soft
          ? { main: t('soft.result.victim'), detail: t('soft.result.victimDetail') }
          : { main: t('result.victim', { count: VICTIM_SIPS }), detail: null }
      case 'teams':
        return {
          main: t('result.teams', { gold: outcome.gold.length, blue: outcome.blue.length }),
          detail: t('result.teamsDetail'),
        }
      case 'order':
        return { main: t('result.order'), detail: t('result.orderDetail') }
      case 'survival': {
        if (state.phase === 'between') {
          return {
            main: soft ? t('soft.result.eliminated') : t('result.eliminated', { count: ELIMINATED_SIPS }),
            detail: survival?.awaiting ? t('arena.liftEliminated') : t('arena.nextDraw'),
          }
        }
        // Survie close par un tirage : son éliminé n'a pas eu d'écran à lui, survivant ou pas.
        const lastOut =
          !soft && eliminatedAtVerdict(state) ? t('result.lastEliminated', { count: ELIMINATED_SIPS }) : null
        if (!survival?.winner) return { main: t('result.nobody'), detail: lastOut }
        return {
          main: soft ? t('soft.result.survivor') : t('result.survivor', { count: SURVIVOR_SIPS }),
          detail: lastOut,
        }
      }
    }
  })()

  // Entre deux éliminations, seuls les levés du dernier tirage : les autres ont eu leur écran.
  const liftedCount = liftedToAnnounce(state).length
  const liftedLine =
    liftedCount === 0 || (state.phase !== 'between' && state.phase !== 'result')
      ? null
      : soft
        ? liftedCount === 1
          ? t('soft.result.liftedOne', { count: LIFTED_SOFT_POINTS })
          : t('soft.result.liftedMany', { fingers: liftedCount, count: LIFTED_SOFT_POINTS })
        : liftedCount === 1
          ? t('result.liftedOne', { count: LIFTED_SIPS })
          : t('result.liftedMany', { fingers: liftedCount, count: LIFTED_SIPS })

  // Une seule voix pour le lecteur d'écran, montée en permanence : une région
  // créée avec son texte se tait souvent (VoiceOver).
  const liveText =
    state.phase === 'countdown' && seconds !== null
      ? t('arena.countdown', { count: seconds })
      : state.phase === 'selecting'
        ? t('arena.selecting')
        : verdict
          ? spoken([state.phase === 'result' ? t('result.chosen') : null, verdict.main, verdict.detail, liftedLine])
          : ''

  // ─── Cercles ───────────────────────────────────────────────────────────────
  const lookOf = (id: string, color: number): FingerLook => {
    const { role, lifted } = fingerRole(state, id, lit)
    const liftedBadge: FingerBadge = { text: t('tags.lifted'), tone: 'red' }
    const extra = lifted && role.kind !== 'lifted' ? [liftedBadge] : []
    switch (role.kind) {
      case 'idle':
      case 'alive':
        return { ring: color, badges: [] }
      case 'counting':
        return { ring: color, pulse: true, badges: [] }
      case 'lit':
        return { ring: 'gold', big: true, glow: true, badges: [] }
      case 'waiting':
      case 'spared':
        return { ring: color, dim: true, badges: [] }
      case 'victim':
        return {
          ring: 'gold',
          big: true,
          glow: true,
          dashed: lifted,
          badges: [{ text: t('tags.victim'), tone: 'gold' }, ...extra],
        }
      case 'team':
        return {
          ring: role.team,
          dashed: lifted,
          badges: [{ text: role.team === 'gold' ? t('tags.gold') : t('tags.blue'), tone: role.team }, ...extra],
        }
      case 'rank': {
        const first = role.rank === 1
        return {
          ring: first ? 'gold' : color,
          big: first,
          glow: first,
          dashed: lifted,
          badges: [{ text: format.number(role.rank), tone: first ? 'gold' : 'cream', large: true }, ...extra],
        }
      }
      case 'eliminated':
        return {
          ring: 'red',
          big: role.latest,
          dim: !role.latest,
          badges: [{ text: t('tags.eliminated'), tone: 'red' }, ...extra],
        }
      case 'survivor':
        return { ring: 'gold', big: true, glow: true, badges: [{ text: t('tags.survivor'), tone: 'gold' }, ...extra] }
      case 'lifted':
        return { ring: 'red', dashed: true, badges: [liftedBadge] }
    }
  }

  // ─── Centre de la zone ─────────────────────────────────────────────────────
  let center: ReactNode = null
  if (state.phase === 'countdown' && seconds !== null) {
    center = (
      <motion.span
        key={seconds}
        initial={reduced ? false : { scale: 1.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="font-display text-8xl font-black leading-none tabular-nums text-gold"
      >
        {format.number(seconds)}
      </motion.span>
    )
  } else if (state.phase === 'gathering') {
    const count = fingers.length
    center = (
      <>
        {count === 0 && <Fingerprint aria-hidden className="h-14 w-14 text-gold" />}
        <p className="font-display text-2xl font-bold leading-tight text-cream">
          {count === 0 ? t('arena.place') : count < MIN_FINGERS ? t('arena.oneMore') : t('arena.hold')}
        </p>
        {count === 0 && touchPoints !== null && touchPoints < MIN_FINGERS && (
          <p className="max-w-xs text-sm leading-snug text-cream/70">{t('arena.noTouch')}</p>
        )}
        {count === 0 && touchPoints !== null && touchPoints >= MIN_FINGERS && touchPoints < MAX_FINGERS && (
          <p className="max-w-xs text-sm leading-snug text-cream/70">{t('arena.deviceLimit', { count: touchPoints })}</p>
        )}
      </>
    )
  }

  // ─── Bas de l'écran ────────────────────────────────────────────────────────
  let panel: ReactNode
  switch (state.phase) {
    case 'gathering':
    case 'countdown':
      panel = (
        <>
          <p className="max-w-md text-sm leading-snug text-cream/80">{modeHint}</p>
          {limitReached && (
            <p className="text-xs font-semibold text-gold">{t('arena.limit', { count: deviceMax })}</p>
          )}
        </>
      )
      break
    case 'selecting':
      panel = (
        <>
          <p className="font-display text-xl font-bold leading-tight text-gold">{t('arena.selecting')}</p>
          <p className="text-sm leading-snug text-cream/80">{t('arena.keepDown')}</p>
        </>
      )
      break
    case 'between':
      panel = (
        <>
          {verdict && <p className="font-display text-xl font-bold leading-tight text-red-300">{verdict.main}</p>}
          {verdict?.detail && <p className="text-sm font-semibold leading-snug text-cream">{verdict.detail}</p>}
          {survival && <p className="text-xs text-cream/70">{t('arena.alive', { count: survival.alive.length })}</p>}
          {liftedLine && <p className="text-xs font-semibold text-red-300">{liftedLine}</p>}
        </>
      )
      break
    case 'result':
      panel = (
        <>
          <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">{t('result.chosen')}</p>
          {verdict && <p className="font-display text-xl font-bold leading-tight text-cream">{verdict.main}</p>}
          {verdict?.detail && <p className="text-sm leading-snug text-cream/80">{verdict.detail}</p>}
          {liftedLine && <p className="text-xs font-semibold text-red-300">{liftedLine}</p>}
          <Button variant="primary" size="gameLg" className="mt-1 w-full max-w-xs" onClick={replay}>
            <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
            {tc('replay')}
          </Button>
        </>
      )
      break
  }

  const restartHint = state.phase === 'result' && state.down.length === 0

  const arena = (
    // Calque plein écran au-dessus de la Navbar (z-40), dont les 56 px
    // capteraient des doigts, et sous les dialogues (z-50). `!mt-0` : rendu sur
    // place au serveur, il porte la marge `space-y` de la coquille jusqu'à son
    // passage dans <body>.
    // Téléphone couché dans un navigateur (seules l'appli et la PWA restent en
    // portrait) : en pile, en-tête, pastilles et panneau prenaient 308 px et ne
    // laissaient pas à la zone la hauteur d'un cercle. La zone passe à gauche,
    // sur toute la hauteur ; pastilles puis panneau en colonne à droite.
    <div
      className={cn(
        'app-felt fixed inset-0 z-[45] !mt-0 flex touch-none select-none flex-col overflow-hidden text-cream [-webkit-touch-callout:none]',
        '[@media(max-height:500px)_and_(orientation:landscape)]:grid [@media(max-height:500px)_and_(orientation:landscape)]:grid-cols-[minmax(0,1fr)_18rem] [@media(max-height:500px)_and_(orientation:landscape)]:grid-rows-[auto_auto_minmax(0,1fr)] [@media(max-height:500px)_and_(orientation:landscape)]:gap-x-3'
      )}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p role="status" aria-live="polite" className="sr-only">
        {liveText}
      </p>

      <header
        className={cn(
          'flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]',
          '[@media(max-height:500px)_and_(orientation:landscape)]:col-span-2'
        )}
      >
        <Button asChild variant="ghost" size="gameIcon" className={HEADER_BUTTON}>
          <Link href="/jeux" aria-label={tc('back')}>
            <ArrowLeft aria-hidden className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-center font-display text-base font-bold text-gold sm:text-lg">{t('title')}</h1>
        {fingers.length > 0 && (
          <span className="shrink-0 whitespace-nowrap rounded-full border border-gold/30 bg-black/20 px-2.5 py-1 text-xs font-semibold tabular-nums text-cream/80">
            {t('arena.fingerCount', { count: fingers.length })}
          </span>
        )}
        <Button
          variant="ghost"
          size="gameIcon"
          onClick={toggleSound}
          aria-label={muted ? t('arena.soundOn') : t('arena.soundOff')}
          className={HEADER_BUTTON}
        >
          {muted ? <VolumeX aria-hidden className="h-5 w-5" /> : <Volume2 aria-hidden className="h-5 w-5" />}
        </Button>
      </header>

      {/* Pastilles à la largeur de leur mot : « Sopravvivenza » ou « Supervivencia » ne
          tiennent pas dans un quart d'écran et s'y coupaient en deux. */}
      <div
        ref={modesRef}
        role="group"
        aria-label={t('modesLabel')}
        className={cn(
          'flex shrink-0 flex-wrap gap-1.5 px-3 pb-3',
          '[@media(max-height:500px)_and_(orientation:landscape)]:col-start-2 [@media(max-height:500px)_and_(orientation:landscape)]:row-start-2 [@media(max-height:500px)_and_(orientation:landscape)]:pb-2 [@media(max-height:500px)_and_(orientation:landscape)]:pl-0'
        )}
      >
        {DOIGT_MODES.map((mode) => {
          const active = state.mode === mode
          return (
            <button
              key={mode}
              type="button"
              aria-pressed={active}
              disabled={modesLocked}
              onClick={() => selectMode(mode)}
              className={cn(
                'flex min-h-[44px] flex-auto items-center justify-center rounded-2xl px-2 py-1 text-center text-[13px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream disabled:opacity-40',
                active ? 'bg-gold text-[#24201A]' : 'border border-gold/30 bg-black/20 text-cream/80 hover:bg-gold/10'
              )}
            >
              {t(`modes.${mode}`)}
            </button>
          )
        })}
      </div>

      <div
        className={cn(
          'relative mx-3 min-h-0 flex-1',
          '[@media(max-height:500px)_and_(orientation:landscape)]:col-start-1 [@media(max-height:500px)_and_(orientation:landscape)]:row-start-2 [@media(max-height:500px)_and_(orientation:landscape)]:row-end-4 [@media(max-height:500px)_and_(orientation:landscape)]:mb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] [@media(max-height:500px)_and_(orientation:landscape)]:mr-0'
        )}
      >
        <div
          ref={zoneRef}
          role="application"
          aria-label={t('arena.zone')}
          // `touch-none` sur la zone elle-même : `overflow-hidden` en fait un conteneur de
          // défilement, où le `touch-action` hérité du calque cesse de compter.
          className={cn(
            'absolute inset-0 touch-none overflow-hidden rounded-[1.75rem] border-2 border-dashed bg-black/20 transition-colors [-webkit-tap-highlight-color:transparent]',
            state.phase === 'countdown' ? 'border-gold' : 'border-gold/40'
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerLost}
          onLostPointerCapture={onPointerLost}
        >
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            {center}
          </div>
          {restartHint && (
            <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit max-w-[90%] rounded-full bg-black/30 px-3 py-1 text-center text-xs font-semibold text-cream/80">
              {t('arena.touchToRestart')}
            </p>
          )}
          {fingers.map((finger) => {
            const position = positionsRef.current.get(finger.id) ?? { x: 0, y: 0 }
            const badgeShift =
              zoneWidth > 2 * BADGE_HALF_PX
                ? Math.min(Math.max(position.x, BADGE_HALF_PX), zoneWidth - BADGE_HALF_PX) - position.x
                : 0
            return (
              <FingerMark
                key={finger.id}
                ref={markRef(finger.id)}
                position={position}
                look={lookOf(finger.id, finger.color)}
                badgesBelow={position.y < BADGE_FLIP_PX}
                badgeShift={badgeShift}
                reduced={reduced}
              />
            )
          })}
        </div>
      </div>

      {/* Couché, la colonne défile plutôt que de couper le verdict : `justify-start`,
          car un contenu centré qui déborde perd son haut, hors d'atteinte. */}
      <section
        className={cn(
          'flex min-h-[10.5rem] shrink-0 flex-col items-center justify-center gap-1 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 text-center',
          '[@media(max-height:500px)_and_(orientation:landscape)]:col-start-2 [@media(max-height:500px)_and_(orientation:landscape)]:row-start-3 [@media(max-height:500px)_and_(orientation:landscape)]:min-h-0 [@media(max-height:500px)_and_(orientation:landscape)]:justify-start [@media(max-height:500px)_and_(orientation:landscape)]:overflow-y-auto [@media(max-height:500px)_and_(orientation:landscape)]:pl-0 [@media(max-height:500px)_and_(orientation:landscape)]:pr-3 [@media(max-height:500px)_and_(orientation:landscape)]:pt-1'
        )}
      >
        {panel}
      </section>
    </div>
  )

  return host ? createPortal(arena, host) : arena
}
