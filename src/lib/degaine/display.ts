/**
 * Ce que l'écran dit d'une manche, sans React : quelles clés de `games.degaine` afficher et avec
 * quelles valeurs. Le barème suit l'ambiance figée au lancement (gorgées ou points).
 */

import {
  DEGAINE_DECOY_MS,
  DEGAINE_DRINKS,
  classifyTap,
  findMatch,
  matchPosition,
  nextStageKind,
  penaltyDrinks,
  penaltyFor,
  penaltySoftPoints,
  reactionMs,
  roundKind,
  type DegaineDecoyId,
  type DegaineDuel,
  type DegainePenalty,
  type DegaineRoundKind,
  type DegaineRoundRecord,
  type DegaineState,
  type DuelSide,
} from './engine'

export type DegaineAmbiance = 'alcool' | 'soft'

/** Une clé de `games.degaine` et ses valeurs ICU. */
export type TextRef = { key: string; values?: Record<string, string | number> }

export type SideTone = 'win' | 'lose' | 'neutral'

export type SideOutcomeView = {
  tone: SideTone
  /** « Gagné · en finale », « Trop lent », « Égalité »… */
  title: TextRef
  /** « boit 2 », « −3 points », « éliminé », « on rejoue »… (vide : rien à payer) */
  costs: TextRef[]
}

export type SideTimeView =
  | { kind: 'ms'; ms: number }
  | { kind: 'early' }
  | { kind: 'decoy'; word: DegaineDecoyId }
  | { kind: 'none' }

const REPLAY: TextRef = { key: 'arena.cost.replay' }

function penaltyCost(penalty: DegainePenalty, state: DegaineState, ambiance: DegaineAmbiance): TextRef | null {
  if (ambiance === 'soft') {
    const points = penaltySoftPoints(penalty, state.settings.format)
    return points > 0 ? { key: 'arena.cost.points', values: { count: points } } : null
  }
  const drinks = penaltyDrinks(penalty)
  return drinks > 0 ? { key: 'arena.cost.drink', values: { count: drinks } } : null
}

/** Verdict d'un côté pour la manche `record` (celle à l'écran). */
export function sideOutcome(
  state: DegaineState,
  record: DegaineRoundRecord,
  side: DuelSide,
  ambiance: DegaineAmbiance
): SideOutcomeView {
  if (record.outcome === 'tie') return { tone: 'neutral', title: { key: 'arena.verdict.tie' }, costs: [REPLAY] }
  if (record.outcome === 'no-shot') return { tone: 'neutral', title: { key: 'arena.verdict.noShot' }, costs: [REPLAY] }
  if (record.outcome === 'double-false-start') {
    const cost = penaltyCost('falseStart', state, ambiance)
    return { tone: 'lose', title: { key: 'arena.verdict.falseStart' }, costs: cost ? [cost, REPLAY] : [REPLAY] }
  }

  const soft = ambiance === 'soft'
  const tournament = state.settings.format === 'tournament'
  if (record.winner === side) {
    if (!record.decided) return { tone: 'win', title: { key: 'arena.verdict.roundWon' }, costs: [] }
    const match = findMatch(state, record.matchId)
    if (!tournament || !match) return { tone: 'win', title: { key: 'arena.verdict.won' }, costs: [] }
    const next = nextStageKind(state, match)
    if (next) return { tone: 'win', title: { key: `arena.verdict.advance.${next}` }, costs: [] }
    return {
      tone: 'win',
      title: { key: 'arena.verdict.champion' },
      costs: [soft ? { key: 'arena.cost.chooseGame' } : { key: 'arena.cost.give', values: { count: DEGAINE_DRINKS.championGives } }],
    }
  }

  const kind = record.kinds[side]
  const early = kind === 'early' || kind === 'decoy'
  const costs: TextRef[] = []
  // Sans alcool, perdre un duel de tournoi ne coûte pas de point : il élimine.
  if (soft && tournament && record.decided) costs.push({ key: record.final ? 'arena.cost.runnerUp' : 'arena.cost.eliminated' })
  const cost = penaltyCost(penaltyFor(record, side), state, ambiance)
  if (cost) costs.push(cost)
  const title = early ? 'arena.verdict.falseStart' : record.decided ? 'arena.verdict.tooSlow' : 'arena.verdict.roundLost'
  return { tone: 'lose', title: { key: title }, costs }
}

/** Le leurre affiché à l'instant `at`, s'il y en avait un. */
export function decoyAt(duel: Pick<DegaineDuel, 'decoys'>, at: number): DegaineDecoyId | null {
  for (const decoy of duel.decoys) {
    if (at >= decoy.at && at < decoy.at + DEGAINE_DECOY_MS) return decoy.word
  }
  return null
}

/** Ce que montre le chiffre d'un côté : son temps, ou pourquoi il n'en a pas. */
export function sideTime(duel: DegaineDuel, side: DuelSide): SideTimeView {
  const at = duel.taps[side]
  if (at === null) return { kind: 'none' }
  const kind = classifyTap(duel, at)
  const ms = reactionMs(duel, side)
  if (kind === 'valid' && ms !== null) return { kind: 'ms', ms }
  const word = kind === 'decoy' ? decoyAt(duel, at) : null
  return word ? { kind: 'decoy', word } : { kind: 'early' }
}

/** Nom d'un tour du tableau (« Demi-finale »), au singulier ou en titre de section. */
export function stageRef(kind: DegaineRoundKind, round: number, plural = false): TextRef {
  const key = `board.${plural ? 'stages' : 'stage'}.${kind}`
  return kind === 'other' ? { key, values: { round: round + 1 } } : { key }
}

/** « Demi-finale », « Duel 1 sur 2 » ; en duel libre, « Duel libre ». */
export function matchLabel(state: DegaineState, matchId: string): TextRef[] {
  if (state.settings.format === 'free') return [{ key: 'board.freeDuel' }]
  const position = matchPosition(state.bracket, matchId)
  if (!position) return []
  const parts = [stageRef(roundKind(state.bracket.length, position.round), position.round)]
  if (position.total > 1) parts.push({ key: 'board.duelOf', values: { number: position.number, total: position.total } })
  return parts
}

/** Numéro de la manche à l'écran : manches gagnées avant elle + 1 (les manches rejouées ne comptent pas). */
export function roundNumber(state: DegaineState): number {
  const duel = state.duel
  if (!duel) return 1
  let won = 0
  for (const record of state.log) if (record.matchId === duel.matchId && record.outcome === 'win') won += 1
  const counted = duel.settled && duel.outcome === 'win'
  return won - (counted ? 1 : 0) + 1
}
