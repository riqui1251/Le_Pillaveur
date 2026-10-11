"use client"

import { useTranslations } from 'next-intl'
import { WifiOff } from 'lucide-react'
import { useBrowserOnline } from '@/hooks/useBrowserOnline'
import { cn } from '@/lib/utils'

/**
 * Bandeau du hub quand le navigateur se dit hors ligne : les jeux « un seul
 * téléphone » restent jouables (le service worker sert leurs pages), les
 * tables en ligne non. Pendant d'un ConnectionBanner (salle en ligne) pour
 * la page d'entrée de l'app, où l'on n'est dans aucune salle.
 *
 * La région live est TOUJOURS montée, vide tant que tout va bien (`sr-only`,
 * hors du flux : rien ne décale les bascules) : une région `aria-live` qui
 * n'existe qu'au moment de parler n'est pas annoncée par tous les lecteurs
 * d'écran — VoiceOver iOS notamment (cf. ConnectionLiveRegion).
 */
export function OfflineBanner() {
  const t = useTranslations('offline')
  const online = useBrowserOnline()

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        online
          ? 'sr-only'
          : 'flex items-start gap-2.5 rounded-xl border border-gold/40 bg-felt-deep/95 px-3 py-2 text-xs text-cream shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] motion-safe:animate-in motion-safe:fade-in sm:text-sm'
      )}
    >
      {!online && (
        <>
          <WifiOff aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="min-w-0 leading-snug">{t('hubBanner')}</p>
        </>
      )}
    </div>
  )
}
