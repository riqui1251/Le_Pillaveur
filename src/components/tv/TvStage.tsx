"use client"

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize2, Minimize2 } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandLogo'
import { useFullscreen } from '@/hooks/useFullscreen'
import { JoinQR } from './JoinQR'
import { useKeepScreenAwake } from './use-keep-screen-awake'

/**
 * Ossature plein écran de l'affichage TV : la table vue du dessus — feutre
 * radial, en-tête marqué or, code + QR posés sur une plaque crème fixe
 * (comme une carte sur la table). Pensé paysage, gros textes, lisible à 3 m.
 *
 * C'est aussi ici que se règlent les deux misères d'un écran de salon :
 * l'ordinateur branché en HDMI qui s'endort au bout de dix minutes de lobby
 * (verrou d'écran), et la barre d'onglets qui mange le haut de la télé
 * (plein écran, forcément à la demande — les navigateurs n'accordent
 * `requestFullscreen` que sur un geste de l'utilisateur).
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
  const { isFullscreen, isSupported, toggleFullscreen } = useFullscreen()
  useKeepScreenAwake()

  return (
    <div className="app-felt fixed inset-0 flex flex-col overflow-hidden text-white">
      <header className="flex items-center justify-between gap-6 border-b border-gold/15 px-6 py-4 sm:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-felt-deep p-1.5">
            <BrandMark className="h-full w-full" />
          </div>
          <div className="min-w-0">
            {/* Contraste : /70 sur le feutre était trop pâle pour une capitale
                de 12px vue à trois mètres — remonté à /90. */}
            <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/90">{t('brand')}</p>
            <h1 className="truncate font-display text-2xl font-bold sm:text-3xl">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {joinUrl && (
            <div className="flex items-center gap-4 rounded-2xl border border-[#D8CCAE] bg-cream px-4 py-2.5 text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
              <div className="text-right">
                {/* 11px → 12px et encre assombrie (#6B6455 tombait juste sous
                    le seuil AA sur la plaque crème). */}
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#55503F]">{t('scanToJoin')}</p>
                <p className="font-mono text-3xl font-black tracking-[0.35em] text-[#24201A] sm:text-4xl">{code}</p>
              </div>
              <JoinQR url={joinUrl} size={92} />
            </div>
          )}
          {/* Plein écran : impossible à déclencher au chargement (les
              navigateurs l'exigent sur un geste), d'où ce bouton. Absent là où
              l'API n'existe pas (iPhone Safari) plutôt qu'inerte. */}
          {isSupported && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-felt-deep text-gold transition-colors hover:bg-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {isFullscreen ? (
                <Minimize2 aria-hidden className="h-5 w-5" />
              ) : (
                <Maximize2 aria-hidden className="h-5 w-5" />
              )}
            </button>
          )}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
