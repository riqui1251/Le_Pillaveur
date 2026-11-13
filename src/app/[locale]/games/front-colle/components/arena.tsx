"use client"

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowUp, Hand, X } from 'lucide-react'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { FC_COUNTDOWN_MS, type FcMode, type FcWord } from '@/lib/front-colle/engine'
import { fitWordFontPx } from '@/lib/front-colle/display'
import {
  TILT_TRACKER_START,
  acceptGesture,
  isTap,
  restSide,
  stepTilt,
  type PointerMark,
  type TiltGesture,
  type TiltTracker,
} from '@/lib/front-colle/tilt'
import { playGameSound } from '@/lib/sound/game-sounds'
import { cn } from '@/lib/utils'
import { useViewport, type TiltPermission } from './device'

export type SensorStatus = 'unknown' | 'active' | 'unavailable'

/** Sans aucune lecture du capteur au bout d'une seconde : on joue au toucher (fiche du jeu). */
const SENSOR_WAIT_MS = 1_000
/** Flash vert ou rouge après un geste : le mot suivant reste caché le temps de revenir droit. */
const FLASH_MS = 650
const REDUCED_FLASH_MS = 350
/** Dernières secondes : un tic par seconde, puis l'anneau passe au rouge. */
const TICK_FROM_S = 5
const URGENT_FROM_S = 10
const RING_RADIUS = 44
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

type TouchMark = PointerMark & { valid: boolean }

export interface ArenaProps {
  phase: 'countdown' | 'playing'
  phaseEndsAt: number
  durationMs: number
  word: FcWord | null
  mode: FcMode | null
  found: number
  passed: number
  /** Choix « Retourner » de l'écran Prêt, gardé pour la partie. */
  flipped: boolean
  /** Bord de l'appareil tourné vers le haut, lu par le capteur (null : pas encore lu). */
  side: 1 | -1 | null
  onSide: (side: 1 | -1) => void
  permission: TiltPermission
  sensor: SensorStatus
  onSensor: (status: SensorStatus) => void
  /** Vrai si le geste a compté : l'arène affiche alors son flash. */
  onGesture: (gesture: TiltGesture) => boolean
  onStop: () => void
  /** Confirmation ouverte par-dessus l'arène : aucun geste ne compte, le chrono est gelé. */
  paused: boolean
}

/**
 * L'arène de jeu, en paysage, par-dessus tout le site (`fixed inset-0 z-[45]` :
 * au-dessus de la barre du site, sous les confirmations). Fenêtre en portrait
 * (rotation automatique coupée, appli installée bloquée en portrait) : le
 * cadre tourne de 90° pour que la table lise le mot ; le capteur dit de quel
 * côté, « Retourner » corrige à la main.
 */
