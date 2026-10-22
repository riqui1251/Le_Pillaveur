import { getCaseTypeLabel, type Case, type PetitBuveurT } from './case-config'
import type { EffectOutcome } from './case-notification'
import type { GamePlayer } from './case-types'
import {
  outcomeAnchorApplied,
  outcomeBombe,
  outcomeCannotRecul,
  outcomeCaseBase,
  outcomeChainLinked,
  outcomeCompose,
  outcomeCopie,
  outcomeCurseApplied,
  outcomeDoubleCaseStep,
  outcomeDoublePeine,
  outcomeDrinks,
  outcomeI18n,
  outcomeInversion,
  outcomeMelange,
  outcomeMirrorLink,
  outcomeMiroirSwap,
  outcomeMove,
  outcomeProtectedTarget,
  outcomeProtectionApplied,
  outcomeRouletteMiss,
  outcomeRouletteProtected,
  outcomeRouletteSafe,
  outcomeSafeCase,
  outcomeShielded,
  outcomeSkipTurnNext,
  outcomeSpared,
  outcomeTeleportSelf,
  outcomeTrap,
  outcomeTrapProtected,
} from './outcome-helpers'
import {
  addDrinks,
  caseNeedsTarget,
  isShielded,
  shuffle,
  type DrinkEntry,
  type Rng,
} from './local-rules'
import { getLastPlayer, getLeader, resolveNoTargetCase } from './resolve-case'
import { detectWinner } from './turn-state'

export type ApplyContext = {
  actorIndex: number
  boardSize: number
  /** Déplacement total au dé de l'acteur pendant ce tour (relance Chance comprise, 0 s'il était ancré). */
  turnDiceTotal: number
  t: PetitBuveurT
  rng?: Rng
}

export type ApplyResult = {
  players: GamePlayer[]
  outcome: EffectOutcome
  drinks: DrinkEntry[]
  /** Miroir inversé posé pendant ce tour : la fin du tour ne le décompte pas. */
  mirrorLinked?: boolean
  /** Défi en chaîne posé pendant ce tour : la fin du tour ne le décompte pas. */
  chainLinked?: boolean
}

const DEFAULT_CURSE_TURNS = 3

function clamp(position: number, boardSize: number): number {
  return Math.max(0, Math.min(boardSize - 1, position))
}

/**
 * Case à cible appliquée à `targetId` (Défi / Question exclus : arbitrage dans
 * l'interface). La protection ne bloque que les effets négatifs imposés par la
 * case d'un AUTRE joueur.
 */
