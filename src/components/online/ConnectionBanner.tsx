"use client"

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { WifiOff } from 'lucide-react'
import { usePathname } from '@/i18n/navigation'
import { useOnlineRoom } from '@/hooks/useOnlineRoom'
import { isRoomGamePath } from '@/components/online/room-page'
import { cn } from '@/lib/utils'

/**
 * Bandeaux « cadre » montés (placement `stage`), dans l'ordre de montage.
 * Un seul parle : le premier (le cadre de jeu, monté avant ce qu'il
 * contient). Tant qu'il y en a un, celui de la coquille se tait : jamais deux
 * bandeaux pour une même coupure.
 */
let nextStageId = 1
let stageIds: number[] = []
const stageListeners = new Set<() => void>()
const notifyStage = () => stageListeners.forEach((listener) => listener())
const subscribeStage = (listener: () => void) => {
  stageListeners.add(listener)
  return () => {
    stageListeners.delete(listener)
  }
}
const firstStage = () => stageIds[0] ?? 0
const noStageOnServer = () => 0

/** Inscrit ce bandeau `stage` ; rend l'identifiant de celui qui parle (0 : aucun). */
function useStageBanners(active: boolean): { id: number; speaking: number } {
  const [id] = useState(() => nextStageId++)
  useEffect(() => {
    if (!active) return
    stageIds = [...stageIds, id]
    notifyStage()
    return () => {
      stageIds = stageIds.filter((other) => other !== id)
      notifyStage()
    }
  }, [active, id])
  const speaking = useSyncExternalStore(subscribeStage, firstStage, noStageOnServer)
  return { id, speaking }
}

/**
 * Bandeau « coupure réseau » des jeux en ligne, lobby et écran de fin compris.
 *
 * Quand le Wi-Fi tombe, le flux SSE se ferme et le sondage repasse à 1,5 s
 * en silence : le joueur regardait un plateau figé sans un mot — l'erreur
 * « réseau » n'apparaissait qu'à sa prochaine action, 3 s durant. Ici on le
 * lui DIT, et on lui dit que ça revient tout seul : une tablée un samedi
 * soir doit savoir que ce n'est pas le jeu qui plante. Le verdict vient de
 * useOnlineRoom (`connection`, règle dans hooks/connection-status.ts) ; ce
 * composant ne fait qu'afficher.
 *
 * Deux placements :
 * - `stage` (à privilégier) : en tête du conteneur qui DÉFILE du jeu en
 *   ligne (le calque `fixed … top-14` des pages, son cadre commun, ou
 *   LobbyShell). `sticky top-0` DANS le flux : le jeu glisse de la hauteur
 *   du bandeau au lieu d'être recouvert. Plusieurs montés (cadre + lobby) :
 *   seul le premier s'affiche.
 * - `shell` (par défaut, monté par games/layout.tsx) : filet de secours tant
 *   qu'aucun bandeau `stage` n'est monté. Les jeux en ligne vivent dans un
 *   calque fixe hors du flux de la coquille : ce bandeau-là flotte donc
 *   au-dessus de leurs 34 premiers pixels — d'où `pointer-events-none` (le
 *   toucher passe au bouton dessous). Il ne parle que sur la page du jeu de
 *   la salle : sur un jeu local, la coupure d'une table d'à côté n'est pas
 *   son affaire.
 *
 * Rien n'est rendu tant que tout va bien : pas de boîte vide qui décalerait
 * le plateau. Le lecteur d'écran est servi à part, par ConnectionLiveRegion :
 * une région `aria-live` qui n'est MONTÉE que quand elle a quelque chose à
 * dire n'est pas annoncée par tous les lecteurs (VoiceOver iOS notamment) —
 * elle doit exister vide avant de parler. Le bandeau visuel, lui, est
 * `aria-hidden`. Entrée en fondu et icône qui pulse pendant la reconnexion
 * sous `motion-safe:` seulement.
 */
export function ConnectionBanner({
  placement = 'shell',
  className,
}: {
  placement?: 'shell' | 'stage'
  /** Ajustements de placement (marges négatives pour couvrir la largeur du conteneur…). */
  className?: string
}) {
  const t = useTranslations('onlineLobby.connection')
  const { room, connection } = useOnlineRoom()
  const pathname = usePathname()
  const isStage = placement === 'stage'
  const { id, speaking } = useStageBanners(isStage)

  if (!room || connection === 'online') return null
  if (isStage ? speaking !== id : speaking !== 0 || !isRoomGamePath(pathname, room.gameId)) return null
  const offline = connection === 'offline'

  return (
    <div
      aria-hidden="true"
      className={cn(
        'pointer-events-none z-30 flex items-center gap-2.5 border-gold/40 bg-felt-deep/95 px-3 py-2 text-xs text-cream shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 sm:text-sm',
        isStage
          ? 'sticky top-0 shrink-0 justify-center border-b'
          : 'sticky top-14 rounded-md border sm:top-[3.75rem]',
        className
      )}
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
 * l'espacement `space-y`. Même portée que le bandeau visible : la page du
 * jeu de la salle, ou toute page qui porte un bandeau `stage`.
 */
export function ConnectionLiveRegion() {
  const t = useTranslations('onlineLobby.connection')
  const { room, connection } = useOnlineRoom()
  const pathname = usePathname()
  const stageMounted = useSyncExternalStore(subscribeStage, firstStage, noStageOnServer) !== 0

  const silent =
    !room || connection === 'online' || (!stageMounted && !isRoomGamePath(pathname, room.gameId))
  const text = silent ? '' : connection === 'offline' ? t('offline') : t('reconnecting')

  return (
    <div role="status" aria-live="polite" className="sr-only">
      {text}
    </div>
  )
}
