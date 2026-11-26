import type { Prisma, PrismaClient } from '@prisma/client'
import { onlineUserIdFromPlayerId } from '@/lib/online-players'
import type { DrinkTallySeat } from '@/lib/online/drink-tally'

/**
 * Gorgées bues par COMPTE à la fin d'une partie en ligne : une ligne
 * OnlineDrinkResult par compte humain de la table, pour le classement des
 * comptes par jeu. Contrairement aux compteurs anonymes de
 * game-drinks-server.ts, chaque ligne est rattachée à son compte (supprimée
 * avec lui).
 */

/** Ids moteur des bots de complément — jamais des comptes (cf. match-results.ts). */
const FILLER_BOT_RE = /^bot-\d+$/

const drunkCount = (n: number) => (Number.isInteger(n) && n > 0 ? n : 0)

/**
 * Écrit une ligne par compte de la table, 0 gorgée comprise : la partie
 * compte. L'appelant garantit l'unicité (fin de partie vue une seule fois).
 * Rend le nombre de lignes écrites.
 */
export async function recordOnlineDrinkResults(
  client: PrismaClient | Prisma.TransactionClient,
  args: { roomId: string; gameId: string; seats: readonly DrinkTallySeat[] }
): Promise<number> {
  // Un même compte sur deux sièges (`u1` et `online-u1`) : une seule ligne.
  const byAccount = new Map<string, number>()
  for (const seat of args.seats) {
    const userId = onlineUserIdFromPlayerId(seat.playerId) ?? seat.playerId
    if (!userId || FILLER_BOT_RE.test(userId)) continue
    byAccount.set(userId, (byAccount.get(userId) ?? 0) + drunkCount(seat.drinks))
  }
  if (byAccount.size === 0) return 0

  // Un compte supprimé en pleine partie, ou un id de siège qui n'est pas un
  // compte, ferait échouer la clé étrangère de TOUT le createMany.
  const existing = await client.user.findMany({
    where: { id: { in: [...byAccount.keys()] } },
    select: { id: true },
  })
  const known = new Set(existing.map((user) => user.id))
  const data = [...byAccount]
    .filter(([userId]) => known.has(userId))
    .map(([userId, drinks]) => ({ roomId: args.roomId, gameId: args.gameId, userId, drinks }))
  if (data.length === 0) return 0

  const { count } = await client.onlineDrinkResult.createMany({ data })
  return count
}
