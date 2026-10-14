"use client"

import { Beer, Sparkles, Trophy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import type { TvRoomDto } from '@/lib/online-room'
import { cn } from '@/lib/utils'
import { getCaseMeta, CASE_FAMILY_STYLE } from '@/lib/petit-buveur/case-families'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { DiceFace } from '../petit-buveur/DiceOverlay'
import { TvAvatar } from './tv-shared'
import {
  CASE_HOLD_MS,
  DICE_HOLD_MS,
  caseRevealDelay,
  petitBuveurTvCues,
  type TvPetitBuveurState,
} from './petit-buveur-cues'

const BOARD_SIZE = 30
const COLS = 10

/** Rendu TV du Petit Buveur en partie : plateau 30 cases + pions + tour courant + scores. */
export function TvPetitBuveur({ room, state }: { room: TvRoomDto; state: TvPetitBuveurState }) {
  const t = useTranslations('tv')
  const tPb = useTranslations('games.petit-buveur')
  const tCase = useTranslations('games.petit-buveur.caseTypes')
  const reduced = useReducedMotion()
  const { mode: deviceAmbiance } = useAmbianceMode()
  // La partie locale transmet SON ambiance ; à défaut (partie en ligne), celle de l'écran.
  const soft = (state.ambiance ?? deviceAmbiance) === 'soft'
  const DrinkIcon = soft ? Sparkles : Beer
  const players = state.players
  const activeId = room.currentTurnUserId ?? players[state.currentPlayer]?.id ?? null
  const active = players.find((p) => p.id === activeId) ?? players[state.currentPlayer] ?? null
  const activeIndex = active ? players.findIndex((p) => p.id === active.id) : -1

  const cues = petitBuveurTvCues(state)
  const [diceValue, setDiceValue] = useState<number | null>(null)
  const [caseFlash, setCaseFlash] = useState<{ type: string; key: string } | null>(null)
  // Clés vues au montage : une TV allumée en cours de partie ne rejoue pas le dernier coup.
  const seenDiceKeyRef = useRef(cues.diceKey)
  const seenCaseKeyRef = useRef(cues.caseKey)
  const diceShownAtRef = useRef<number | null>(null)
  const diceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const caseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(
    () => () => {
      if (diceTimerRef.current) clearTimeout(diceTimerRef.current)
      caseTimersRef.current.forEach(clearTimeout)
    },
    []
  )

  // Déclaré AVANT l'effet de case : quand dé et case changent ensemble, le dé
  // est posé d'abord et la case attend sa fin.
  useEffect(() => {
    if (cues.diceKey === seenDiceKeyRef.current) return
    seenDiceKeyRef.current = cues.diceKey
    if (cues.diceKey === null || cues.dice === null) return
    if (diceTimerRef.current) clearTimeout(diceTimerRef.current)
    caseTimersRef.current.forEach(clearTimeout)
    caseTimersRef.current = []
    setCaseFlash(null)
    setDiceValue(cues.dice)
    diceShownAtRef.current = Date.now()
    diceTimerRef.current = setTimeout(() => {
      setDiceValue(null)
      diceShownAtRef.current = null
    }, DICE_HOLD_MS)
  }, [cues.diceKey, cues.dice])

  useEffect(() => {
    const caseKey = cues.caseKey
    const caseType = cues.caseType
    if (caseKey === seenCaseKeyRef.current) return
    seenCaseKeyRef.current = caseKey
    if (caseKey === null || caseType === null || !tCase.has(caseType)) return
    caseTimersRef.current.forEach(clearTimeout)
    caseTimersRef.current = [
      setTimeout(() => {
        setCaseFlash({ type: caseType, key: caseKey })
        caseTimersRef.current.push(setTimeout(() => setCaseFlash(null), CASE_HOLD_MS))
      }, caseRevealDelay(diceShownAtRef.current, Date.now())),
    ]
  }, [cues.caseKey, cues.caseType, tCase])

  const caseMeta = caseFlash ? getCaseMeta(caseFlash.type) : null
  const caseStyle = caseMeta ? CASE_FAMILY_STYLE[caseMeta.family] : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-5 sm:px-10">
      {active && (
        <AnimatePresence mode="wait">
          <motion.div
            key={activeId}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: -12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="flex items-center justify-center gap-4"
          >
            <TvAvatar name={active.name} index={activeIndex} size={64} active />
            <div className="text-center">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-gold/90">{t('turnOf')}</p>
              <p className="text-4xl font-black sm:text-5xl">{active.name}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div
          className="grid w-full max-w-5xl gap-2"
          style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: BOARD_SIZE }).map((_, i) => {
            const here = players
              .map((p, idx) => ({ p, idx }))
              .filter(({ p }) => p.position === i)
            const isFinish = i === BOARD_SIZE - 1
            const isStart = i === 0
            return (
              <div
                key={i}
                className={cn(
                  'relative flex aspect-square items-center justify-center rounded-xl border',
                  isFinish
                    ? 'border-amber-400/40 bg-amber-500/10'
                    : isStart
                      ? 'border-emerald-400/30 bg-emerald-500/10'
                      : 'border-white/10 bg-white/[0.03]',
                )}
              >
                <span className="absolute left-1 top-1 text-[11px] font-semibold text-white/60">{i + 1}</span>
                {isFinish && <Trophy aria-hidden className="absolute h-6 w-6 opacity-25" />}
                <div className="flex flex-wrap items-center justify-center gap-0.5">
                  {here.map(({ p, idx }) => (
                    <motion.div
                      key={p.id}
                      layoutId={`tv-token-${p.id}`}
                      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 26 }}
                      className="inline-flex"
                    >
                      <TvAvatar name={p.name} index={idx} size={22} active={p.id === activeId} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        {players.map((p, idx) => (
          <div
            key={p.id}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5',
              p.id === activeId ? 'border-gold/60 bg-gold/[0.15]' : 'border-white/10 bg-white/[0.03]',
            )}
          >
            <TvAvatar name={p.name} index={idx} size={28} />
            <span className="text-base font-bold">{p.name}</span>
            <span className="text-sm text-white/75">{t('position')} {p.position + 1}</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-red-300">
              <span aria-hidden>{p.drinks}</span>
              <DrinkIcon aria-hidden className="h-4 w-4" />
              <span className="sr-only">
                {tPb(soft ? 'soft.game.drinksShort' : 'game.drinksShort', { count: p.drinks })}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* Dé et reveal de case : mise en scène des tours, sans son (la TV reste muette). */}
      <AnimatePresence>
        {diceValue !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
            className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-[1px]"
          >
            <motion.div
              initial={reduced ? { scale: 1, rotate: 0 } : { scale: 1.4, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            >
              <DiceFace value={diceValue} accent size={160} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Centrage par le conteneur : le transform inline de framer-motion
          écraserait un -translate-x-1/2 posé sur la carte elle-même. */}
      <div className="pointer-events-none fixed inset-x-0 top-28 z-30 flex justify-center px-6">
        <AnimatePresence>
          {caseFlash && caseMeta && caseStyle && (
            <motion.div
              key={caseFlash.key}
              initial={reduced ? { opacity: 0 } : { opacity: 0, rotateX: -80, scale: 0.9 }}
              animate={{ opacity: 1, rotateX: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              style={{ transformPerspective: 800 }}
              className={cn(
                'rounded-2xl border px-8 py-5 text-center shadow-2xl',
                caseStyle.border,
                caseStyle.bg,
              )}
            >
              <span className="text-5xl" aria-hidden>{caseMeta.icon}</span>
              <p className={cn('mt-2 text-2xl font-black', caseStyle.text)}>{tCase(caseFlash.type)}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
