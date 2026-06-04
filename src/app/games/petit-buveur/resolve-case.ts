import type { Case } from './case-config'
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

/** Applique une case sans ciblage ; retourne la liste mise à jour + texte HTML */
export function resolveNoTargetCase(
  caseType: Case,
  players: GamePlayer[],
  ctx: ResolveContext
): { players: GamePlayer[]; description: string } {
  const updated = players.map(p => ({ ...p }))
  const actor = updated[ctx.actorIndex]
  if (!actor) return { players: updated, description: caseType.description }

  switch (caseType.type) {
    case 'solo': {
      actor.drinks += caseType.effect
      return {
        players: updated,
        description: `🎯 <span class="${actor.preferences.color} text-white px-2 py-1 rounded-md">${actor.name}</span> boit 1 gorgée, les autres sont safe !`,
      }
    }
    case 'case-bonus': {
      const before = actor.position
      actor.position = Math.min(actor.position + caseType.effect, ctx.boardSize - 1)
      return {
        players: updated,
        description: `✨ <span class="${actor.preferences.color} text-white px-2 py-1 rounded-md">${actor.name}</span> avance de la case ${before + 1} à ${actor.position + 1} !`,
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
        description: `⬅️ Recul groupé ! Tous les joueurs derrière <span class="${actor.preferences.color} text-white px-2 py-1 rounded-md">${actor.name}</span> reculent d'une case.`,
      }
    }
    case 'grappin': {
      const ahead = getPlayerAhead(actor, updated)
      if (!ahead) {
        return {
          players: updated,
          description: `🪝 <span class="${actor.preferences.color} text-white px-2 py-1 rounded-md">${actor.name}</span> est déjà en tête, pas de grappin possible.`,
        }
      }
      const before = actor.position
      actor.position = ahead.position
      return {
        players: updated,
        description: `🪝 Grappin ! <span class="${actor.preferences.color} text-white px-2 py-1 rounded-md">${actor.name}</span> rejoint <span class="${ahead.preferences.color} text-white px-2 py-1 rounded-md">${ahead.name}</span> (case ${actor.position + 1}).`,
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
        description: `🌉 Pont (${advance ? 'pile' : 'face'}) ! ${onBridge.length} joueur${onBridge.length > 1 ? 's' : ''} sur la case ${actor.position + 1} ${advance ? 'avance' : 'recule'} d'une case.`,
      }
    }
    case 'loterie': {
      const pair = pickTwoRandomPlayers(updated, actor.id)
      if (!pair) {
        return { players: updated, description: '🎰 Loterie annulée (pas assez de joueurs).' }
      }
      const [drinker, mover] = pair
      drinker.drinks += 2
      mover.position = Math.min(mover.position + 1, ctx.boardSize - 1)
      return {
        players: updated,
        description: `🎰 Loterie ! <span class="${drinker.preferences.color} text-white px-2 py-1 rounded-md">${drinker.name}</span> boit 2 gorgées, <span class="${mover.preferences.color} text-white px-2 py-1 rounded-md">${mover.name}</span> avance d'une case.`,
      }
    }
    default:
      return { players: updated, description: caseType.description }
  }
}
