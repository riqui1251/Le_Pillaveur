/**
 * Règles pures du tirage des cavaliers, de l'après-course (mode paris) et du
 * classement, sorties du composant pour être testées.
 */

import { shuffleWithRng } from '@/lib/online-rng'

type WithId = { id: string }

/**
 * Tirage au sort des cavaliers. Les joueurs sont battus puis distribués comme
 * des cartes, sur des chevaux pris dans un ordre lui aussi tiré : aucun cheval
 * n'a plus d'un cavalier d'avance sur un autre, et les joueurs en trop ne
 * tombent pas toujours sur les premiers. Chaque cheval garde l'ordre de la
 * table. Un nouveau tirage déplace toujours quelqu'un : à un ou deux joueurs,
 * le même revenait souvent et le bouton semblait ne rien faire.
 */
export function drawRiders<P extends WithId>(
  players: readonly P[],
  current: readonly (readonly WithId[])[],
  random: () => number = Math.random,
): P[][] {
  const horseOf = (lanes: readonly (readonly WithId[])[]) =>
    new Map(lanes.flatMap((lane, horse) => lane.map((p) => [p.id, horse] as const)))
  const before = horseOf(current)
  const deal = () => {
    const order = shuffleWithRng(current.map((_, horse) => horse), random)
    const seat = new Map(shuffleWithRng([...players], random).map((p, i) => [p.id, order[i % order.length]]))
    return current.map((_, horse) => players.filter((p) => seat.get(p.id) === horse))
  }
  const unchanged = (lanes: readonly (readonly WithId[])[]) => {
    const after = horseOf(lanes)
    return players.every((p) => before.get(p.id) === after.get(p.id))
  }
  let lanes = deal()
  for (let tries = 0; tries < 20 && unchanged(lanes); tries++) lanes = deal()
  return lanes
}

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
