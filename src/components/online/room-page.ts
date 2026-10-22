import { GAMES, type GameMeta } from '@/lib/games'

/**
 * La page affichée est-elle celle du jeu de la salle ? Logique pure de la
 * coquille en ligne (dock vocal, bandeau de connexion), testée sans React.
 *
 * Le layout des jeux enveloppe TOUTES les pages /games/… : une table en ligne
 * ouverte suivait donc le joueur jusque dans ses jeux LOCAUX — question du
 * micro d'une autre partie posée sur la liste de ses joueurs, bulle vocale
 * à cheval sur le bas de l'écran. Ce qui appartient à la salle ne s'affiche
 * plus que sur la page de son jeu.
 *
 * `pathname` : chemin SANS préfixe de langue (usePathname de @/i18n/navigation).
 * Salle sans jeu (`gameId` nul) : aucune page n'est la sienne.
 */
export function isRoomGamePath(
  pathname: string | null | undefined,
  gameId: string | null | undefined,
  games: readonly Pick<GameMeta, 'id' | 'path'>[] = GAMES
): boolean {
  if (!pathname || !gameId) return false
  const game = games.find((g) => g.id === gameId)
  if (!game) return false
  const path = pathname.replace(/\/+$/, '')
  return path === game.path || path.startsWith(`${game.path}/`)
}