export function Arena(props: ArenaProps) {
  const { phase, phaseEndsAt, durationMs, word, mode, found, passed, flipped, side, sensor, paused } = props
  const t = useTranslations('games.front-colle')
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const viewport = useViewport()
  const [now, setNow] = useState(() => Date.now())
  const [flash, setFlash] = useState<{ gesture: TiltGesture; key: number } | null>(null)

  const latest = useRef(props)
  latest.current = props
  const reducedRef = useRef(reduceMotion)
  reducedRef.current = reduceMotion
  const trackerRef = useRef<TiltTracker>(TILT_TRACKER_START)
  const pointersRef = useRef(new Map<number, TouchMark>())
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Un geste (inclinaison déjà filtrée, toucher, clavier) : compté seulement en jeu. */
  const dispatchRef = useRef((gesture: TiltGesture) => {
    const current = latest.current
    if (current.phase !== 'playing' || current.paused) return
    if (!current.onGesture(gesture)) return
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    setFlash({ gesture, key: performance.now() })
    flashTimerRef.current = setTimeout(() => {
      flashTimerRef.current = null
      setFlash(null)
    }, reducedRef.current ? REDUCED_FLASH_MS : FLASH_MS)
  })

  /** Toucher ou clavier : même anti-rebond que l'inclinaison. */
  const pressRef = useRef((gesture: TiltGesture) => {
    const at = performance.now()
    if (!acceptGesture(trackerRef.current.lastGestureAt, at)) return
    trackerRef.current = { ...trackerRef.current, lastGestureAt: at }
    dispatchRef.current(gesture)
  })

  useEffect(() => {
    const id = window.setInterval(() => {
      // Question « Arrêter ce tour ? » ouverte : le chrono est gelé, l'anneau aussi.
      if (!latest.current.paused) setNow(Date.now())
    }, 200)
    return () => {
      window.clearInterval(id)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  // Nouvelle échéance (décompte → jeu, reprise après la question) : l'horloge d'affichage se recale avant
  // la peinture, sinon le dernier tic, plus ancien que l'échéance, ferait lire 61 au premier mot.
  useLayoutEffect(() => {
    setNow(Date.now())
  }, [phase, phaseEndsAt, paused])

  // Capteur d'orientation : gestes, côté du téléphone, et repli au toucher sans lecture.
  useEffect(() => {
    if (latest.current.permission !== 'granted') {
      latest.current.onSensor('unavailable')
      return
    }
    let received = false
    const onOrientation = (event: DeviceOrientationEvent) => {
      const { beta, gamma } = event
      if (beta === null || gamma === null) return
      if (!received) {
        received = true
        latest.current.onSensor('active')
      }
      const restingSide = restSide(beta, gamma)
      if (restingSide !== null && restingSide !== latest.current.side) latest.current.onSide(restingSide)
      const step = stepTilt(trackerRef.current, { beta, gamma, at: performance.now() })
      trackerRef.current = step.tracker
      if (step.gesture) dispatchRef.current(step.gesture)
    }
    window.addEventListener('deviceorientation', onOrientation)
    const fallback = window.setTimeout(() => {
      if (!received) latest.current.onSensor('unavailable')
    }, SENSOR_WAIT_MS)
    return () => {
      window.removeEventListener('deviceorientation', onOrientation)
      window.clearTimeout(fallback)
    }
  }, [])

  // Clavier (ordinateur, lecteur d'écran) : flèches = gestes, Échap = arrêter le tour.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.repeat || latest.current.paused) return
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
        event.preventDefault()
        pressRef.current('found')
      } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
        event.preventDefault()
        pressRef.current('passed')
      } else if (event.key === 'Escape') {
        event.preventDefault()
        latest.current.onStop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const remainingMs = Math.min(phase === 'playing' ? durationMs : FC_COUNTDOWN_MS, Math.max(0, phaseEndsAt - now))
  const secondsLeft = Math.ceil(remainingMs / 1000)

  // 3-2-1 : un tic par chiffre (le « 3 » a sonné au clic « Prêt »), puis un tic par seconde à la fin du chrono.
  useEffect(() => {
    if (phase === 'countdown' && secondsLeft > 0 && secondsLeft < FC_COUNTDOWN_MS / 1000) playGameSound('tick')
    if (phase === 'playing' && secondsLeft > 0 && secondsLeft <= TICK_FROM_S) playGameSound('tick')
  }, [phase, secondsLeft])

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current
    // Deux doigts posés à la fois : on tient le téléphone, on ne joue pas.
    const grip = pointers.size > 0
    if (grip) pointers.forEach((mark) => { mark.valid = false })
    pointers.set(event.pointerId, { at: event.timeStamp, x: event.clientX, y: event.clientY, valid: !grip })
  }
  const pointerUp = (gesture: TiltGesture) => (event: PointerEvent<HTMLDivElement>) => {
    const mark = pointersRef.current.get(event.pointerId)
    pointersRef.current.delete(event.pointerId)
    if (!mark || !mark.valid) return
    if (!isTap(mark, { at: event.timeStamp, x: event.clientX, y: event.clientY })) return
    pressRef.current(gesture)
  }
  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId)
  }
  const zoneKey = (gesture: TiltGesture) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    pressRef.current(gesture)
  }

  // `!mt-0` : l'arène est rendue dans le conteneur `space-y-*` de games/layout.tsx, dont la marge la décalerait
  // de 12 à 24 px et laisserait la Navbar cliquable au-dessus.
  if (!viewport) return <div className="fixed inset-0 z-[45] !mt-0 bg-felt-deep" />

  const { width, height, portrait, upsideDown } = viewport
  const frameW = portrait ? height : width
  const frameH = portrait ? width : height
  const quarter = side === -1 ? -90 : 90
  const angle = (portrait ? (upsideDown ? -quarter : quarter) : 0) + (flipped ? 180 : 0)

  const touchOnly = sensor === 'unavailable'
  const urgent = phase === 'playing' && secondsLeft <= URGENT_FROM_S
  const band = Math.max(40, Math.round(frameH * 0.14))
  const bandFont = Math.max(14, Math.round(frameH * 0.05))
  const padX = Math.max(28, Math.round(frameW * 0.05))
  const gap = Math.max(10, Math.round(frameW * 0.02))
  const sideCol = Math.round(frameW * 0.17)
  const middleH = frameH - 2 * band
  const ring = Math.round(Math.min(middleH * 0.62, sideCol))
  const cardW = Math.max(120, frameW - 2 * padX - 2 * sideCol - 2 * gap)
  const cardH = Math.round(middleH * 0.86)
  const pillFont = Math.max(12, Math.round(frameH * 0.04))
  const wordPx = word
    ? fitWordFontPx(word.word, cardW - 40, cardH - pillFont * 3.2 - 32, Math.round(frameH * 0.3))
    : 0
  const ratio = durationMs > 0 ? Math.min(1, remainingMs / durationMs) : 0

  return (
    <div
      className="fixed inset-0 z-[45] !mt-0 touch-none select-none overflow-hidden bg-felt-deep [-webkit-touch-callout:none]"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="absolute left-1/2 top-1/2 text-cream"
        style={{
          width: frameW,
          height: frameH,
          transform: `translate(-50%, -50%) rotate(${angle}deg)`,
        }}
      >
        {/* Les deux moitiés tactiles, toujours actives : en haut je passe, en bas trouvé. Gauche et droite
            s'inversent entre le devineur (écran sur son front) et la table ; haut et bas, non, comme l'inclinaison. */}
        <div className="absolute inset-0 grid grid-rows-2">
          {(['passed', 'found'] as const).map((gesture) => (
            <div
              key={gesture}
              role="button"
              tabIndex={0}
              aria-label={gesture === 'found' ? t('arena.foundZone') : t('arena.passZone')}
              className="h-full w-full focus:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-gold/40"
              onPointerDown={onPointerDown}
              onPointerUp={pointerUp(gesture)}
              onPointerCancel={onPointerCancel}
              onKeyDown={zoneKey(gesture)}
            />
          ))}
        </div>

        <div className="pointer-events-none relative flex h-full flex-col">
          <div
            className={cn(
              'relative flex shrink-0 items-center justify-center gap-2 border-b px-16 text-center font-semibold leading-tight',
              touchOnly ? 'border-red-300/30 bg-suit-red/20 text-red-300' : 'border-gold/20 bg-black/25 text-cream/80'
            )}
            style={{ height: band, fontSize: bandFont }}
          >
            {touchOnly ? <Hand aria-hidden className="h-[1.2em] w-[1.2em] shrink-0" /> : <ArrowUp aria-hidden className="h-[1.2em] w-[1.2em] shrink-0" />}
            <span className="line-clamp-2">{touchOnly ? t('arena.touchUp') : t('arena.up')}</span>
            <button
              type="button"
              onClick={props.onStop}
              aria-label={t('arena.stop')}
              className="pointer-events-auto absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl border border-gold/20 bg-black/30 text-cream/70 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <X aria-hidden className="h-5 w-5" />
            </button>
          </div>

          <div
            className="grid min-h-0 flex-1 items-center"
            style={{ gridTemplateColumns: `${sideCol}px minmax(0, 1fr) ${sideCol}px`, columnGap: gap, paddingLeft: padX, paddingRight: padX }}
          >
            {phase === 'countdown' ? (
              <div className="col-span-3 flex flex-col items-center justify-center gap-2 text-center">
                <p className="font-semibold text-cream/80" style={{ fontSize: bandFont }}>
                  {t('arena.getReady')}
                </p>
                <motion.p
                  key={secondsLeft}
                  initial={reduceMotion ? false : { scale: 1.35, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                  className="font-display font-black leading-none tabular-nums text-gold"
                  style={{ fontSize: Math.round(middleH * 0.55) }}
                >
                  {format.number(Math.max(1, secondsLeft))}
                </motion.p>
              </div>
            ) : (
              <>
                <div className="flex flex-col items-center justify-center gap-1 text-center">
                  <div className="relative" style={{ width: ring, height: ring }}>
                    <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden>
                      <circle cx="50" cy="50" r={RING_RADIUS} fill="none" strokeWidth="9" className="stroke-black/30" />
                      <circle
                        cx="50"
                        cy="50"
                        r={RING_RADIUS}
                        fill="none"
                        strokeWidth="9"
                        strokeLinecap="round"
                        strokeDasharray={RING_LENGTH}
                        strokeDashoffset={RING_LENGTH * (1 - ratio)}
                        className={cn(
                          'transition-[stroke-dashoffset] duration-200 ease-linear',
                          urgent ? 'stroke-red-400' : 'stroke-gold'
                        )}
                      />
                    </svg>
                    <span
                      className={cn(
                        'absolute inset-0 flex items-center justify-center font-display font-black tabular-nums',
                        urgent ? 'text-red-300' : 'text-cream'
                      )}
                      style={{ fontSize: Math.round(ring * 0.36) }}
                    >
                      {format.number(secondsLeft)}
                    </span>
                  </div>
                  <span className="text-cream/70" style={{ fontSize: pillFont }}>
                    {t('arena.secondsLeft', { count: secondsLeft })}
                  </span>
                </div>

                <div className="flex items-center justify-center" style={{ height: cardH }}>
                  <PlayingCard suit="heart" rank="6" className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 py-4">
                    {word && mode ? (
                      <>
                        <span
                          className="rounded-full bg-suit-red px-[0.9em] py-[0.35em] font-bold uppercase leading-none tracking-[0.2em] text-cream"
                          style={{ fontSize: pillFont }}
                        >
                          {t(`modes.${mode}`)}
                        </span>
                        <p
                          className="max-w-full text-center font-display font-black leading-[1.05] text-[#24201A] [overflow-wrap:anywhere] [text-wrap:balance]"
                          style={{ fontSize: wordPx }}
                        >
                          {word.word}
                        </p>
                      </>
                    ) : (
                      <p className="text-center font-display font-bold text-[#24201A]" style={{ fontSize: bandFont }}>
                        {t('arena.noWords')}
                      </p>
                    )}
                  </PlayingCard>
                </div>

                <div className="flex flex-col items-center justify-center gap-1 text-center">
                  <span className="font-display font-black leading-none tabular-nums text-gold" style={{ fontSize: Math.round(middleH * 0.32) }}>
                    {format.number(found)}
                  </span>
                  <span className="text-cream/70" style={{ fontSize: pillFont }}>
                    {t('arena.foundLabel', { count: found })}
                  </span>
                  <span className="font-semibold text-red-300" style={{ fontSize: pillFont }}>
                    {t('arena.passedCount', { count: passed })}
                  </span>
                </div>
              </>
            )}
          </div>

          <div
            className="flex shrink-0 items-center justify-center gap-2 border-t border-emerald-300/30 bg-emerald-500/20 px-16 text-center font-semibold leading-tight text-emerald-200"
            style={{ height: band, fontSize: bandFont }}
          >
            {touchOnly ? <Hand aria-hidden className="h-[1.2em] w-[1.2em] shrink-0" /> : <ArrowDown aria-hidden className="h-[1.2em] w-[1.2em] shrink-0" />}
            <span className="line-clamp-2">{touchOnly ? t('arena.touchDown') : t('arena.down')}</span>
          </div>
        </div>

        {flash && (
          <div
            key={flash.key}
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center justify-center',
              flash.gesture === 'found' ? 'bg-emerald-600' : 'bg-suit-red'
            )}
          >
            <span className="font-display font-black text-cream" style={{ fontSize: Math.round(frameH * 0.22) }}>
              {flash.gesture === 'found' ? t('arena.flashFound') : t('arena.flashPassed')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
