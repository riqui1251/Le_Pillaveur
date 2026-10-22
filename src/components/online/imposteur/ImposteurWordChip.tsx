"use client"

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Eye, EyeOff, Ghost } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'

/**
 * MON MOT SECRET pendant la partie — une bande de 56 px au lieu de la carte
 * pleine (≈ 100 px) : la carte entière, figée en haut de chaque phase,
 * repoussait le fil d'indices et le vote sous la ligne de flottaison. La
 * pleine carte reste à l'échauffement (compte à rebours), où l'on mémorise.
 *
 * Retournable : face crème quand visible, dos treillis or quand masquée (le
 * mot quitte alors le DOM — le voisin de canapé voit l'écran).
 */
export function ImposteurWordChip({
  word,
  eliminated,
  hidden,
  onHiddenChange,
}: {
  word: string
  eliminated: boolean
  hidden: boolean
  onHiddenChange: (hidden: boolean) => void
}) {
  const t = useTranslations('games.imposteur.game')
  const reducedMotion = useReducedMotion()
  const flip = {
    initial: { rotateY: reducedMotion ? 0 : 90, opacity: 0 },
    animate: { rotateY: 0, opacity: 1 },
    exit: { rotateY: reducedMotion ? 0 : 90, opacity: 0 },
    transition: { duration: reducedMotion ? 0 : 0.16 },
  }

  return (
    <div className="relative">
      <AnimatePresence mode="wait" initial={false}>
        {hidden ? (
          <motion.div key="word-back" {...flip}>
            <PlayingCardBack className="h-14" />
          </motion.div>
        ) : (
          <motion.div key="word-face" {...flip}>
            <PlayingCard corners={false} className="flex min-h-[3.5rem] items-center gap-3 py-2 pl-3 pr-14">
              {/* Le coin « K ♠ » de la carte, en 14 px : les coins de PlayingCard sont à 10 px. */}
              <span
                aria-hidden
                className="flex h-10 w-8 shrink-0 flex-col items-center justify-center rounded-md border border-[#D8CCAE] font-display text-sm font-bold leading-none text-[#24201A]"
              >
                <span>K</span>
                <span>♠</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[#6B6455]">
                  {eliminated && <Ghost aria-hidden className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{eliminated ? t('eliminatedYou') : t('yourWord')}</span>
                </p>
                {/* Jamais tronqué : « contratto a tempo determinato » contre
                    « … indeterminato », la nuance est souvent en fin de mot.
                    Éliminé : le mot seul s'estompe (la carte entière à 70 %
                    laissait l'intitulé de 12 px sous 4,5:1). */}
                <p
                  className={cn(
                    'break-words font-display text-lg font-bold leading-snug tracking-wide text-[#24201A]',
                    eliminated && 'opacity-70'
                  )}
                >
                  « {word} »
                </p>
              </div>
            </PlayingCard>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Un seul bouton, hors de la carte qui se retourne : au clavier, le
          focus reste dessus d'une bascule à l'autre. */}
      <button
        type="button"
        onClick={() => onHiddenChange(!hidden)}
        aria-label={hidden ? undefined : t('hideWord')}
        className={cn(
          'absolute inset-y-0 right-1.5 z-10 my-auto flex h-11 items-center rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2',
          hidden
            ? 'gap-1.5 border-gold/40 bg-felt-deep/90 px-3 text-sm font-semibold text-gold hover:bg-felt-deep focus-visible:ring-gold'
            : 'w-11 justify-center border-[#24201A]/20 bg-[#24201A]/5 text-[#24201A]/70 hover:bg-[#24201A]/10 focus-visible:ring-[#24201A]'
        )}
      >
        {hidden ? (
          <>
            <Eye aria-hidden className="h-4 w-4" />
            {t('showWord')}
          </>
        ) : (
          <EyeOff aria-hidden className="h-5 w-5" />
        )}
      </button>
    </div>
  )
}
