import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * Succès (page /achievements) : l'infra existait (table, page, i18n) mais rien
 * ne les débloquait jamais — ce module est le chaînon manquant. Chaque succès
 * s'écrit UNE fois (contrainte unique userId+type) et ne doit jamais casser
 * l'appelant : tout passe par awardAchievement qui avale les doublons.
 *
 * Types débloqués automatiquement :
 *  - first_game        : première partie en ligne terminée (bots compris) ;
 *  - first_win         : première victoire comptée ;
 *  - first_friend      : première amitié acceptée (les deux joueurs) ;
 *  - first_room        : première table créée ;
 *  - speed_demon       : gagner une partie de Quiz (« Vif comme l'éclair ») ;
 *  - perfect_game      : 3 victoires le même jour (Paris) ;
 *  - social_butterfly  : avoir joué avec 8 comptes différents ;
 *  - night_owl         : partie terminée entre minuit et 6 h (Paris).
 */

type Db = PrismaClient | Prisma.TransactionClient

export const ACHIEVEMENT_TYPES = [
  'first_game',
  'first_win',
  'first_friend',
  'first_room',
  'speed_demon',
  'perfect_game',
  'social_butterfly',
  'night_owl',
] as const

export type AchievementType = (typeof ACHIEVEMENT_TYPES)[number]

/**
 * Succès obtenus HORS partie : ils se débloquent dans une route API (table
 * créée, demande d'ami acceptée) où AUCUN écran ne peut les annoncer. On les
 * rattache donc à la première fin de partie qui suit, dans la fenêtre
 * ci-dessous — au-delà, l'annonce n'aurait plus de sens. Les succès de fin de
 * partie, eux, sont annoncés par la partie qui les débloque : les rattraper
 * ici les ferait ressortir en double.
 */
export const OUT_OF_MATCH_ACHIEVEMENTS: ReadonlySet<string> = new Set([
  'first_room',
  'first_friend',
])
export const ACHIEVEMENT_ANNOUNCE_WINDOW_MS = 6 * 60 * 60 * 1000

/** Écrit le succès s'il manque. Jamais bloquant (doublon → false). */
export async function awardAchievement(
  client: Db,
  userId: string,
  type: AchievementType
): Promise<boolean> {
  try {
    await client.achievement.create({ data: { userId, type } })
    return true
  } catch {
    // Déjà débloqué (contrainte unique) ou compte disparu — on ignore.
    return false
  }
}

function hourParis(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Paris',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date())
  )
}

function dayParisOf(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Succès de fin de partie — appelé par recordMatchResults APRÈS l'écriture
 * des lignes de classement (les requêtes « victoires du jour » et « joué
 * avec 8 comptes » voient donc la partie courante). `userIds` = comptes
 * crédités (solo contre bots compris), `winnerIds` = sous-ensemble gagnant.
 */
export async function checkMatchAchievements(
  client: Db,
  args: { gameId: string; userIds: string[]; winnerIds: string[] }
): Promise<Map<string, AchievementType[]>> {
  const { gameId, userIds, winnerIds } = args
  // Ce que CETTE partie vient de débloquer, par joueur : sans ça, le succès
  // tombait en silence (rien ne l'annonçait au joueur au moment où il arrive).
  const unlocked = new Map<string, AchievementType[]>()
  const note = (userId: string, type: AchievementType, won: boolean) => {
    if (!won) return
    const list = unlocked.get(userId) ?? []
    list.push(type)
    unlocked.set(userId, list)
  }
  if (userIds.length === 0) return unlocked

  const existing = await client.achievement.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, type: true, unlockedAt: true },
  })
  const has = new Set(existing.map((a) => `${a.userId}:${a.type}`))
  const missing = (userId: string, type: AchievementType) => !has.has(`${userId}:${type}`)

  // Rattrapage des succès hors partie, tout frais. Le dédoublonnage des
  // annonces vit dans xp.ts — une même soirée ne les répète pas.
  const since = Date.now() - ACHIEVEMENT_ANNOUNCE_WINDOW_MS
  for (const a of existing) {
    if (!OUT_OF_MATCH_ACHIEVEMENTS.has(a.type)) continue
    const at = a.unlockedAt instanceof Date ? a.unlockedAt.getTime() : 0
    if (at >= since) note(a.userId, a.type as AchievementType, true)
  }

  const nightly = hourParis() < 6

  for (const userId of userIds) {
    if (missing(userId, 'first_game')) {
      note(userId, 'first_game', await awardAchievement(client, userId, 'first_game'))
    }
    if (nightly && missing(userId, 'night_owl')) {
      note(userId, 'night_owl', await awardAchievement(client, userId, 'night_owl'))
    }

    if (missing(userId, 'social_butterfly')) {
      const myRooms = await client.onlineMatchResult.findMany({
        where: { userId },
        select: { roomId: true },
        orderBy: { finishedAt: 'desc' },
        take: 200,
      })
      const roomIds = [...new Set(myRooms.map((r) => r.roomId))]
      if (roomIds.length > 0) {
        const others = await client.onlineMatchResult.findMany({
          where: { roomId: { in: roomIds }, userId: { not: userId } },
          select: { userId: true },
          distinct: ['userId'],
          take: 8,
        })
        if (others.length >= 8) {
          note(userId, 'social_butterfly', await awardAchievement(client, userId, 'social_butterfly'))
        }
      }
    }
  }

  for (const userId of winnerIds) {
    if (missing(userId, 'first_win')) {
      note(userId, 'first_win', await awardAchievement(client, userId, 'first_win'))
    }
    if (gameId === 'quiz' && missing(userId, 'speed_demon')) {
      note(userId, 'speed_demon', await awardAchievement(client, userId, 'speed_demon'))
    }
    if (missing(userId, 'perfect_game')) {
      // 3 victoires le même jour (Paris) — fenêtre large puis filtre précis.
      const recent = await client.onlineMatchResult.findMany({
        where: {
          userId,
          outcome: 'win',
          finishedAt: { gte: new Date(Date.now() - 36 * 60 * 60 * 1000) },
        },
        select: { finishedAt: true },
      })
      const today = dayParisOf(new Date())
      const winsToday = recent.filter((r) => dayParisOf(r.finishedAt) === today).length
      if (winsToday >= 3) {
        note(userId, 'perfect_game', await awardAchievement(client, userId, 'perfect_game'))
      }
    }
  }

  return unlocked
}
