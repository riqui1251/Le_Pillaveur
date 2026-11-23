"use client"

import { useTranslations } from 'next-intl'
import { ArrowLeft, EyeOff } from 'lucide-react'
import { Link } from '@/i18n/navigation'

/** À la place de la page d'un jeu que l'équipe a caché : la raison, et le chemin vers les autres jeux. */
export function GameUnavailableNotice() {
  const t = useTranslations('common.gameUnavailable')
  return (
    <div role="status" className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-2xl border border-gold/30 bg-felt-deep">
        <EyeOff aria-hidden className="h-8 w-8 text-gold" />
      </span>
      <h1 className="font-display text-3xl font-bold tracking-tight text-cream">{t('title')}</h1>
      <p className="text-pretty text-sm leading-relaxed text-cream/70">{t('text')}</p>
      <Link
        href="/jeux"
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-sm font-bold text-amber-200 transition-colors hover:bg-gold/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t('back')}
      </Link>
    </div>
  )
}

/** Bandeau de l'équipe au-dessus d'un jeu caché : elle le voit, les joueurs non. */
export function GameHiddenStaffBanner() {
  const t = useTranslations('common.gameUnavailable')
  return (
    <p role="note" className="flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/10 px-3 py-2 text-sm font-semibold text-amber-100">
      <EyeOff aria-hidden className="h-4 w-4 shrink-0" />
      {t('staffBanner')}
    </p>
  )
}