export function applyTargetedCase(
  caseToApply: Case,
  players: GamePlayer[],
  targetId: string,
  ctx: ApplyContext
): ApplyResult {
  const { t } = ctx
  const rng = ctx.rng ?? Math.random
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const actor = updated[ctx.actorIndex]
  const target = updated.find(p => p.id === targetId)
  if (!actor || !target) return { players: updated, outcome: outcomeCaseBase(), drinks }

  const result = (outcome: EffectOutcome, extra: Partial<ApplyResult> = {}): ApplyResult => ({
    players: updated,
    outcome,
    drinks,
    ...extra,
  })
  const drink = (id: string, count: number) => addDrinks(updated, id, count, { sourceId: actor.id }, drinks)
  const shieldedNotes = () =>
    updated.filter(p => isShielded(p, actor.id)).map(p => outcomeShielded(t, p.id))
  const blockedTarget = () => result(outcomeProtectedTarget(t, target.id))

  switch (caseToApply.type) {
    case 'normal':
      return result(outcomeSafeCase(actor.id))

    case 'gorgée':
      if (drink(target.id, caseToApply.effect)) return blockedTarget()
      return result(outcomeDrinks(target.id, caseToApply.effect))

    case 'tous': {
      const notes: EffectOutcome[] = []
      for (const p of updated) {
        if (p.id !== target.id && drink(p.id, caseToApply.effect)) notes.push(outcomeShielded(t, p.id))
      }
      return result(outcomeCompose(outcomeSpared(target.id), ...notes))
    }

    case 'avance': {
      const before = target.position
      target.position = clamp(before + (Math.abs(caseToApply.effect) || 1), ctx.boardSize)
      return result(outcomeMove(target.id, '➡️', before + 1, target.position + 1))
    }

    case 'recul': {
      if (isShielded(target, actor.id)) return blockedTarget()
      if (target.position === 0) return result(outcomeCannotRecul(target.id))
      const before = target.position
      target.position = clamp(before - (Math.abs(caseToApply.effect) || 1), ctx.boardSize)
      return result(outcomeMove(target.id, '⬅️', before + 1, target.position + 1))
    }

    case 'bombe': {
      const notes: EffectOutcome[] = []
      for (const p of updated) {
        const amount = p.id === target.id ? caseToApply.effect * 2 : caseToApply.effect
        if (drink(p.id, amount)) notes.push(outcomeShielded(t, p.id))
      }
      return result(
        outcomeCompose(outcomeBombe(actor.id, caseToApply.effect, target.name), ...notes)
      )
    }

    case 'protection':
      target.protected = true
      target.protectionTurnsLeft = Math.max(updated.length, 1)
      return result(outcomeProtectionApplied(target.id))

    case 'malediction': {
      if (isShielded(target, actor.id)) return blockedTarget()
      const turns = caseToApply.effect || DEFAULT_CURSE_TURNS
      target.cursed = turns
      return result(outcomeCurseApplied(target.id, turns))
    }

    // Les protégés gardent leur case ; les autres sont miroités entre les cases restantes.
    case 'miroir': {
      const notes = shieldedNotes()
      const movable = updated
        .filter(p => !isShielded(p, actor.id))
        .sort((a, b) => b.position - a.position)
      const positions = movable.map(p => p.position)
      movable.forEach((p, i) => {
        p.position = positions[positions.length - 1 - i]
      })
      return result(outcomeCompose(outcomeMiroirSwap(actor.id), ...notes))
    }

    case 'piege': {
      const trapDrinks = target.position + 1
      if (drink(target.id, trapDrinks)) {
        return result(outcomeTrapProtected(t, target.id, trapDrinks, target.position + 1))
      }
      return result(outcomeTrap(target.id, trapDrinks, target.position + 1))
    }

    case 'passe-tour':
      if (isShielded(target, actor.id)) return blockedTarget()
      target.skipNextTurn = true
      return result(outcomeSkipTurnNext(target.id))

    case 'double-peine': {
      const doubled = caseToApply.effect * 2
      if (drink(target.id, doubled)) return blockedTarget()
      return result(outcomeDoublePeine(target.id, doubled))
    }

    // Positif : la protection ne bloque pas la copie.
    case 'copie': {
      const before = target.position
      target.position = clamp(before + ctx.turnDiceTotal, ctx.boardSize)
      return result(outcomeCopie(target.id, ctx.turnDiceTotal, before + 1, target.position + 1))
    }

    case 'roulette-russe':
      if (isShielded(target, actor.id)) return result(outcomeRouletteProtected(t, target.id))
      if (rng() < 1 / 3) {
        drink(target.id, caseToApply.effect)
        return result(outcomeRouletteMiss(target.id, caseToApply.effect))
      }
      return result(outcomeRouletteSafe(target.id))

    case 'ancre':
      if (isShielded(target, actor.id)) return blockedTarget()
      target.anchored = true
      return result(outcomeAnchorApplied(target.id))

    // Le dernier boit, quelle que soit la cible.
    case 'inversion': {
      const last = updated.reduce((min, p) => (p.position < min.position ? p : min))
      if (drink(last.id, caseToApply.effect)) {
        return result(outcomeCompose(outcomeCaseBase(), outcomeShielded(t, last.id)))
      }
      return result(outcomeInversion(last.id, target.id, caseToApply.effect))
    }

    // Les protégés gardent leur case ; Fisher-Yates sur les cases des autres.
    case 'melange': {
      const notes = shieldedNotes()
      const movable = updated.filter(p => !isShielded(p, actor.id))
      const shuffled = shuffle(
        movable.map(p => p.position),
        rng
      )
      movable.forEach((p, i) => {
        p.position = shuffled[i]
      })
      return result(outcomeCompose(outcomeMelange(actor.id), ...notes))
    }

    case 'miroir-inverse':
      if (isShielded(target, actor.id)) return blockedTarget()
      actor.mirrorDrinkTargetId = target.id
      actor.mirrorDrinkTurns = caseToApply.effect || 1
      return result(outcomeMirrorLink(actor.id, target.id), { mirrorLinked: true })

    default: {
      const noTarget = resolveNoTargetCase(caseToApply, updated, {
        boardSize: ctx.boardSize,
        actorIndex: ctx.actorIndex,
        lastMoveDelta: ctx.turnDiceTotal,
        lastCase: null,
        rng,
      }, t)
      return { players: noTarget.players, outcome: noTarget.outcome, drinks: noTarget.drinks }
    }
  }
}

