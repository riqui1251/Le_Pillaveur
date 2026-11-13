"use client"

import { useId, type CSSProperties, type RefObject } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Flag, Trophy } from 'lucide-react'
import type { Player } from '@/lib/players'
import type { PcBoom } from '@/lib/patate-chaude/engine'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { BoomBurst } from './bomb'

// Lueur du souffle en jetons (crème, noir), comme le BOUM du Chiffre Piégé : aucun hex, le Soft garde le rouge carreau.
const BOOM_GLOW: CSSProperties = {
  background:
    'radial-gradient(120% 70% at 50% 36%, rgb(var(--cream-rgb) / 0.2) 0%, rgb(var(--cream-rgb) / 0) 45%), radial-gradient(140% 90% at 50% 110%, rgb(0 0 0 / 0.45) 0%, rgb(0 0 0 / 0) 60%)',
}
const CHIP = 'rounded-full bg-black/20 px-3 py-1'

type PcBoomScreenProps = {
  boom: PcBoom
  loser: Player | undefined
  /** Ce que prend le perdant, selon l'ambiance figée au lancement. */
  verdict: string
  /** « Manche 3/10 » : l'en-tête du jeu est caché sous le BOUM. */
  roundLabel: string
  lastRound: boolean
  /** Le temps que le BOUM se lise : un toucher lancé juste avant l'explosion ne l'enjambe pas. */
  locked: boolean
  onNext: () => void
  /** Partie illimitée seulement : « Terminer la partie ». */
  onFinish?: () => void
  /** Barre des gestes : la partie y rend le focus quand l'écran change. */
  actionsRef: RefObject<HTMLDivElement>
}

/**
 * BOUM plein écran, rouge carreau, comme celui du Chiffre Piégé : qui tenait la bombe, ce qu'il
 * prend, la mèche et les passes, puis « Manche suivante ». Le tableau des explosions suit, sur
 * l'écran d'avant l'allumage, et au classement. z-[45] : au-dessus de la Navbar, sous les
 * dialogues. `!mt-0` : rendu dans le conteneur `space-y-*` de games/layout.tsx, dont la marge le
 * décalerait et laisserait la Navbar visible et cliquable au-dessus.
 */
export function PcBoomScreen({
  boom,
  loser,
  verdict,
  roundLabel,
  lastRound,
  locked,
  onNext,
  onFinish,
  actionsRef,
}: PcBoomScreenProps) {
  const t = useTranslations('games.patate-chaude')
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const titleId = useId()

  // Décor coupé à l'écran : les rayons (44 rem) débordent de tout téléphone, et overflow-y-auto
  // rendrait aussi l'axe x défilant. overflow-x-hidden en filet.
  return (
    <section
      aria-labelledby={titleId}
      className="fixed inset-0 z-[45] !mt-0 flex flex-col overflow-y-auto overflow-x-hidden bg-suit-red text-cream"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0" style={BOOM_GLOW} />
        <BoomBurst />
      </div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={reduceMotion ? undefined : { opacity: 1, x: [0, -10, 9, -6, 4, 0] }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-8 text-center"
      >
        <motion.h2
          id={titleId}
          initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 360, damping: 14 }}
          className="font-display text-[clamp(4rem,22vw,6.5rem)] font-bold leading-none tracking-tight text-cream drop-shadow-[0_6px_0_rgba(0,0,0,0.25)]"
        >
          {t('boom.title')}
        </motion.h2>
        {loser && (
          <div className="flex max-w-full items-center justify-center gap-2 text-lg font-semibold">
            <PlayerIcon player={loser} size="lg" />
            <span className="min-w-0 break-words">{t('boom.holder', { name: loser.name })}</span>
          </div>
        )}
        <p className="rounded-2xl bg-black/25 px-5 py-3 font-display text-2xl font-bold leading-tight lining-nums">
          {verdict}
        </p>
        <ul className="flex flex-wrap justify-center gap-2 text-sm">
          <li className={CHIP}>
            {t('boom.fuse')}{' '}
            <b className="tabular-nums">{t('boom.fuseValue', { seconds: Math.round(boom.fuseMs / 1000) })}</b>
          </li>
          <li className={CHIP}>
            {t('boom.passes')} <b className="tabular-nums">{format.number(boom.passes)}</b>
          </li>
          <li className={CHIP}>{roundLabel}</li>
        </ul>
      </motion.div>

      <div className="relative border-t border-cream/20 bg-black/20 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3">
        <div ref={actionsRef} className="mx-auto flex w-full max-w-lg flex-col gap-2">
          <Button
            data-autofocus
            variant="primary"
            size="gameLg"
            className="w-full whitespace-normal leading-tight"
            disabled={locked}
            onClick={onNext}
          >
            {lastRound ? (
              <>
                <Trophy aria-hidden className="mr-2 h-5 w-5 shrink-0" />
                {t('boom.seeRanking')}
              </>
            ) : (
              <>
                {t('boom.next')}
                <ArrowRight aria-hidden className="ml-2 h-5 w-5 shrink-0" />
              </>
            )}
          </Button>
          {onFinish && (
            <Button
              variant="quiet"
              size="game"
              className="w-full border-cream/40 bg-black/20 hover:bg-black/30"
              disabled={locked}
              onClick={onFinish}
            >
              <Flag aria-hidden className="mr-2 h-4 w-4" />
              {t('boom.finish')}
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
