import type { Case, PetitBuveurT } from './case-config'
import { protectedBadgeHtml, type EffectOutcome } from './case-notification'
import type { GamePlayer } from './case-types'
import {
  outcomeCannotRecul,
  outcomeCompose,
  outcomeI18n,
  outcomeSafeCase,
  outcomeShielded,
} from './outcome-helpers'
import { addDrinks, isShielded, shuffle, type DrinkEntry, type Rng } from './local-rules'

export type ResolveContext = {
  boardSize: number
  actorIndex: number
  lastMoveDelta: number
  lastCase: Case | null
  rng?: Rng
}

export type ResolveResult = { players: GamePlayer[]; outcome: EffectOutcome; drinks: DrinkEntry[] }

/** Recul d'une case imposé par un effet : bloqué par la protection, impossible depuis la case de départ. */
function stepBack(
  player: GamePlayer,
  actorId: string,
  t: PetitBuveurT,
  notes: EffectOutcome[]
): boolean {
  if (isShielded(player, actorId)) {
    notes.push(outcomeShielded(t, player.id))
    return false
  }
  if (player.position === 0) {
    notes.push(outcomeCannotRecul(player.id))
    return false
  }
  player.position -= 1
  return true
}

function withNotes(main: EffectOutcome, notes: EffectOutcome[]): EffectOutcome {
  return notes.length > 0 ? outcomeCompose(main, ...notes) : main
}

export function getLeader(players: GamePlayer[]): GamePlayer {
  return [...players].sort((a, b) => b.position - a.position)[0]
}

export function getLastPlayer(players: GamePlayer[]): GamePlayer {
  return [...players].sort((a, b) => a.position - b.position)[0]
}

export function getPlayerAhead(actor: GamePlayer, players: GamePlayer[]): GamePlayer | null {
  const ahead = players
    .filter(p => p.position > actor.position)
    .sort((a, b) => a.position - b.position)
  return ahead[0] ?? null
}

export function pickTwoRandomPlayers(
  players: GamePlayer[],
  excludeId?: string,
  rng: Rng = Math.random
): [GamePlayer, GamePlayer] | null {
  const pool = players.filter(p => p.id !== excludeId)
  if (pool.length < 2) return null
  const [a, b] = shuffle(pool, rng)
  return [a, b]
}

/** Applique une case sans ciblage ; retourne la liste mise à jour + outcome i18n (IDs joueur) */
export function resolveNoTargetCase(
  caseType: Case,
  players: GamePlayer[],
  ctx: ResolveContext,
  t: PetitBuveurT,
  _formatPlayer?: (player: GamePlayer) => string
): ResolveResult {
  const updated = players.map(p => ({ ...p }))
  const drinks: DrinkEntry[] = []
  const rng = ctx.rng ?? Math.random
  const actor = updated[ctx.actorIndex]
  if (!actor) return { players: updated, outcome: { type: 'caseBase' }, drinks }

  switch (caseType.type) {
    case 'normal':
      return { players: updated, outcome: outcomeSafeCase(actor.id), drinks }
    // Sa propre case : la protection ne s'applique pas.
    case 'solo':
      addDrinks(updated, actor.id, caseType.effect, { sourceId: actor.id }, drinks)
      return {
        players: updated,
        drinks,
        outcome: {
          type: 'i18n',
          key: 'resolveCase.solo',
          playerRefs: { actor: actor.id },
        },
      }
    case 'case-bonus': {
      const before = actor.position
      actor.position = Math.min(actor.position + caseType.effect, ctx.boardSize - 1)
      return {
        players: updated,
        drinks,
        outcome: {
          type: 'i18n',
          key: 'resolveCase.bonus',
          htmlParams: {
            from: String(before + 1),
            to: String(actor.position + 1),
          },
          playerRefs: { actor: actor.id },
        },
      }
    }
    case 'recul-groupe': {
      const behind = updated.filter(p => p.position < actor.position)
      if (behind.length === 0) {
        return {
          players: updated,
          drinks,
          outcome: outcomeI18n('resolveCase.reculGroupeNobody', { playerRefs: { actor: actor.id } }),
        }
      }
      const notes: EffectOutcome[] = []
      const moved = behind.filter(p => stepBack(p, actor.id, t, notes)).length
      const main = outcomeI18n('resolveCase.reculGroupe', { playerRefs: { actor: actor.id } })
      return {
        players: updated,
        drinks,
        outcome: moved > 0 ? withNotes(main, notes) : outcomeCompose(...notes),
      }
    }
    case 'grappin': {
      const ahead = getPlayerAhead(actor, updated)
      if (!ahead) {
        return {
          players: updated,
          drinks,
          outcome: {
            type: 'i18n',
            key: 'resolveCase.grappinLeader',
            playerRefs: { actor: actor.id },
          },
        }
      }
      actor.position = ahead.position
      return {
        players: updated,
        drinks,
        outcome: {
          type: 'i18n',
          key: 'resolveCase.grappinJoin',
          htmlParams: { case: String(actor.position + 1) },
          playerRefs: { actor: actor.id, target: ahead.id },
        },
      }
    }
    case 'pont': {
      const advance = rng() < 0.5
      const side = advance ? t('resolveCase.pontPile') : t('resolveCase.pontFace')
      const bridge = actor.position
      // Liste figée AVANT de déplacer : l'acteur est sur le pont et bouge aussi.
      const onBridge = updated.filter(p => p.position === bridge)
      if (!advance && bridge === 0) {
        return {
          players: updated,
          drinks,
          outcome: outcomeI18n('resolveCase.pontNoBack', { params: { side, case: bridge + 1 } }),
        }
      }
      const notes: EffectOutcome[] = []
      let moved = 0
      for (const p of onBridge) {
        if (advance) {
          p.position = Math.min(ctx.boardSize - 1, p.position + 1)
          moved += 1
        } else if (stepBack(p, actor.id, t, notes)) {
          moved += 1
        }
      }
      const main = outcomeI18n('resolveCase.pont', {
        params: {
          side,
          count: moved,
          case: bridge + 1,
          direction: advance ? t('resolveCase.pontAdvance') : t('resolveCase.pontBack'),
        },
      })
      return { players: updated, drinks, outcome: withNotes(main, notes) }
    }
    case 'loterie': {
      const pair = pickTwoRandomPlayers(updated, actor.id, rng)
      if (!pair) {
        return {
          players: updated,
          drinks,
          outcome: { type: 'i18n', key: 'resolveCase.loterieCancelled' },
        }
      }
      const [drinker, mover] = pair
      const blocked = addDrinks(updated, drinker.id, 2, { sourceId: actor.id }, drinks)
      mover.position = Math.min(mover.position + 1, ctx.boardSize - 1)
      const playerRefs = { drinker: drinker.id, mover: mover.id }
      return {
        players: updated,
        drinks,
        outcome: blocked
          ? outcomeI18n('resolveCase.loterieProtected', {
              playerRefs,
              htmlParams: { protected: protectedBadgeHtml(t) },
            })
          : outcomeI18n('resolveCase.loterieResult', { playerRefs }),
      }
    }
    default:
      return { players: updated, outcome: { type: 'caseBase' }, drinks }
  }
}
