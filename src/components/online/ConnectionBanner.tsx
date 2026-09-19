"use client"

import { useTranslations } from 'next-intl'
import { WifiOff } from 'lucide-react'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { cn } from '@/lib/utils'

/**
 * Bandeau « coupure réseau » — monté par le layout des jeux, pour TOUS les
 * jeux en ligne, lobby et écran de fin compris (même condition que le dock
 * vocal).
 *
 * Quand le Wi-Fi tombe, le flux SSE se ferme et le sondage repasse à 1,5 s
 * en silence : le joueur regardait un plateau figé sans un mot — l'erreur
 * « réseau » n'apparaissait qu'à sa prochaine action, 3 s durant. Ici on le
 * lui DIT, et on lui dit que ça revient tout seul : une tablée un samedi
 * soir doit savoir que ce n'est pas le jeu qui plante. Le verdict vient de
 * useOnlineRoom (`connection`, règle dans hooks/connection-status.ts) ; ce
 * composant ne fait qu'afficher.
 *
 * Placement : PREMIER enfant de la coquille de jeu, DANS le flux — il prend
 * sa place, jamais celle d'un bouton — et `sticky` sous la barre du haut
 * (3,5 rem ; 3,75 rem dès `sm`, cf. Navbar) pour rester sous les yeux quand
 * la page défile. Sous les surcouches de jeu (z-40) et les modales (z-50) :
 * un portail ou une fin de partie passent devant. Rien n'est rendu tant que
 * tout va bien : pas de boîte vide qui décalerait le plateau (la coquille
 * espace ses enfants par `space-y`).
 *
 * Le lecteur d'écran est servi à part, par ConnectionLiveRegion : une région
 * `aria-live` qui n'est MONTÉE que quand elle a quelque chose à dire n'est
 * pas annoncée par tous les lecteurs (VoiceOver iOS notamment) — elle doit
 * exister vide avant de parler. Le bandeau visuel, lui, est `aria-hidden`.
 * Entrée en fondu et icône qui pulse pendant la reconnexion sous
 * `motion-safe:` seulement — un joueur qui a demandé moins d'animations n'a
 * droit qu'au texte.
 */
export function ConnectionBanner() {
  const t = useTranslations('onlineLobby.connection')
  const { room, connection } = useOnlineRoom()

  if (!room || connection === 'online') return null
  const offline = connection === 'offline'

  return (
    <div
      aria-hidden="true"
      className="sticky top-14 z-30 flex items-center gap-2.5 rounded-md border border-gold/40 bg-felt-deep/95 px-3 py-2 text-xs text-cream shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 sm:top-[3.75rem] sm:text-sm"
    >
      <WifiOff
        aria-hidden="true"
        className={cn('h-4 w-4 shrink-0 text-gold', !offline && 'motion-safe:animate-pulse')}
      />
      <span className="min-w-0">{offline ? t('offline') : t('reconnecting')}</span>
    </div>
  )
}

/**
 * Voix du bandeau pour le lecteur d'écran : toujours montée, vide tant que
 * tout va bien, `polite` pour ne pas couper ce qu'il lit. À placer en DERNIER
 * enfant de la coquille de jeu : `sr-only` la sort du flux, et en dernière
 * position elle ne change pas quel frère visible est « le premier » pour
 * l'espacement `space-y`.
 */
export function ConnectionLiveRegion() {
  const t = useTranslations('onlineLobby.connection')
  const { room, connection } = useOnlineRoom()

  const text =
    !room || connection === 'online' ? '' : connection === 'offline' ? t('offline') : t('reconnecting')

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {text}
    </div>
  )
}
