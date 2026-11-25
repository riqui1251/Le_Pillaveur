/**
 * Relevé de gorgées d'une partie en ligne finie, pour « Quel jeu fait le plus
 * boire ? » (src/lib/game-drinks-server.ts) : ce que rend
 * `GameAdapter.drinkTally`. Module à part pour que les adaptateurs rangés
 * dans le dossier de leur jeu (Chiffre Piégé, À Vue de Nez, Patate Chaude)
 * le partagent sans importer le registre, qui les importe déjà.
 */
export type DrinkTally = {
  /** Gorgées BUES pendant la partie par les sièges humains. */
  drinks: number
  /** Sièges humains de la partie : une participation chacun. */
  plays: number
}

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
export function humanDrinkTally<P extends { isBot?: boolean }>(
  players: readonly P[],
  drunk: (player: P) => number | undefined
): DrinkTally | null {
  const humans = players.filter((p) => !p.isBot)
  if (humans.length === 0) return null
  let drinks = 0
  for (const player of humans) {
    const n = drunk(player)
    if (typeof n === 'number' && Number.isInteger(n) && n > 0) drinks += n
  }
  return { drinks, plays: humans.length }
}
