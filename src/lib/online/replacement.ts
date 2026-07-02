/**
 * Remplacement par bot — règles COMMUNES à tous les jeux en ligne :
 *
 * 1. DÉPART VOLONTAIRE : quitter une partie en cours marque le joueur
 *    « parti » (`leftAt` sur son joueur moteur). Il peut revenir pendant le
 *    délai de grâce (bannière Rejoindre) ; passé ce délai, un bot le remplace.
 * 2. INACTIVITÉ (AFK) : si le joueur au tour ne joue pas pendant le délai,
 *    n'importe quel autre membre déclenche `replace-afk` — le serveur valide
 *    l'inactivité avec SA propre horloge (`OnlineRoom.updatedAt`, mis à jour à
 *    chaque écriture d'état) puis expulse le joueur et le convertit en bot.
 *
 * Contrat pour un nouveau jeu : stocker `players: [{ id, isBot?, leftAt? }]`
 * dans son état moteur, fournir des fonctions de conversion, et brancher les
 * ticks client (`bot`, `replace-left`, `replace-afk`) — voir petit-buveur et
 * toucher-coule comme références.
 */

export const ONLINE_REPLACE_GRACE_MS = 3 * 60 * 1000

/** Forme minimale d'un joueur remplaçable, commune aux moteurs. */
export type ReplaceablePlayer = {
  id: string
  isBot?: boolean
  leftAt?: number | null
}

/**
 * Cherche dans un `gameStateJson` un joueur humain marqué « parti » —
 * générique : tout moteur qui expose `players[]` avec `id/isBot/leftAt`.
 */
export function findLeftHumanPlayer(
  gameStateJson: string | null,
  userId: string
): ReplaceablePlayer | null {
  if (!gameStateJson) return null
  try {
    const state = JSON.parse(gameStateJson) as { players?: ReplaceablePlayer[] }
    if (!Array.isArray(state.players)) return null
    return state.players.find((p) => p.id === userId && !p.isBot && p.leftAt) ?? null
  } catch {
    return null
  }
}
