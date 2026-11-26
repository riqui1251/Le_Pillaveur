/**
 * Relevé de gorgées d'une partie en ligne finie, pour « Quel jeu fait le plus
 * boire ? » (src/lib/game-drinks-server.ts) et le classement des comptes par
 * jeu (src/lib/online/drink-results.ts) : ce que rend `GameAdapter.drinkTally`.
 * Module à part pour que les adaptateurs rangés dans le dossier de leur jeu
 * (Chiffre Piégé, À Vue de Nez, Patate Chaude) le partagent sans importer le
 * registre, qui les importe déjà.
 */

/** Un siège humain de la partie et ce qu'il a bu. */
export type DrinkTallySeat = {
  /** Id du joueur dans le moteur : le compte, préfixé `online-` dans certains jeux. */
  playerId: string
  /** Gorgées BUES par ce siège (entier ≥ 0). */
  drinks: number
}

export type DrinkTally = {
  /** Gorgées BUES pendant la partie par les sièges humains. */
  drinks: number
  /** Sièges humains de la partie : une participation chacun. */
  plays: number
  /** Les mêmes sièges un à un : `plays` entrées, dont `drinks` est la somme. */
  seats: DrinkTallySeat[]
}

const drunkCount = (n: number | undefined): number =>
  typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0

/**
 * Seuls les sièges HUMAINS comptent, aux deux bouts de la moyenne : un bot ne
 * boit pas — compter ses gorgées gonflerait le total, compter son siège
 * diluerait la moyenne. Un humain remplacé par un bot en cours de partie
 * (`isBot` à la fin) sort des deux ; un humain parti sans être remplacé reste,
 * avec ce qu'il a bu.
 *
 * Gorgées BUES seulement, comme les statistiques des jeux locaux : celles
 * qu'un joueur « donne » (Black Jack, À Vue de Nez, 1220) se distribuent à
 * voix haute, sans destinataire enregistré — ni le téléphone ni le serveur ne
 * les comptent, et les deux sources s'additionnent dans le même classement.
 *
 * Null : aucun siège humain, rien à compter.
 */
export function humanDrinkTally<P extends { id: string; isBot?: boolean }>(
  players: readonly P[],
  drunk: (player: P) => number | undefined
): DrinkTally | null {
  const seats = players
    .filter((p) => !p.isBot)
    .map((p) => ({ playerId: p.id, drinks: drunkCount(drunk(p)) }))
  if (seats.length === 0) return null
  return {
    drinks: seats.reduce((sum, seat) => sum + seat.drinks, 0),
    plays: seats.length,
    seats,
  }
}
