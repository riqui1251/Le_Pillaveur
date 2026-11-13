"use client"

import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { Player } from '@/lib/players'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { assignLanes, scalePosition, type VdnScale } from '@/lib/vue-de-nez/engine'
import { cn } from '@/lib/utils'

export type RulerTone = 'win' | 'lose' | null

export type RulerMarker = {
  id: string
  value: number
  /** Valeur courte déjà formatée (« 1,2 M »). */
  label: string
  player: Pick<Player, 'name'> & { preferences?: Player['preferences'] }
  /** Jeton tout fait (portrait de bot, icône de compte en ligne) à la place de l'icône du joueur local. */
  avatar?: ReactNode
  tone: RulerTone
}

/** Hauteur d'une rangée de marqueurs : valeur (16 px) + jeton (24 px) + air. */
const LANE_PX = 44
const STEM_PX = 12
/** Écart minimal (fraction de la règle) entre deux marqueurs d'une même rangée, ~50 px sur un téléphone. */
const MIN_GAP = 0.17
const MAX_LANES = 4
const BELOW_AXIS_PX = 52
/** Place (fraction de la règle) qu'occupe la moitié d'une borne comme « 1,2 M ». */
const EDGE_LABEL_ROOM = 0.1

const TONE_LABEL: Record<'win' | 'lose' | 'none', string> = {
  win: 'text-gold',
  lose: 'text-red-300',
  none: 'text-cream/80',
}

const TONE_RING: Record<'win' | 'lose' | 'none', string> = {
  win: 'ring-2 ring-gold',
  lose: 'ring-2 ring-red-300',
  none: 'ring-1 ring-cream/30',
}

/**
 * Règle graduée de la révélation : les estimations s'y posent une à une
 * (`shownCount`), puis le drapeau or de la réponse tombe. Décorative pour un
 * lecteur d'écran : la liste des résultats dit la même chose en texte.
 */
export function VdnRuler({
  scale,
  markers,
  shownCount,
  answer,
  startLabel,
  endLabel,
  reduceMotion,
}: {
  scale: VdnScale
  markers: RulerMarker[]
  shownCount: number
  /** null tant que la réponse n'est pas tombée : elle n'est pas dans le DOM avant. */
  answer: { value: number; label: string } | null
  startLabel: string
  endLabel: string
  reduceMotion: boolean
}) {
  const positions = markers.map(m => scalePosition(scale, m.value))
  const lanes = assignLanes(positions, MIN_GAP, MAX_LANES)
  const laneCount = lanes.reduce((max, lane) => Math.max(max, lane + 1), 1)
  const axisTop = laneCount * LANE_PX + STEM_PX
  const height = axisTop + BELOW_AXIS_PX
  const answerX = answer ? scalePosition(scale, answer.value) : 0
  // Près d'un bord, l'étiquette de la réponse se décale vers l'intérieur ; la hampe, elle, reste juste.
  const answerShift = answerX < 0.12 ? 12 : answerX > 0.88 ? 88 : 50
  // La hampe de la réponse barrerait la borne voisine : la réponse, affichée juste dessous, la remplace.
  const showStart = !answer || answerX >= EDGE_LABEL_ROOM
  const showEnd = !answer || answerX <= 1 - EDGE_LABEL_ROOM

  return (
    <div aria-hidden className="relative mx-8" style={{ height }}>
      <div className="absolute inset-x-0 h-0.5 rounded-full bg-cream/40" style={{ top: axisTop - 1 }} />
      {scale.ticks.map(tick => (
        <span
          key={tick}
          className="absolute h-2 w-px -translate-x-1/2 bg-cream/50"
          style={{ left: `${scalePosition(scale, tick) * 100}%`, top: axisTop - 4 }}
        />
      ))}
      {showStart && (
        <span className="absolute -translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-cream/70" style={{ left: 0, top: axisTop + 6 }}>
          {startLabel}
        </span>
      )}
      {showEnd && (
        <span className="absolute translate-x-1/2 whitespace-nowrap text-xs tabular-nums text-cream/70" style={{ right: 0, top: axisTop + 6 }}>
          {endLabel}
        </span>
      )}

      {markers.map((marker, i) => {
        if (i >= shownCount) return null
        const tone = answer ? (marker.tone ?? 'none') : 'none'
        return (
          <div
            key={marker.id}
            className="absolute -translate-x-1/2"
            style={{ left: `${positions[i] * 100}%`, bottom: height - axisTop }}
          >
            <motion.div
              className="flex flex-col items-center"
              initial={reduceMotion ? false : { opacity: 0, y: -16, scale: 0.6 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            >
              <span className={cn('whitespace-nowrap text-xs font-bold tabular-nums', TONE_LABEL[tone])}>
                {marker.label}
              </span>
              {marker.avatar ? (
                <span
                  className={cn(
                    'mt-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-felt-deep text-sm leading-none transition-shadow',
                    TONE_RING[tone]
                  )}
                >
                  {marker.avatar}
                </span>
              ) : (
                <PlayerIcon
                  player={marker.player}
                  size="sm"
                  className={cn('mt-0.5 rounded-full bg-felt-deep transition-shadow', TONE_RING[tone])}
                />
              )}
              <span className="w-px bg-cream/60" style={{ height: STEM_PX - 2 + lanes[i] * LANE_PX }} />
            </motion.div>
          </div>
        )
      })}

      {answer && (
        <div className="absolute" style={{ left: `${answerX * 100}%`, top: axisTop }}>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
          >
            <span className="absolute left-0 top-0 h-6 w-0.5 -translate-x-1/2 bg-gold" />
            <span
              className="absolute top-6 whitespace-nowrap rounded-md bg-gold px-2 py-0.5 font-display text-sm font-bold tabular-nums text-[#24201A] shadow-[0_6px_14px_-6px_rgba(0,0,0,0.7)]"
              style={{ transform: `translateX(-${answerShift}%)` }}
            >
              {answer.label}
            </span>
          </motion.div>
        </div>
      )}
    </div>
  )
}
