"use client"

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Apple, Play, Smartphone, Sparkles } from 'lucide-react'
import { isCapacitorApp } from '@/lib/native-app'

/**
 * Page « Application mobile » — visible depuis le NAVIGATEUR uniquement
 * (l'entrée de menu est masquée dans la coquille Capacitor, et la page
 * elle-même affiche un message si on l'ouvre depuis l'app).
 * Les boutons stores sont des emplacements : les liens Google Play /
 * App Store seront branchés à la publication.
 */

function StoreRow({
  icon,
  store,
  soonLabel,
}: {
  icon: React.ReactNode
  store: string
  soonLabel: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-white/80">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold text-white">{store}</p>
      </div>
      <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
        {soonLabel}
      </span>
    </div>
  )
}

export default function ApplicationPage() {
  const t = useTranslations('mobileApp')
  const tNav = useTranslations('nav')

  // Dans la coquille, la page n'a pas de sens : message à la place des stores.
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    setInApp(isCapacitorApp())
  }, [])

  return (
    <main className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="relative container mx-auto max-w-xl px-4 pb-16 pt-6 sm:px-6 sm:pt-10">
        <header className="mb-8 text-center">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">
            {tNav('brand')}
          </p>
          <h1 className="mt-1 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text font-display text-3xl font-bold text-transparent sm:text-4xl">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-white/50">{t('subtitle')}</p>
        </header>

        {inApp ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-100">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
            <p>{t('alreadyInApp')}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-gold/20 bg-white/[0.03] p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                  <Smartphone className="h-5 w-5" />
                </span>
                <p className="text-sm leading-relaxed text-white/70">{t('pitch')}</p>
              </div>
              <div className="space-y-3">
                <StoreRow
                  icon={<Play className="h-5 w-5" />}
                  store={t('googlePlay')}
                  soonLabel={t('soon')}
                />
                <StoreRow
                  icon={<Apple className="h-5 w-5" />}
                  store={t('appStore')}
                  soonLabel={t('soon')}
                />
              </div>
            </div>
            <p className="mt-5 text-center text-xs leading-relaxed text-white/40">{t('note')}</p>
          </>
        )}
      </div>
    </main>
  )
}
