import type { DilRevealEntry } from './engine'

/**
 * Lecture PURE d'une révélation de Dilemmes, partagée par l'écran du joueur
 * (et réutilisable par la TV) : qui a été désigné combien de fois, qui sort
 * en tête, quel camp est minoritaire.
 */

export type DilWhoTallyRow = {
  id: string
  votes: number
  /** Votants, dans l'ordre d'arrivée des votes. */
  voterIds: string[]
}

export type DilWhoTally = {
  /** Classement par voix décroissantes ; à égalité, l'ordre de la table. */
  rows: DilWhoTallyRow[]
  /** Voix du ou des premiers (0 si personne n'a voté). */
  top: number
  /** Le ou les plus désignés — vide si personne n'a reçu de voix. */
  topIds: string[]
}

/**
 * Décompte d'un « Qui de la table ». Tous les joueurs présents y figurent,
 * le lecteur compris (la grille de vote l'exclut, pas le résultat), plus un
 * absent qui a reçu des voix avant de partir.
 */
export function dilWhoTally(
  players: readonly { id: string; leftAt: number | null }[],
  reveal: readonly DilRevealEntry[]
): DilWhoTally {
  const rows = players
    .map((p) => ({ p, voterIds: reveal.filter((r) => r.choice === p.id).map((r) => r.voterId) }))
    .filter(({ p, voterIds }) => !p.leftAt || voterIds.length > 0)
    .map(({ p, voterIds }): DilWhoTallyRow => ({ id: p.id, votes: voterIds.length, voterIds }))
    // Array.prototype.sort est stable : à égalité, l'ordre de la table reste.
    .sort((a, b) => b.votes - a.votes)
  const top = rows.reduce((m, r) => Math.max(m, r.votes), 0)
  return { rows, top, topIds: top > 0 ? rows.filter((r) => r.votes === top).map((r) => r.id) : [] }
}

/**
 * Camp minoritaire d'un vote A/B — celui qui boit. Aucun en cas d'égalité ou
 * d'unanimité (un camp vide n'a personne à faire boire).
 */
export function dilMinorityChoice(reveal: readonly DilRevealEntry[]): 'A' | 'B' | null {
  const a = reveal.filter((r) => r.choice === 'A').length
  const b = reveal.filter((r) => r.choice === 'B').length
  if (a === 0 || b === 0 || a === b) return null
  return a < b ? 'A' : 'B'
}
