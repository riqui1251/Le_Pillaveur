import type {
  EnginePending,
  EnginePlayer,
  EngineState,
  LastOutcome,
  OutcomeNote,
} from '@/lib/petit-buveur/engine'
import { CASES_INTERACTIVE_TARGET, CASES_NO_SELF_TARGET } from '@/lib/petit-buveur/types'

/**
 * Logique pure de l'écran Petit Buveur EN LIGNE : qui décide, quelle fenêtre
 * de choix ouvrir, où poser les pions pendant l'animation dé → effet.
 * Le client n'importe du moteur que ses types (pas de RNG dans le bundle).
 */

/** Vue client de l'état moteur (rngState absent de la réponse serveur). */
export type EngineView = Omit<EngineState, 'rngState'>

/** Joueur qui doit agir : la cible pendant l'étape pile ou face, sinon le joueur au tour (miroir de currentDeciderId). */
export function deciderIdOf(view: Pick<EngineView, 'phase' | 'pending' | 'players' | 'currentPlayer'>): string | null {
  if (view.phase === 'finished') return null
  if (view.pending?.stage === 'side' && view.pending.targetId) return view.pending.targetId
  return view.players[view.currentPlayer]?.id ?? null
}

export type ChoiceKind = 'target' | 'verdict' | 'side' | 'chance' | 'teleport' | 'confirm'

/**
 * Fenêtre à ouvrir pour la décision en attente. Lit `pending.needsTarget`,
 * jamais `needsTarget(type)` : une méta-case dépend de la case rejouée.
 */
export function choiceOf(pending: EnginePending): { kind: ChoiceKind; allowSelf: boolean } {
  if (pending.stage === 'verdict') return { kind: 'verdict', allowSelf: false }
  if (pending.stage === 'side') return { kind: 'side', allowSelf: false }
  if (pending.needsTarget) return { kind: 'target', allowSelf: true }
  if (CASES_INTERACTIVE_TARGET.has(pending.caseType)) {
    return { kind: 'target', allowSelf: !CASES_NO_SELF_TARGET.has(pending.caseType) }
  }
  if (pending.caseType === 'chance') return { kind: 'chance', allowSelf: false }
  if (pending.caseType === 'teleport') return { kind: 'teleport', allowSelf: false }
  return { kind: 'confirm', allowSelf: false }
}

/** Tirage « au hasard » : les autres joueurs présents (soi seulement si la case l'autorise), comme le moteur. */
export function randomTargetPool(
  players: readonly Pick<EnginePlayer, 'id' | 'leftAt'>[],
  actorId: string | undefined,
  allowSelf: boolean
): string[] {
  const others = players.filter((p) => p.id !== actorId)
  const present = others.filter((p) => !p.leftAt)
  const pool = (present.length > 0 ? present : others).map((p) => p.id)
  if (allowSelf && actorId && players.some((p) => p.id === actorId)) pool.push(actorId)
  return pool
}

/**
 * Identité du dernier effet résolu. L'entrée d'historique porte le tour :
 * deux effets identiques à des tours différents restent distincts, et un
 * passage de tour sans effet (joueur parti) ne la change pas.
 */
export function outcomeSignature(view: Pick<EngineView, 'lastOutcome' | 'outcomeHistory'> | null): string {
  if (!view?.lastOutcome) return ''
  const history = view.outcomeHistory ?? []
  const last = history[history.length - 1]
  return JSON.stringify(last ?? view.lastOutcome)
}

/**
 * Positions intermédiaires quand le dé et l'effet arrivent dans la même
 * action : l'acteur s'arrête sur la case du dé, les autres joueurs touchés
 * attendent sur leur case d'avant l'effet. `null` si le pion est déjà posé
 * sur sa case d'arrivée (état en attente diffusé avant).
 */
