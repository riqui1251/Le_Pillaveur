import { prisma } from '@/lib/prisma'
import { GAMES } from '@/lib/games'
import { subjectKeyFor } from '@/lib/ip-history-server'
import type * as SupervisionServer from '@/lib/supervision-overview-server'

export const PRESENCE_PING_SECONDS = 60

/**
 * Actions de staff SANS compte cible propre, ancrées sur leur auteur (F42).
 * Liste recopiée volontairement : l'import de valeur créerait un cycle
 * (supervision-overview-server → analytics-server → ce fichier). Le type
 * importé, lui, est effacé à la compilation et suffit à garantir qu'aucune
 * des deux listes ne dérive sans casser le build.
 */
const STAFF_SELF_ANCHORED_ACTIONS: typeof SupervisionServer.STAFF_SELF_ANCHORED_ACTIONS = [
  'account-delete',
  'room-close',
  'site-setting',
]

/**
 * Compte sur lequel ré-ancrer les traces de staff qui, sinon, partiraient en
 * cascade avec le compte effacé. `AccountBanEvent.userId` est obligatoire :
 * sans point d'accroche, pas de ligne. On prend le compte de staff le plus
 * élevé et le plus ancien encore en place — en pratique le fondateur, qu'aucun
 * grade ne peut supprimer. Cet ancrage est purement technique : ces actions
 * sont exclues de l'historique de modération d'une fiche de compte (voir
 * /api/admin/users/[userId]) et le journal ne leur affiche aucune cible.
 */
async function findStaffJournalAnchorId(excludedUserId: string): Promise<string | null> {
  for (const role of ['fondateur', 'superadmin', 'admin']) {
    const anchor = await prisma.user.findFirst({
      where: { role, id: { not: excludedUserId } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    if (anchor) return anchor.id
  }
  return null
}

export type UserGamePlayStat = {
  gameId: string
  title: string
  emoji: string
  partiesPlayed: number
}

function aggregateCloudGameStats(localPlayersJson: string | null): Map<string, number> {
  const map = new Map<string, number>()
  if (!localPlayersJson) return map

  try {
    const players = JSON.parse(localPlayersJson) as Array<{
      stats?: { gameStats?: Record<string, { gamesPlayed?: number }> }
    }>
    if (!Array.isArray(players)) return map

    for (const player of players) {
      const gameStats = player.stats?.gameStats
      if (!gameStats) continue
      for (const [gameId, data] of Object.entries(gameStats)) {
        const played = typeof data.gamesPlayed === 'number' ? data.gamesPlayed : 0
        if (played > 0) {
          map.set(gameId, (map.get(gameId) ?? 0) + played)
        }
      }
    }
  } catch {
    /* ignore */
  }

  return map
}

export async function getUserGamePlayStats(userId: string): Promise<UserGamePlayStat[]> {
  const [dbCounts, user] = await Promise.all([
    prisma.stats.groupBy({
      by: ['gameType'],
      where: { userId },
      _count: { _all: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { localPlayersJson: true },
    }),
  ])

  const dbMap = new Map(dbCounts.map((row) => [row.gameType, row._count._all]))
  const cloudMap = aggregateCloudGameStats(user?.localPlayersJson ?? null)

  const allIds = new Set([...dbMap.keys(), ...cloudMap.keys()])

  return [...allIds]
    .map((gameId) => {
      const meta = GAMES.find((g) => g.id === gameId)
      const partiesPlayed = (cloudMap.get(gameId) ?? 0) + (dbMap.get(gameId) ?? 0)
      return {
        gameId,
        title: meta?.title ?? gameId,
        emoji: meta?.emoji ?? '🎮',
        partiesPlayed,
      }
    })
    .filter((g) => g.partiesPlayed > 0)
    .sort((a, b) => b.partiesPlayed - a.partiesPlayed)
}

/**
 * Effacement RGPD d'un compte. Les tables sans clé étrangère vers User
 * (IpSeenLog, indexée par `subjectKey`) et les champs conservés par une
 * relation SetNull (UserFeedback.contactEmail, alimenté automatiquement avec
 * l'email du compte) survivraient au `user.delete` : ils sont traités ici,
 * dans la même transaction et AVANT la suppression du compte.
 *
 * Symétriquement, le journal des actions de staff ne doit PAS partir avec le
 * compte : voir le détail des trois cas dans la transaction ci-dessous.
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  const anchorId = await findStaffJournalAnchorId(userId)

  await prisma.$transaction([
    prisma.stats.deleteMany({ where: { userId } }),
    prisma.achievement.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    // Journal d'exploitation (F42) : les traces d'ACTIONS DE STAFF doivent
    // survivre au compte de leur auteur — un journal qui s'efface avec lui
    // n'en est pas un. On anonymise donc l'auteur au lieu de jeter la ligne.
    //
    // Compromis RGPD assumé : ce qui reste ne dit plus QUI a agi (`actorId`
    // vidé, aucun nom ni email recopié), seulement qu'une action
    // d'exploitation a eu lieu, laquelle, sur quoi et quand — le minimum pour
    // que le journal reste opposable. À l'inverse, les sanctions SUBIES par ce
    // compte sont bien effacées : ce sont ses données à lui.
    //
    // 1) Actions faites PAR ce compte SUR un autre compte : la ligne
    //    appartient à la cible, elle reste ; seul l'auteur est anonymisé.
    prisma.accountBanEvent.updateMany({
      where: { actorId: userId, userId: { not: userId } },
      data: { actorId: null },
    }),
    // 2) Actions de staff sans cible propre, ancrées sur leur auteur : la
    //    cascade du `user.delete` les emporterait. Ré-ancrées sur un compte
    //    de staff pérenne, puis anonymisées. Sans compte d'ancrage
    //    disponible, elles suivent le sort du compte (rien à faire de plus
    //    sans modèle d'audit dédié).
    ...(anchorId
      ? [
          prisma.accountBanEvent.updateMany({
            where: { userId, action: { in: [...STAFF_SELF_ANCHORED_ACTIONS] } },
            data: { userId: anchorId, actorId: null },
          }),
        ]
      : []),
    // 3) Ce qui reste ancré sur ce compte, ce sont les sanctions qu'il a
    //    subies : données personnelles, donc effacées (la cascade le ferait,
    //    on reste explicite — l'ordre du tableau garantit que le 2) est
    //    déjà passé).
    prisma.accountBanEvent.deleteMany({ where: { userId } }),
    // $executeRaw : IpSeenLog est manipulé en SQL brut partout (ip-history-server).
    // Seules les lignes `user:<id>` sont rattachables au compte ; celles d'un
    // visiteur non connecté (`visitor:<vid>`) partent avec la purge à 6 mois.
    prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "subjectKey" = ${subjectKeyFor(userId, '')}`,
    prisma.userFeedback.updateMany({
      where: { userId },
      data: { contactEmail: null },
    }),
    prisma.sitePresence.updateMany({
      where: { userId },
      data: { userId: null },
    }),
    prisma.user.delete({ where: { id: userId } }),
  ])
}
