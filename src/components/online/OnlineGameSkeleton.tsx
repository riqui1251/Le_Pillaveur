"use client"

import { useTranslations } from 'next-intl'
import { GameIconById } from '@/components/hub/GameIconById'
import { useLocalizedGame } from '@/lib/games-i18n'

/**
 * Squelette des pages de jeu EN LIGNE — ce que le joueur voit tant que
 * /api/auth/me n'a pas répondu (AuthProvider démarre `loading`, rendu
 * serveur compris). Avant : une div noire sans un mot, une seconde ou plus
 * sur réseau moyen, puis un saut — et c'était AUSSI le HTML que recevait
 * Googlebot en en/es/it : vide.
 *
 * L'en-tête est RÉEL, pas un rectangle gris : icône, <h1> et accroche du
 * catalogue. Indexable, et déjà à sa place quand l'écran final (lobby,
 * vitrine « essayer avec des bots ») prend le relais. Seule la zone du
 * dessous pulse — sobre, `motion-safe` pour qui a coupé les animations.
 *
 * Le layout parent (games/layout.tsx) fournit la coquille feutre + filet
 * or : ni fond ni min-h-screen ici, ça déborderait sous l'en-tête du site.
 */
export function OnlineGameSkeleton({ gameId }: { gameId: string }) {
  const tCommon = useTranslations('common')
  // Titre et accroche du catalogue, adoucis en mode Soft : le joueur
  // retrouve exactement ce qu'il vient de lire sur la carte du hub.
  const game = useLocalizedGame(gameId)

  return (
    <div className="flex w-full flex-1 flex-col items-center px-3 py-8 sm:py-12">
      <div className="w-full max-w-lg text-center">
        {game && (
          <header>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
              <GameIconById id={gameId} className="h-8 w-8" />
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-cream">{game.title}</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-snug text-cream/70">{game.description}</p>
          </header>
        )}

        {/* La place du bouton principal et de la liste des tables, en
            pulsation : le doigt sait déjà où viser, rien ne saute à l'arrivée. */}
        <div role="status" aria-busy="true" className="mt-8 space-y-3 motion-safe:animate-pulse">
          <div className="h-12 w-full rounded-2xl bg-cream/10" />
          <div className="mx-auto h-12 w-3/4 rounded-2xl bg-cream/[0.06]" />
          <p className="pt-2 text-xs font-medium tracking-wide text-cream/60">{tCommon('loading')}</p>
        </div>
      </div>
    </div>
  )
}
