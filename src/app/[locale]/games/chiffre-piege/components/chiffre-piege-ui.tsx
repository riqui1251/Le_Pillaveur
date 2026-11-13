"use client"

import { useId, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import type { Player } from '@/lib/players'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { cn } from '@/lib/utils'
import { chiffrePiegeMark, chiffrePiegeZone } from '@/lib/chiffre-piege/display'
import {
  chiffrePiegeOdds,
  chiffrePiegeStake,
  type ChiffrePiegeBoom,
  type ChiffrePiegePublicView,
} from '@/lib/chiffre-piege/engine'
import { useChiffrePiegeText } from './use-chiffre-piege-text'

/*
 * Briques d'écran du Chiffre Piégé. Elles ne lisent que la VUE PUBLIQUE du
 * moteur (jamais le piège en cours) : la partie en ligne pourra les reprendre
 * telles quelles.
 */

/** Ce qu'il faut d'un joueur pour l'afficher : profil local ou membre d'une table. */
export type ChiffrePiegeSeat = Pick<Player, 'name'> & { preferences?: Player['preferences'] }

/** Intervalle géant + barre 1 → max, zone encore ouverte en or ; `mark` : la saisie en cours. */
export function ChiffrePiegeRangePanel({ view, mark }: { view: ChiffrePiegePublicView; mark: number | null }) {
  const t = useTranslations('games.chiffre-piege')
  const format = useFormatter()
  const zone = chiffrePiegeZone(view)
  const forced = view.low === view.high
  // Collée à droite quand elle touche le bout : ses 6 px minimum restent dans la barre.
  const zoneStyle =
    view.high === view.max ? { right: 0, width: `${zone.width}%` } : { left: `${zone.left}%`, width: `${zone.width}%` }

  return (
    <section className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-4 pb-3 pt-4 text-center">
      <p className="sr-only">
        {forced
          ? t('game.forcedTitle', { value: view.low })
          : t('game.rangeSummary', { low: view.low, high: view.high, max: view.max })}
      </p>
      <div aria-hidden>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          {forced ? t('game.lastLead') : t('game.rangeLead')}
        </p>
        {/* lining-nums : les chiffres elzéviriens de Playfair lisaient « 1oo ». */}
        {forced ? (
          <p className="mt-1 font-display text-[clamp(3.5rem,20vw,5rem)] font-bold leading-none lining-nums tabular-nums text-red-300">
            {format.number(view.low)}
          </p>
        ) : (
          <p className="mt-1 flex items-baseline justify-center gap-3 font-display font-bold lining-nums tabular-nums text-cream">
            <span className="text-[clamp(3rem,16vw,4.5rem)] leading-none">{format.number(view.low)}</span>
            <span className="font-sans text-lg font-semibold italic text-cream/70">{t('game.rangeAnd')}</span>
            <span className="text-[clamp(3rem,16vw,4.5rem)] leading-none">{format.number(view.high)}</span>
          </p>
        )}
        <div className="relative mt-4">
          <div className="relative h-3 overflow-hidden rounded-full bg-black/30">
            <span
              className={cn('absolute inset-y-0 min-w-[6px] rounded-full', forced ? 'bg-red-300' : 'bg-gold')}
              style={zoneStyle}
            />
          </div>
          {mark !== null && (
            <span
              className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded-full bg-cream"
              style={{ left: `${chiffrePiegeMark(mark, view.max)}%` }}
            />
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-xs tabular-nums text-cream/70">
          <span>{format.number(1)}</span>
          <span>{format.number(view.max)}</span>
        </div>
      </div>
    </section>
  )
}

/** Enjeu (ce que prendra le prochain piégé) et risque (1 chance sur N). */
export function ChiffrePiegeTiles({ view, ambiance }: { view: ChiffrePiegePublicView; ambiance: AmbianceMode }) {
  const t = useTranslations('games.chiffre-piege')
  const tx = useChiffrePiegeText(ambiance)
  const label = 'text-xs font-semibold uppercase tracking-[0.14em] text-cream/80'
  const value = 'mt-0.5 font-display text-2xl font-bold leading-tight lining-nums tabular-nums text-cream'

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-suit-red/60 bg-suit-red/20 px-3 py-2.5 text-center">
        <p className={label}>{t('game.stake')}</p>
        <p className={value}>{tx('game.stakeValue', { count: chiffrePiegeStake(view) })}</p>
      </div>
      <div className="rounded-2xl border border-gold/20 bg-felt-deep/70 px-3 py-2.5 text-center">
        <p className={label}>{t('game.risk')}</p>
        <p className={value}>{t('game.riskValue', { count: chiffrePiegeOdds(view) })}</p>
      </div>
    </div>
  )
}

/** Essais de la manche, dans l'ordre : ↑ le piège est plus haut, ↓ plus bas. */
export function ChiffrePiegeHistory({
  view,
  nameOf,
}: {
  view: ChiffrePiegePublicView
  nameOf: (playerId: string) => string
}) {
  const t = useTranslations('games.chiffre-piege')
  const format = useFormatter()

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          {t('game.historyTitle')}
        </h2>
        <p aria-hidden className="text-xs text-cream/70">{t('game.historyLegend')}</p>
      </div>
      {view.history.length === 0 ? (
        <p className="mt-2 text-sm text-cream/70">{t('game.historyEmpty')}</p>
      ) : (
        <ol className="mt-2 flex flex-wrap gap-2">
          {view.history.map((move, index) => (
            <li
              key={index}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-gold/20 bg-black/20 py-1 pl-3 pr-2.5 text-sm text-cream/80"
            >
              <span className="min-w-0 max-w-[8rem] truncate">{nameOf(move.playerId)}</span>
              {move.kind === 'guess' ? (
                <>
                  <span className="font-display text-base font-bold lining-nums tabular-nums text-cream">{format.number(move.value)}</span>
                  {move.dir === 'higher' ? (
                    <ArrowUp aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                  ) : (
                    <ArrowDown aria-hidden className="h-4 w-4 shrink-0 text-gold" />
                  )}
                  <span className="sr-only">{t(move.dir === 'higher' ? 'game.higher' : 'game.lower')}</span>
                </>
              ) : (
                <span className="font-semibold text-gold">{t('game.jokerChip')}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// Décor du BOUM en jetons (rouge carreau, crème) : aucun hex, le Soft ne touche pas au rouge.
const BOOM_GLOW: CSSProperties = {
  background:
    'radial-gradient(120% 70% at 50% 36%, rgb(var(--cream-rgb) / 0.2) 0%, rgb(var(--cream-rgb) / 0) 45%), radial-gradient(140% 90% at 50% 110%, rgb(0 0 0 / 0.45) 0%, rgb(0 0 0 / 0) 60%)',
}
const BOOM_RAYS: CSSProperties = {
  background: 'repeating-conic-gradient(rgb(var(--cream-rgb) / 0.12) 0deg 7deg, rgb(var(--cream-rgb) / 0) 7deg 20deg)',
  WebkitMaskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
  maskImage: 'radial-gradient(circle, black 18%, transparent 68%)',
}

/**
 * BOUM plein écran, rouge carreau : qui est tombé sur quel nombre, ce qu'il
 * prend, puis « Manche suivante » (grisé le temps de lecture). z-[45] : au-
 * dessus de la Navbar, sous les dialogues et le flash « Passe le téléphone ».
 * En ligne, il se monte par portail hors d'OnlineGameStage (contexte
 * d'empilement z-20, sous la Navbar) ; `avatar` (portrait de bot, icône du
 * compte) y remplace l'icône locale, `note` annonce le départ automatique (et
 * un refus), et sans `onContinue` (joueur hors table) il n'y a pas de bouton.
 * `!mt-0` : en local, il est rendu dans le conteneur `space-y-*` de
 * games/layout.tsx, dont la marge le décalerait de 12 à 24 px et laisserait
 * la Navbar visible et cliquable au-dessus.
 */
export function ChiffrePiegeBoomScreen({
  boom,
  loser,
  avatar,
  roundIndex,
  roundsTotal,
  nextStarter,
  canContinue,
  onContinue,
  note,
  ambiance,
  titleRef,
}: {
  boom: ChiffrePiegeBoom
  loser: ChiffrePiegeSeat | undefined
  avatar?: ReactNode
  roundIndex: number
  roundsTotal: number
  nextStarter: ChiffrePiegeSeat | undefined
  canContinue: boolean
  onContinue?: () => void
  note?: ReactNode
  ambiance: AmbianceMode
  titleRef: RefObject<HTMLHeadingElement>
}) {
  const t = useTranslations('games.chiffre-piege')
  const tx = useChiffrePiegeText(ambiance)
  const reduceMotion = useReducedMotion()
  const titleId = useId()
  const name = loser?.name ?? ''
  const lastRound = roundIndex + 1 >= roundsTotal
  const chip = 'rounded-full bg-black/20 px-3 py-1'

  // Décor coupé à l'écran : les rayons (46 rem) débordaient à droite de tout
  // téléphone, et `overflow-y-auto` rend aussi l'axe x défilant — un glissé
  // oblique décalait tout l'écran de 180 px. overflow-x-hidden en filet.
  return (
    <section
      aria-labelledby={titleId}
      className="fixed inset-0 z-[45] !mt-0 flex flex-col overflow-y-auto overflow-x-hidden bg-suit-red text-cream"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={BOOM_GLOW} />
        <div
          className="absolute left-1/2 top-[40%] h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-1/2"
          style={BOOM_RAYS}
        />
      </div>

      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center">
        <motion.h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 14 }}
          className="font-display text-[clamp(4rem,22vw,6.5rem)] font-bold leading-none tracking-tight text-cream drop-shadow-[0_6px_0_rgba(0,0,0,0.25)] focus:outline-none"
        >
          {t('boom.title')}
        </motion.h2>
        {/* Un <div> et non un <p> : PlayerIcon rend un <div>, interdit dans un paragraphe. */}
        <div className="flex max-w-full items-center justify-center gap-2 text-lg font-semibold">
          {avatar ? (
            <span aria-hidden className="shrink-0 text-4xl leading-none">
              {avatar}
            </span>
          ) : (
            loser && <PlayerIcon player={loser} size="lg" />
          )}
          <span className="min-w-0 break-words">{t('boom.who', { name, value: boom.trap })}</span>
        </div>
        <p className="rounded-2xl bg-black/25 px-5 py-3 font-display text-2xl font-bold leading-tight lining-nums">
          {tx('boom.penalty', { name, count: boom.penalty })}
        </p>
        <ul className="flex flex-wrap justify-center gap-2 text-sm">
          <li className={chip}>{t('boom.attempts', { count: boom.attempts })}</li>
          <li className={chip}>{t('boom.round', { round: roundIndex + 1, total: roundsTotal })}</li>
          {nextStarter && <li className={chip}>{t('boom.nextStarter', { name: nextStarter.name })}</li>}
        </ul>
      </div>

      <div className="relative border-t border-cream/20 bg-black/20 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto max-w-lg">
          {note && <p className="mb-2 text-center text-sm font-semibold text-cream/90">{note}</p>}
          {onContinue && (
            <Button
              variant="primary"
              size="gameLg"
              className="w-full whitespace-normal leading-tight"
              disabled={!canContinue}
              onClick={onContinue}
            >
              {lastRound ? t('boom.seeRanking') : t('boom.nextRound')}
              <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
