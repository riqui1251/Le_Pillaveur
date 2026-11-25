import { isGameListed, isPlayableIn } from '@/lib/game-catalog'
import type { GameMeta } from '@/lib/games'

export type HomePick = 'soiree' | 'libre'
export type LibreWhere = 'local' | 'online'
export type HomeChoice = { pick: HomePick | null; where: LibreWhere }

export const HOME_PICK_KEY = 'lp-home-pick-v1'

/** Bornes de la bande du Mode Soirée, comme /soiree?joueurs= les relit (SoireeApp). */
export const SOIREE_PLAYERS = { min: 2, max: 12, initial: 4 } as const

export function parseHomePick(raw: unknown): HomePick | null {
  return raw === 'soiree' || raw === 'libre' ? raw : null
}

/**
 * Un compte en mode en ligne retrouve « Jeu libre · En ligne » : c'est le
 * parcours qu'il suivait (l'accueil le renvoyait vers /jeux). Sinon, le
 * dernier choix fait sur cet appareil ; sinon rien, les deux cartes attendent.
 */
export function initialHomeChoice({
  playMode,
  stored,
}: {
  playMode: LibreWhere | null
  stored: HomePick | null
}): HomeChoice {
  if (playMode === 'online') return { pick: 'libre', where: 'online' }
  return { pick: stored, where: 'local' }
}

type CountedGame = Pick<GameMeta, 'id' | 'hidden' | 'onlineReady' | 'onlineOnly' | 'softModeReady'>

/**
 * Les nombres annoncés sur l'accueil, alignés sur ce que /jeux montre ensuite :
 * jeux listés (ni retirés du code, ni cachés par l'équipe), dont ceux d'un seul
 * téléphone et ceux d'une table en ligne — en ligne et sans alcool, seuls les
 * jeux qui ont leur variante sans alcool.
 */
export function homeGameCounts(
  games: readonly CountedGame[],
  hiddenIds: readonly string[],
  soft: boolean
): { all: number; local: number; online: number } {
  const listed = games.filter((game) => isGameListed(game, hiddenIds))
  return {
    all: listed.length,
    local: listed.filter((game) => isPlayableIn(game, 'local')).length,
    online: listed.filter((game) => isPlayableIn(game, 'online') && (!soft || Boolean(game.softModeReady))).length,
  }
}
