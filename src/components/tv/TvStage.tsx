"use client"

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { BrandMark } from '@/components/brand/BrandLogo'
import { JoinQR } from './JoinQR'

/**
 * Ossature plein écran de l'affichage TV : la table vue du dessus — feutre
 * radial, en-tête marqué or, code + QR posés sur une plaque crème fixe
 * (comme une carte sur la table). Pensé paysage, gros textes, lisible à 3 m.
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
    <div className="app-felt fixed inset-0 flex flex-col overflow-hidden text-white">
      <header className="flex items-center justify-between gap-6 border-b border-gold/15 px-6 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-felt-deep p-1.5">
            <BrandMark className="h-full w-full" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/70">{t('brand')}</p>
            <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">{title}</h1>
          </div>
        </div>
        {joinUrl && (
          <div className="flex items-center gap-4 rounded-2xl border border-[#D8CCAE] bg-cream px-4 py-2.5 text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-[#6B6455]">{t('scanToJoin')}</p>
              <p className="font-mono text-3xl font-black tracking-[0.35em] text-[#24201A] sm:text-4xl">{code}</p>
            </div>
            <JoinQR url={joinUrl} size={92} />
          </div>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
