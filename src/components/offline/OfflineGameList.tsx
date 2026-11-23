'use client'

import { Link } from '@/i18n/navigation'
import { GameIconById } from '@/components/hub/GameIconById'
import { useGameCatalog } from '@/hooks/useGameCatalog'
import { isGameListed } from '@/lib/game-catalog'

export type OfflineGameItem = { id: string; path: string; title: string }

/**
 * Jeux jouables sans réseau, sans ceux que l'équipe a cachés. La page serveur
 * rend la liste complète (rien n'est lu tant que le JS n'est pas là) ; la copie
 * du catalogue gardée sur l'appareil, lisible hors ligne, écarte ensuite les
 * jeux cachés. Les titres arrivent déjà traduits : le composant ne lit aucun message.
 */
export function OfflineGameList({ games }: { games: OfflineGameItem[] }) {
  const { hiddenIds } = useGameCatalog()

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {games
        .filter((game) => isGameListed({ id: game.id, hidden: false }, hiddenIds))
        .map((game) => (
          <li key={game.id}>
            <Link
              href={game.path}
              prefetch={false}
              className="flex min-h-[3rem] items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/60 px-3 py-2 text-sm font-semibold text-cream transition-colors hover:border-gold/50"
            >
              <GameIconById id={game.id} surface="felt" className="h-6 w-6 shrink-0" />
              <span className="min-w-0 truncate">{game.title}</span>
            </Link>
          </li>
        ))}
    </ul>
  )
}
