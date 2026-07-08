import type { Prisma, PrismaClient } from '@prisma/client'
import { XP_LOSS, XP_WIN } from '@/lib/online/cosmetics'
import { lgTeamOf, type LGState } from '@/lib/loup-garou/engine'
import type { EngineState } from '@/lib/petit-buveur/engine'
import type { TCState } from '@/lib/toucher-coule/engine'
import type { MenteurState } from '@/lib/menteur/engine'
import type { ImposteurState } from '@/lib/imposteur/engine'
import type { QuizState } from '@/lib/quiz/engine'

/**
 * Résultats de partie EN LIGNE pour le classement (victoires/défaites —
 * les gorgées n'entrent pas en compte).
 *
 * Règles de comptage :
 *  - seuls les COMPTES humains sont enregistrés (les bots de complément
 *    `bot-N` n'existent pas en base) ;
 *  - une partie ne compte que si AU MOINS DEUX comptes y participaient —
 *    sinon on farme des victoires contre des bots ;
 *  - un déserteur (humain remplacé par un bot en cours de partie) prend
 *    une DÉFAITE, même si son remplaçant a « gagné » (anti rage-quit).
 */

/** Issue d'un joueur du MOTEUR à la fin d'une partie (avant règles de compte). */
export type MatchOutcome = {
  playerId: string
  /** true = bot de complément OU humain converti en bot (déserteur). */
  isBot: boolean
  won: boolean
  /** Rang final quand le jeu en produit un (Quiz). */
  rank?: number
}

export type MatchResultRow = {
  userId: string
  outcome: 'win' | 'loss'
  rank: number | null
  playerCount: number
  humanCount: number
}

/** Ids moteur des bots de complément — jamais des comptes utilisateur. */
const FILLER_BOT_RE = /^bot-\d+$/

/** Applique les règles de comptage. Retourne [] si la partie ne compte pas. */
export function computeMatchResults(outcomes: MatchOutcome[]): MatchResultRow[] {
  const accounts = outcomes.filter((o) => !FILLER_BOT_RE.test(o.playerId))
  if (accounts.length < 2) return []
  const playerCount = outcomes.length
  const humanCount = accounts.length
  return accounts.map((o) => ({
    userId: o.playerId,
    outcome: o.won && !o.isBot ? 'win' : 'loss',
    rank: o.rank ?? null,
    playerCount,
    humanCount,
  }))
}

/**
 * Extrait qui a gagné/perdu de l'état FINAL de chaque moteur.
 * Retourne null pour un jeu inconnu (rien n'est enregistré).
 */
export function matchOutcomesFor(gameId: string, state: unknown): MatchOutcome[] | null {
  switch (gameId) {
    case 'petit-buveur': {
      const s = state as EngineState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: Boolean(p.isBot),
        won: p.id === s.winner,
      }))
    }
    case 'toucher-coule': {
      const s = state as TCState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winner !== null && p.team === s.winner,
      }))
    }
    case 'menteur': {
      const s = state as MenteurState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: p.id === s.winnerId,
      }))
    }
    case 'imposteur': {
      const s = state as ImposteurState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winnerTeam !== null && p.team === s.winnerTeam,
      }))
    }
    case 'quiz': {
      const s = state as QuizState
      // Rang « compétition » : les ex æquo partagent le rang ; victoire = rang 1.
      const sorted = [...s.players].sort((a, b) => b.score - a.score)
      const rankOf = new Map<string, number>()
      sorted.forEach((p, i) => {
        const prev = sorted[i - 1]
        const rank = prev && prev.score === p.score ? rankOf.get(prev.id)! : i + 1
        rankOf.set(p.id, rank)
      })
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: rankOf.get(p.id) === 1,
        rank: rankOf.get(p.id),
      }))
    }
    case 'loup-garou': {
      const s = state as LGState
      return s.players.map((p) => ({
        playerId: p.id,
        isBot: p.isBot,
        won: s.winnerTeam !== null && lgTeamOf(p.role) === s.winnerTeam,
      }))
    }
    default:
      return null
  }
}

/**
 * Enregistre les résultats d'une partie qui VIENT de se terminer.
 * L'appelant garantit l'unicité (transition !finished → finished sous
 * compare-and-swap de stateVersion dans la route action).
 */
export async function recordMatchResults(
  client: PrismaClient | Prisma.TransactionClient,
  args: { roomId: string; gameId: string; state: unknown }
): Promise<number> {
  const outcomes = matchOutcomesFor(args.gameId, args.state)
  if (!outcomes) return 0
  const rows = computeMatchResults(outcomes)
  if (rows.length === 0) return 0
  await client.onlineMatchResult.createMany({
    data: rows.map((r) => ({
      roomId: args.roomId,
      gameId: args.gameId,
      userId: r.userId,
      outcome: r.outcome,
      rank: r.rank,
      playerCount: r.playerCount,
      humanCount: r.humanCount,
    })),
  })
  // XP de progression : mêmes règles de comptage que le classement.
  const winners = rows.filter((r) => r.outcome === 'win').map((r) => r.userId)
  const losers = rows.filter((r) => r.outcome === 'loss').map((r) => r.userId)
  if (winners.length > 0) {
    await client.user.updateMany({
      where: { id: { in: winners } },
      data: { onlineXp: { increment: XP_WIN } },
    })
  }
  if (losers.length > 0) {
    await client.user.updateMany({
      where: { id: { in: losers } },
      data: { onlineXp: { increment: XP_LOSS } },
    })
  }
  return rows.length
}