/** Double case : les deux cases simples, l'une après l'autre, sur la même cible ; arrêt à la victoire. */
export function applyDoubleCase(
  cases: readonly Case[],
  players: GamePlayer[],
  targetId: string | null,
  ctx: ApplyContext
): ApplyResult {
  let current = players
  const drinks: DrinkEntry[] = []
  const parts: EffectOutcome[] = []
  let mirrorLinked = false
  for (const [i, c] of cases.entries()) {
    const stepTarget = caseNeedsTarget(c.type) && targetId ? targetId : current[ctx.actorIndex]?.id ?? ''
    const step = applyTargetedCase(c, current, stepTarget, ctx)
    current = step.players
    drinks.push(...step.drinks)
    mirrorLinked = mirrorLinked || Boolean(step.mirrorLinked)
    parts.push(outcomeDoubleCaseStep(i + 1, getCaseTypeLabel(c.type, ctx.t)), step.outcome)
    if (detectWinner(current, ctx.actorIndex, ctx.boardSize)) break
  }
  return { players: current, outcome: outcomeCompose(...parts), drinks, mirrorLinked }
}

export type SwapResult = { players: GamePlayer[]; outcome: EffectOutcome; partnerId: string | null }

/** Échange de positions acteur ↔ partenaire, annulé si le partenaire est protégé. */
function swapPositions(
  players: GamePlayer[],
  actorIndex: number,
  partnerId: string,
  t: PetitBuveurT,
  swapped: (actorId: string) => EffectOutcome
): SwapResult {
  const updated = players.map(p => ({ ...p }))
  const actor = updated[actorIndex]
  const partner = updated.find(p => p.id === partnerId)
  if (!actor || !partner) return { players: updated, outcome: outcomeCaseBase(), partnerId: null }
  if (isShielded(partner, actor.id)) {
    return { players: updated, outcome: outcomeProtectedTarget(t, partner.id), partnerId: partner.id }
  }
  const from = actor.position
  actor.position = partner.position
  partner.position = from
  return { players: updated, outcome: swapped(actor.id), partnerId: partner.id }
}

/** Échange (jamais avec soi-même : l'interface ne le propose pas, et il est refusé ici). */
export function resolveExchange(
  players: GamePlayer[],
  actorIndex: number,
  partnerId: string,
  t: PetitBuveurT
): SwapResult {
  const actor = players[actorIndex]
  if (!actor || actor.id === partnerId) {
    return { players: players.map(p => ({ ...p })), outcome: outcomeCaseBase(), partnerId: null }
  }
  return swapPositions(players, actorIndex, partnerId, t, actorId =>
    outcomeI18n('game.outcomes.exchange', { playerRefs: { a: actorId, b: partnerId } })
  )
}

