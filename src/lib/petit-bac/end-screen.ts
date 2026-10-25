/**
 * ÉCRAN DE FIN du Petit Bac en ligne — logique pure, même règle que le
 * classement du serveur (match-results.ts) : un joueur parti (`leftAt`) est
 * hors podium et ne gagne jamais ; victoire = meilleur score des joueurs
 * restés, ex æquo inclus, avec au moins un point. Classé, le déserteur restait
 * en tête et l'écran disait « perdu » à celui qui avait fini la partie.
 */
export function pbcEndStanding<P extends { id: string; total: number; leftAt?: number | null }>(
  players: readonly P[],
  userId: string
): { podium: P[]; best: number; won: boolean } {
  const podium = players.filter((p) => !p.leftAt).sort((a, b) => b.total - a.total)
  const best = podium[0]?.total ?? 0
  const won = best > 0 && podium.some((p) => p.id === userId && p.total === best)
  return { podium, best, won }
}
