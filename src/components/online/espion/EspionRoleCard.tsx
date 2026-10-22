"use client"

import { useTranslations } from 'next-intl'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Eye, EyeOff } from 'lucide-react'
import { PlayingCard, PlayingCardBack } from '@/components/ui/PlayingCard'
import { cn } from '@/lib/utils'

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep'

/**
 * Carte de rôle de L'Espion — LA MÊME carte crème pour toute la table.
 *
 * L'espion avait un panneau de feutre sombre là où l'équipe avait une grande
 * carte crème lumineuse : dans une pièce tamisée, on repérait son téléphone à
 * deux mètres sans rien lire. Ici, même carte, même hauteur fixe, mêmes trois
 * lignes (le lieu, ou « ? ? ? » ; puis le rôle) : de loin, rien ne distingue
 * l'espion. Et, comme au Loup-Garou ou à l'Imposteur, l'œil retourne la carte
 * quand un voisin se penche (le contenu quitte le DOM).
 */
export function EspionRoleCard({
  location,
  hidden,
  onHiddenChange,
  withHint = false,
  className,
}: {
  /** Le lieu ; null pour l'espion. */
  location: string | null
  hidden: boolean
  onHiddenChange: (hidden: boolean) => void
  /** Consigne du rôle sous la carte (compte à rebours de lancement). */
  withHint?: boolean
  className?: string
}) {
  const t = useTranslations('games.espion.game')
  const reduced = useReducedMotion()
  const spy = location === null
  // Hauteur FIXE, identique face et dos, espion ou équipe : la silhouette ne
  // trahit rien. Elle prévoit deux lignes de lieu (« Chantier de construction »
  // ne tient pas sur une à 375 px) : le nom n'est jamais coupé.
  const height = withHint ? 'h-[12.5rem]' : 'h-[8rem]'
  const flip = {
    initial: { rotateY: reduced ? 0 : 90, opacity: 0 },
    animate: { rotateY: 0, opacity: 1 },
    exit: { rotateY: reduced ? 0 : 90, opacity: 0 },
    transition: { duration: reduced ? 0 : 0.16 },
  }

  return (
    <div className={cn('relative', className)}>
      <AnimatePresence mode="wait" initial={false}>
        {hidden ? (
          <motion.div key="back" {...flip}>
            <PlayingCardBack className={height} />
          </motion.div>
        ) : (
          <motion.div key="face" {...flip}>
            <PlayingCard suit="spade" rank="Q" className={height}>
              <div className="flex h-full flex-col items-center justify-center px-12 py-3 text-center">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6B6455]">{t('yourLocation')}</p>
                <p className="line-clamp-2 w-full break-words font-display text-xl font-bold leading-tight tracking-wide text-[#24201A]">
                  {spy ? t('unknownLocation') : location}
                </p>
                <p className="mt-0.5 text-base font-bold leading-snug text-[#24201A]">
                  {spy ? t('youAreSpy') : t('crewRole')}
                </p>
                {withHint && (
                  <p className="mt-1.5 line-clamp-3 text-sm leading-snug text-[#6B6455]">
                    {spy ? t('spyHint') : t('crewHint')}
                  </p>
                )}
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
        aria-label={hidden ? t('showRole') : t('hideRole')}
        className={cn(
          'absolute right-1.5 top-1.5 z-10 flex h-11 w-11 items-center justify-center rounded-xl border transition-colors',
          hidden
            ? 'border-gold/40 bg-felt-deep/80 text-gold hover:bg-gold/10'
            : 'border-[#24201A]/20 text-[#24201A]/70 hover:bg-[#24201A]/10',
          FOCUS_RING
        )}
      >
        {hidden ? <Eye className="h-5 w-5" aria-hidden /> : <EyeOff className="h-5 w-5" aria-hidden />}
      </button>
    </div>
  )
}
