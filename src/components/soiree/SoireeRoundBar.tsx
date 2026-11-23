"use client"

import { useTranslations } from 'next-intl'
import { ArrowRight, Wine } from 'lucide-react'
import { useRouter } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { closeCurrentRound } from '@/lib/soiree/actions'
import { isRoundComplete, playingRoundOf } from '@/lib/soiree/state'
import { useSoiree } from './useSoiree'

/** Id du jeu d'une page `/games/<id>` (chemin sans langue), ou null. */
export function gameIdOf(pathname: string): string | null {
  const match = /^\/games\/([^/]+)/.exec(pathname)
  return match ? match[1] : null
}

/**
 * Bandeau de la soirée sur la page d'un jeu local : quelle manche on joue,
 * et le chemin du retour. Quand le jeu a remonté la fin de partie de tous
 * les joueurs de la manche, il passe à l'or : « continuer la soirée » clôt
 * la manche et ouvre l'entracte. Rien hors d'une manche de CE jeu.
 */
export function SoireeRoundBar({ pathname }: { pathname: string }) {
  const t = useTranslations('soireeBar')
  const router = useRouter()
  const { soiree, save } = useSoiree()
  const gameId = gameIdOf(pathname)
  const round = gameId ? playingRoundOf(soiree, gameId) : null
  if (!soiree || !round) return null

  const complete = isRoundComplete(round)
  const label = t('label', { number: soiree.current + 1, total: soiree.rounds.length })

  const goBack = () => {
    if (complete) save(closeCurrentRound(soiree, Date.now()))
    router.push('/soiree')
  }

  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2 text-sm',
        complete ? 'border-gold/60 bg-gold/20' : 'border-gold/20 bg-felt-deep/60'
      )}
    >
      <Wine aria-hidden className="h-4 w-4 shrink-0 text-gold" />
      <span className="min-w-0 flex-1 truncate font-semibold text-cream/90">
        {complete ? t('complete') : label}
      </span>
      <button
        type="button"
        onClick={goBack}
        className={cn(
          'inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg px-3 font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream',
          complete ? 'soiree-glow bg-amber-500 text-[#24201A] hover:bg-amber-400' : 'border border-gold/30 text-cream hover:bg-gold/10'
        )}
      >
        {complete ? t('continue') : t('back')}
        <ArrowRight aria-hidden className="h-4 w-4" />
      </button>
    </div>
  )
}
