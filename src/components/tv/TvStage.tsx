"use client"

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { JoinQR } from './JoinQR'

/**
 * Ossature plein écran de l'affichage TV : en-tête (identité + code + QR
 * « scanner pour rejoindre » optionnel) et zone de contenu. Pensé paysage,
 * gros textes, lisible à distance.
 */
export function TvStage({
  title,
  code,
  joinUrl,
  children,
}: {
  title: string
  code: string
  joinUrl?: string
  children: ReactNode
}) {
  const t = useTranslations('tv')
  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-[#0a0812] text-white">
      <header className="flex items-center justify-between gap-6 border-b border-white/10 px-6 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="text-4xl" aria-hidden>🍺</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-300/60">{t('brand')}</p>
            <h1 className="truncate text-2xl font-extrabold sm:text-3xl">{title}</h1>
          </div>
        </div>
        {joinUrl && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-white/40">{t('scanToJoin')}</p>
              <p className="font-mono text-3xl font-black tracking-[0.35em] text-violet-200 sm:text-4xl">{code}</p>
            </div>
            <JoinQR url={joinUrl} size={92} />
          </div>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