export function diceStageTargets(
  players: readonly Pick<EnginePlayer, 'id' | 'position'>[],
  outcome: LastOutcome | null | undefined
): Record<string, number> | null {
  if (!outcome || typeof outcome.diceLanding !== 'number') return null
  const rec: Record<string, number> = {}
  for (const p of players) {
    const change = outcome.changes.find((c) => c.playerId === p.id)
    rec[p.id] = p.id === outcome.actorId ? outcome.diceLanding : change ? change.from : p.position
  }
  return rec
}

/** Compteurs de gorgées affichés : sans les gorgées de `pendingOutcome`, dont l'effet n'est pas encore joué à l'écran. */
export function shownDrinks(
  players: readonly Pick<EnginePlayer, 'id' | 'drinks'>[],
  pendingOutcome: LastOutcome | null | undefined
): Record<string, number> {
  const rec: Record<string, number> = {}
  for (const p of players) {
    const change = pendingOutcome?.changes.find((c) => c.playerId === p.id)
    rec[p.id] = p.drinks - (change?.drinks ?? 0)
  }
  return rec
}

/**
 * Case (index 0..29) où l'ACTEUR de la dernière case est tombé : le tour est
 * déjà passé au joueur suivant, et l'effet a pu déplacer l'acteur ensuite.
 */
export function landingIndex(
  players: readonly Pick<EnginePlayer, 'id' | 'position'>[],
  outcome: LastOutcome | null | undefined
): number | null {
  if (!outcome) return null
  if (typeof outcome.diceLanding === 'number') return outcome.diceLanding
  const change = outcome.changes.find((c) => c.playerId === outcome.actorId)
  if (change) return change.from
  return players.find((p) => p.id === outcome.actorId)?.position ?? null
}

/** Nouvelle partie dans la même salle (« Rejouer ») : les pions se posent sans marcher. */
export function isNewGame(
  prev: { version: number; finished: boolean },
  next: { version: number; finished: boolean }
): boolean {
  return next.version < prev.version || (prev.finished && !next.finished)
}

/** Classement sur les positions AFFICHÉES : il ne devance pas le pion qui marche. */
export function rankByShown<P extends { id: string }>(players: readonly P[], shownPos: (id: string) => number): P[] {
  return [...players].sort((a, b) => shownPos(b.id) - shownPos(a.id))
}

export type NoteMessage = { key: string; values: Record<string, string | number> }

/** Message (clé sous games.petit-buveur) d'une note du moteur, à la place de « Aucun dégât ». */
export function noteMessage(note: OutcomeNote, nameOf: (id: string) => string, actorId: string): NoteMessage {
  switch (note.kind) {
    case 'protected':
      return { key: 'game.effects.protectedStatus', values: { player: nameOf(note.playerId) } }
    case 'cannot-move-back':
      return { key: 'game.outcomes.cannotRecul', values: { player: nameOf(note.playerId) } }
    case 'spared':
      return { key: 'game.outcomes.rouletteSafe', values: { player: nameOf(note.playerId) } }
    case 'bridge':
      return {
        key: note.delta > 0 ? 'online.notes.bridgeForward' : 'online.notes.bridgeBack',
        values: { case: note.position + 1 },
      }
    case 'nothing-to-replay':
      return { key: 'online.notes.nothingToReplay', values: { player: nameOf(actorId) } }
    case 'safe':
      return { key: 'game.outcomes.safeCaseBoard', values: { player: nameOf(actorId) } }
    case 'no-effect':
      return { key: 'online.notes.noEffect', values: {} }
  }
}

type DefiItem = { text: string }

/**
 * Texte du défi `index` de la liste d'origine (index du moteur). En Soft, un
 * défi alcoolisé est remplacé par son équivalent de `soft.defis`, dans le
 * même ordre que `alcoholIndexes` — sans renuméroter les autres.
 */
export function defiTextAt(
  base: readonly DefiItem[],
  softReplacements: readonly DefiItem[] | null,
  alcoholIndexes: readonly number[],
  index: number,
  soft: boolean
): string | undefined {
  if (soft) {
    const slot = alcoholIndexes.indexOf(index)
    const replacement = slot >= 0 ? softReplacements?.[slot]?.text : undefined
    if (replacement) return replacement
  }
  return base[index]?.text
}