/** Téléport vers le 1er ou le dernier ; déjà à ce rang (ou à égalité) : aucun échange. */
export function resolveTeleport(
  players: GamePlayer[],
  actorIndex: number,
  which: 'leader' | 'last',
  t: PetitBuveurT
): SwapResult {
  const actor = players[actorIndex]
  const rank = which === 'leader' ? t('game.outcomes.teleportLeader') : t('game.outcomes.teleportLast')
  if (!actor) return { players: players.map(p => ({ ...p })), outcome: outcomeCaseBase(), partnerId: null }
  const partner = which === 'leader' ? getLeader(players) : getLastPlayer(players)
  if (!partner || partner.id === actor.id || partner.position === actor.position) {
    return {
      players: players.map(p => ({ ...p })),
      outcome: outcomeTeleportSelf(actor.id, rank),
      partnerId: null,
    }
  }
  return swapPositions(players, actorIndex, partner.id, t, actorId =>
    outcomeI18n('game.outcomes.teleport', {
      playerRefs: { actor: actorId, partner: partner.id },
      params: { rank },
    })
  )
}

// ─── Cases à fenêtre dédiée (le joueur a fait son choix) ────────────────────

type ModalContext = Pick<ApplyContext, 'actorIndex' | 'boardSize' | 't'>

const DEFAULT_VOTE_DRINKS = 3
const DEFAULT_PILE_FACE_DRINKS = 2
const DEFAULT_CHAIN_TURNS = 5
const SHAME_DICE_DRINKS = 2

/** Vote : le joueur désigné boit, sauf s'il est protégé par la case d'un autre. */
export function applyVote(caseToApply: Case, players: GamePlayer[], votedId: string, ctx: ModalContext): ApplyResult {
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const actor = updated[ctx.actorIndex]
  const voted = updated.find(p => p.id === votedId)
  if (!actor || !voted) return { players: updated, outcome: outcomeCaseBase(), drinks }
  const count = caseToApply.effect || DEFAULT_VOTE_DRINKS
  if (addDrinks(updated, voted.id, count, { sourceId: actor.id }, drinks)) {
    return { players: updated, outcome: outcomeProtectedTarget(ctx.t, voted.id), drinks }
  }
  return { players: updated, outcome: outcomeDrinks(voted.id, count), drinks }
}

/** Dé de la honte : 1–2 rien, 3–4 l'acteur boit 2, 5 il avance d'une case, 6 il recule (pas depuis le départ). */
export function applyShameDice(roll: number, players: GamePlayer[], ctx: ModalContext): ApplyResult {
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const actor = updated[ctx.actorIndex]
  if (!actor) return { players: updated, outcome: outcomeCaseBase(), drinks }
  if (roll === 6 && actor.position === 0) {
    return { players: updated, outcome: outcomeCannotRecul(actor.id), drinks }
  }
  let key = 'shameDice.outcomeBack'
  if (roll <= 2) {
    key = 'shameDice.outcomeSafe'
  } else if (roll <= 4) {
    key = 'shameDice.outcomeDrink'
    addDrinks(updated, actor.id, SHAME_DICE_DRINKS, { sourceId: actor.id }, drinks)
  } else if (roll === 5) {
    key = 'shameDice.outcomeAdvance'
    actor.position = clamp(actor.position + 1, ctx.boardSize)
  } else {
    actor.position -= 1
  }
  return { players: updated, outcome: outcomeI18n(key, { params: { roll }, playerRefs: { player: actor.id } }), drinks }
}

