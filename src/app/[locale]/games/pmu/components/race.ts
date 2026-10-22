/**
 * Règles pures de l'après-course (mode paris) et du classement, sorties du
 * composant pour être testées.
 */

type WithId = { id: string }

/** Qui peut recevoir les gorgées d'un gagnant : tous ceux qui ne montaient pas le cheval gagnant (non assignés compris). */
export function payoutTargets<P extends WithId>(allPlayers: readonly P[], winners: readonly WithId[]): P[] {
  return allPlayers.filter((p) => !winners.some((w) => w.id === p.id))
}

/**
 * L'écran de distribution n'a de sens que s'il y a quelqu'un pour donner ET
 * quelqu'un pour recevoir. Quand toute la table montait le cheval gagnant,
 * il n'offrait aucune cible et son bouton restait grisé pour toujours.
 */
export function needsPayout(allPlayers: readonly WithId[], winners: readonly WithId[]): boolean {
  return winners.length > 0 && payoutTargets(allPlayers, winners).length > 0
}

/** Premier gagnant qui n'a pas encore choisi sa cible, null quand tout est choisi. */
export function firstMissingPick<P extends WithId>(winners: readonly P[], picks: Readonly<Record<string, string>>): P | null {
  return winners.find((w) => !picks[w.id]) ?? null
}

/**
 * Classement des chevaux. Plusieurs chevaux peuvent passer la ligne au même
 * pas de course : le vainqueur désigné passe d'abord, quelle que soit sa
 * position. À égalité, l'ordre des couloirs.
 */
export function rankHorses<H extends { key: string; position: number }>(horses: readonly H[], winnerKey: string | null): H[] {
  return horses
    .map((horse, lane) => ({ horse, lane }))
    .sort((a, b) => {
      if (a.horse.key === winnerKey) return -1
      if (b.horse.key === winnerKey) return 1
      return b.horse.position - a.horse.position || a.lane - b.lane
    })
    .map(({ horse }) => horse)
}
