"use client"

import { useLocale } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { RotateCcw } from 'lucide-react'

/**
 * « Réessayer » de la page hors ligne : recharge la page que le joueur
 * voulait (`?from=/compte`, chemin SANS langue posé par le service worker),
 * ou le hub à défaut. Un chargement COMPLET (window.location), pas une
 * navigation client : c'est le worker qui décide alors — réseau revenu, la
 * vraie page ; toujours en panne, retour ici.
 *
 * `from` est une valeur d'URL : seul un chemin absolu du site passe (pas de
 * `//hote` qui enverrait ailleurs, pas de chemin relatif qui s'additionnerait).
 */
export function OfflineRetryButton({ label }: { label: string }) {
  const locale = useLocale()
  const searchParams = useSearchParams()
  const from = searchParams.get('from') ?? ''
  const target = from.startsWith('/') && !from.startsWith('//') ? `/${locale}${from}` : `/${locale}/jeux`

  return (
    <button
      type="button"
      onClick={() => window.location.assign(target)}
      className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-6 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500 active:scale-[0.98]"
    >
      <RotateCcw className="h-5 w-5" aria-hidden />
      {label}
    </button>
  )
}
