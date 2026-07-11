"use client"

import { useTranslations } from 'next-intl'
import { OnlineRankingBoard } from '@/components/online/OnlineRankingBoard'

/**
 * Page Classement — EN LIGNE uniquement : classement général + top 5 par jeu
 * (victoires/défaites/parties/%). Le classement des joueurs locaux a été
 * retiré volontairement : seules les parties en ligne comptent.
 */
export default function ClassementPage() {
  const t = useTranslations('ranking')
  const tNav = useTranslations('nav')

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      {/* Lueurs sur le feutre (le fond radial vient du layout .app-felt). */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="relative container mx-auto max-w-3xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">
        <header className="mb-8 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">{tNav('brand')}</p>
          <h1 className="mt-1 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text font-display text-3xl font-bold text-transparent sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-white/50">{t('online.subtitle')}</p>
        </header>

        <OnlineRankingBoard />
      </div>
    </main>
  )
}
