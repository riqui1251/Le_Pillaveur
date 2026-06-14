import type { Case, PetitBuveurT } from './case-config'
import type { EffectOutcome } from './case-notification'
import type { GamePlayer } from './case-types'

export type ResolveContext = {
  boardSize: number
  actorIndex: number
  lastMoveDelta: number
  lastCase: Case | null
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

export function pickTwoRandomPlayers(players: GamePlayer[], excludeId?: string): [GamePlayer, GamePlayer] | null {
  const pool = players.filter(p => p.id !== excludeId)
  if (pool.length < 2) return null
  const a = pool[Math.floor(Math.random() * pool.length)]
  const rest = pool.filter(p => p.id !== a.id)
  const b = rest[Math.floor(Math.random() * rest.length)]
  return [a, b]
}

/** Applique une case sans ciblage ; retourne la liste mise à jour + outcome i18n (IDs joueur) */
export function resolveNoTargetCase(
  caseType: Case,
  players: GamePlayer[],
  ctx: ResolveContext,
  t: PetitBuveurT,
  _formatPlayer: (player: GamePlayer) => string
): { players: GamePlayer[]; outcome: EffectOutcome } {
  const updated = players.map(p => ({ ...p }))
  const actor = updated[ctx.actorIndex]
  if (!actor) return { players: updated, outcome: { type: 'caseBase' } }

  switch (caseType.type) {
    case 'solo':
      actor.drinks += caseType.effect
      return {
        players: updated,
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
      updated.forEach(p => {
        if (p.position < actor.position) {
          p.position = Math.max(0, p.position - 1)
        }
      })
      return {
        players: updated,
        outcome: {
          type: 'i18n',
          key: 'resolveCase.reculGroupe',
          playerRefs: { actor: actor.id },
        },
      }
    }
    case 'grappin': {
      const ahead = getPlayerAhead(actor, updated)
      if (!ahead) {
        return {
          players: updated,
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
        outcome: {
          type: 'i18n',
          key: 'resolveCase.grappinJoin',
          htmlParams: { case: String(actor.position + 1) },
          playerRefs: { actor: actor.id, target: ahead.id },
        },
      }
    }
    case 'pont': {
      const advance = Math.random() < 0.5
      const delta = advance ? 1 : -1
      const onBridge = updated.filter(p => p.position === actor.position)
      onBridge.forEach(p => {
        p.position = Math.max(0, Math.min(ctx.boardSize - 1, p.position + delta))
      })
      return {
        players: updated,
        outcome: {
          type: 'i18n',
          key: 'resolveCase.pont',
          params: {
            side: advance ? t('resolveCase.pontPile') : t('resolveCase.pontFace'),
            count: onBridge.length,
            case: actor.position + 1,
            direction: advance ? t('resolveCase.pontAdvance') : t('resolveCase.pontBack'),
          },
        },
      }
    }
    case 'loterie': {
      const pair = pickTwoRandomPlayers(updated, actor.id)
      if (!pair) {
        return {
          players: updated,
          outcome: { type: 'i18n', key: 'resolveCase.loterieCancelled' },
        }
      }
      const [drinker, mover] = pair
      drinker.drinks += 2
      mover.position = Math.min(mover.position + 1, ctx.boardSize - 1)
      return {
        players: updated,
        outcome: {
          type: 'i18n',
          key: 'resolveCase.loterieResult',
          playerRefs: { drinker: drinker.id, mover: mover.id },
        },
      }
    }
    default:
      return { players: updated, outcome: { type: 'caseBase' } }
  }
}