/** Pile ou face : la cible a choisi `side`, la pièce tombe sur `flip` ; perdu, elle boit (sauf protégée par un autre). */
export function applyPileFace(
  caseToApply: Case,
  players: GamePlayer[],
  targetId: string,
  side: 'pile' | 'face',
  flip: 'pile' | 'face',
  ctx: ModalContext
): ApplyResult {
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const actor = updated[ctx.actorIndex]
  const target = updated.find(p => p.id === targetId)
  if (!actor || !target) return { players: updated, outcome: outcomeCaseBase(), drinks }
  const { t } = ctx
  if (side === flip) {
    return {
      players: updated,
      outcome: outcomeI18n('game.outcomes.pileFaceWin', {
        playerRefs: { player: target.id },
        params: { choice: t(`coinFlip.${side}`), result: t(`coinFlip.${flip}`) },
      }),
      drinks,
    }
  }
  const count = caseToApply.effect || DEFAULT_PILE_FACE_DRINKS
  if (addDrinks(updated, target.id, count, { sourceId: actor.id }, drinks)) {
    return { players: updated, outcome: outcomeProtectedTarget(t, target.id), drinks }
  }
  return {
    players: updated,
    outcome: outcomeI18n('game.outcomes.pileFaceLose', {
      playerRefs: { player: target.id },
      params: { result: t(`coinFlip.${flip}`), count },
    }),
    drinks,
  }
}

/** Défi en chaîne : l'acteur se lie à la cible pour N tours d'initiateur (jamais soi, bloqué si elle est protégée). */
export function applyChainLink(caseToApply: Case, players: GamePlayer[], targetId: string, ctx: ModalContext): ApplyResult {
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const actor = updated[ctx.actorIndex]
  const target = updated.find(p => p.id === targetId)
  if (!actor || !target || target.id === actor.id) return { players: updated, outcome: outcomeCaseBase(), drinks }
  if (isShielded(target, actor.id)) {
    return { players: updated, outcome: outcomeProtectedTarget(ctx.t, target.id), drinks }
  }
  const turns = caseToApply.effect || DEFAULT_CHAIN_TURNS
  actor.linkedTo = target.id
  actor.linkedTurns = turns
  return { players: updated, outcome: outcomeChainLinked(actor.id, target.id, turns), drinks, chainLinked: true }
}

/**
 * Défi / Question (ou défi de la roue) jugé par le joueur au tour : raté, la
 * cible boit ; réussi, personne. Une cible protégée par un autre n'arrive pas
 * jusqu'ici : la case l'annonce protégée sans arbitrage.
 */
export function applyChallengeResult(
  players: GamePlayer[],
  targetId: string,
  drinksIfFailed: number,
  completed: boolean,
  ctx: Pick<ModalContext, 'actorIndex'>
): Pick<ApplyResult, 'players' | 'drinks'> {
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const actor = updated[ctx.actorIndex]
  if (!completed) addDrinks(updated, targetId, drinksIfFailed, { sourceId: actor?.id }, drinks)
  return { players: updated, drinks }
}

/** Chance « Avancer de 2 cases ». */
export function applyChanceAdvance(players: GamePlayer[], ctx: ModalContext): ApplyResult {
  const updated = players.map(p => ({ ...p }))
  const actor = updated[ctx.actorIndex]
  if (!actor) return { players: updated, outcome: outcomeCaseBase(), drinks: [] }
  actor.position = clamp(actor.position + 2, ctx.boardSize)
  return {
    players: updated,
    outcome: outcomeI18n('game.outcomes.chanceAdvance', {
      playerRefs: { player: actor.id },
      params: { case: actor.position + 1 },
    }),
    drinks: [],
  }
}

/** Roue des gorgées : l'acteur boit la valeur du secteur tiré (0 = sauvé). Sa propre case : jamais bloquée. */
export function applyWheelDrinks(value: number, players: GamePlayer[], actorIndex: number): Pick<ApplyResult, 'players' | 'drinks'> {
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const actor = updated[actorIndex]
  if (actor && value > 0) addDrinks(updated, actor.id, value, { sourceId: actor.id }, drinks)
  return { players: updated, drinks }
}
