"use client"

import { useEffect, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Maximize2, Minimize2 } from 'lucide-react'
import { BrandMark } from '@/components/brand/BrandLogo'
import { useFullscreen } from '@/hooks/useFullscreen'
import { isCapacitorApp } from '@/lib/native-app'
import { JoinQR } from './JoinQR'
import { useHtmlClass } from './TvModeRoot'
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
  useHtmlClass('tv-canvas')
  // Coquille mobile, connue après montage (comme FullscreenButton) : la
  // WebView y annule aussitôt tout plein écran d'élément — le bouton restait
  // visible mais ne faisait rien, alors que l'app occupe déjà l'écran.
  const [inApp, setInApp] = useState(false)
  useEffect(() => {
    setInApp(isCapacitorApp())
  }, [])

  return (
    <div className="tv-stage app-felt fixed inset-0 flex flex-col overflow-hidden text-white">
      {/* En-tête compact (≈ 6 rem sur une toile de 45) : chaque rem pris ici
          manque au jeu, et le QR ne sert plus qu'aux retardataires. */}
      <header className="flex shrink-0 items-center justify-between gap-6 border-b border-gold/20 px-8 py-2">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-felt-deep p-1.5">
            <BrandMark className="h-full w-full" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-base font-semibold uppercase tracking-[0.3em] text-gold/90">{t('brand')}</p>
            <h1 className="truncate font-display text-4xl font-bold leading-tight">{title}</h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {joinUrl && (
            <div className="flex items-center gap-4 rounded-2xl border border-[#D8CCAE] bg-cream py-1 pl-5 pr-1 text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
              <div className="text-right">
                {/* Encre assombrie : #6B6455 tombait juste sous le seuil AA sur la plaque crème. */}
                <p className="text-base font-semibold uppercase tracking-[0.2em] text-[#55503F]">{t('scanToJoin')}</p>
                <p className="font-mono text-4xl font-black leading-tight tracking-[0.3em] text-[#24201A]">{code}</p>
              </div>
              <JoinQR url={joinUrl} size={64} className="rounded-xl p-1.5 shadow-none" />
            </div>
          )}
          {/* Plein écran : impossible à déclencher au chargement (les
              navigateurs l'exigent sur un geste), d'où ce bouton. Absent là où
              l'API n'existe pas (iPhone Safari) ou reste sans effet (app
              mobile) plutôt qu'inerte. */}
          {isSupported && !inApp && (
            <button
              type="button"
              onClick={() => void toggleFullscreen()}
              aria-label={isFullscreen ? t('exitFullscreen') : t('fullscreen')}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-felt-deep text-gold transition-colors hover:bg-gold/[0.15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {isFullscreen ? (
                <Minimize2 aria-hidden className="h-7 w-7" />
              ) : (
                <Maximize2 aria-hidden className="h-7 w-7" />
              )}
            </button>
          )}
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
