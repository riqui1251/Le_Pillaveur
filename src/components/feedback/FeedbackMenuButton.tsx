"use client"

import { useTranslations } from 'next-intl'
import { MessageCircle } from 'lucide-react'

/**
 * Entrée « Donner mon avis » du tiroir de navigation. Dans SON fichier, à
 * part du dialogue : la barre l'importe en dur (le tiroir est sur toutes les
 * pages) et, tant qu'il vivait dans FeedbackDialog.tsx, cet import statique
 * embarquait le dialogue entier — Radix Dialog, compression d'images — dans
 * le premier chargement de chaque visiteur, ce qui rendait le `dynamic()` du
 * dialogue sans effet sur le bundle.
 */
export function FeedbackMenuButton({ onClick }: { onClick: () => void }) {
  const t = useTranslations('feedback')

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-white/70 transition-colors hover:bg-white/[0.08] hover:text-white"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
        <MessageCircle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-none">{t('menuTitle')}</p>
        <p className="mt-0.5 truncate text-[11px] opacity-50">{t('menuSubtitle')}</p>
      </div>
    </button>
  )
}
