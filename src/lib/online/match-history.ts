import type { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * « Mes dernières tables » (fiche compte) : les dernières parties EN LIGNE
 * terminées du joueur, et avec qui il les a jouées.
 *
 * Source : OnlineMatchResult, une ligne par compte humain et par partie
 * classée — la fiche n'en montrait que des agrégats, et la rangée « Rejouer »
 * de /jeux s'arrête à un jeu et sa dernière date.
 *
 * « La même partie » = même roomId ET fin à quelques secondes près : une
 * salle rejouée garde son roomId, le roomId seul mélangerait donc toutes les
 * parties d'une soirée. Les lignes d'une partie naissent ensemble (un seul
 * createMany dans recordMatchResults) ; deux parties d'une même salle sont
 * séparées par au moins une partie entière, bien plus que la fenêtre.
 *
 * Confidentialité : un partenaire n'est décrit que par son identifiant et
 * son nom de table ACTUEL (lu à l'affichage, pas figé à la partie : un
 * pseudo changé depuis apparaît sous sa nouvelle forme). Ni e-mail, ni code
 * de compte : ils ne sont même pas lus. Un blocage, dans un sens ou dans
 * l'autre (moderation/blocks.ts), efface la contrepartie de la liste :
 * sans cela, un joueur bloqué suivait le pseudo de qui l'avait bloqué.
 */

/** Taille de la liste par défaut : ce que la fiche affiche. */
export const RECENT_TABLES_LIMIT = 10

/** Plafond dur, quel que soit l'appelant : la requête des partenaires grossit avec la liste. */
export const RECENT_TABLES_MAX = 50

/** Écart maximal entre deux lignes d'une même partie. */
export const SAME_MATCH_WINDOW_MS = 5_000

export type RecentTablePartner = {
  userId: string
  /** Nom affiché à la table (onlineDisplayName, à défaut displayName). */
  name: string
  /** Amitié acceptée, dans un sens ou dans l'autre : seul un ami peut être invité. */
  isFriend: boolean
}

export type RecentTable = {
  gameId: string
  finishedAt: string
  outcome: 'win' | 'loss'
  /** Rang final quand le jeu en produit un (Quiz) — null sinon. */
  rank: number | null
  /** Effectif total, bots compris. */
  playerCount: number
  /** Comptes humains de la partie, soi compris. */
  humanCount: number
  /** Partenaires humains encore existants, amis d'abord. */
  partners: RecentTablePartner[]
}

/** Ligne du joueur lui-même : une partie de la liste. */
export type OwnMatchRow = {
  roomId: string
  gameId: string
  outcome: string
  rank: number | null
  playerCount: number
  humanCount: number
  finishedAt: Date
}

/** Ligne d'un autre compte, candidate au rôle de partenaire. */
export type PartnerMatchRow = {
  roomId: string
  userId: string
  finishedAt: Date
}

export type PartnerAccount = {
  onlineDisplayName: string | null
  displayName: string
}

/** Ce que la lecture utilise du client Prisma — un client factice suffit aux tests. */
export type MatchHistoryClient = Pick<
  PrismaClient,
  'onlineMatchResult' | 'user' | 'friendship' | 'userBlock'
>

/** Limite demandée ramenée à [1, RECENT_TABLES_MAX] ; une valeur absurde retombe sur le défaut. */
export function clampRecentTablesLimit(limit: number): number {
  if (!Number.isFinite(limit)) return RECENT_TABLES_LIMIT
  return Math.min(RECENT_TABLES_MAX, Math.max(1, Math.floor(limit)))
}

/** Nom affiché à la table : le pseudo en ligne s'il existe, sinon le pseudo du compte. */
export function tableNameOf(account: PartnerAccount): string {
  const online = account.onlineDisplayName?.trim()
  return online ? online : account.displayName
}

/**
 * Assemble la liste : une entrée par ligne du joueur, dans l'ordre reçu, avec
 * les partenaires de CETTE partie. Fonction pure (les requêtes vivent dans
 * listRecentTables) : c'est le regroupement qu'on veut tester, pas Prisma.
 *
 * Un partenaire absent de `accounts` est un compte supprimé (ou un invité
 * purgé) : il disparaît de la liste plutôt que d'y laisser un nom orphelin.
 */
export function assembleRecentTables(params: {
  selfUserId: string
  ownRows: OwnMatchRow[]
  partnerRows: PartnerMatchRow[]
  accounts: ReadonlyMap<string, PartnerAccount>
  friendIds: ReadonlySet<string>
}): RecentTable[] {
  const { selfUserId, ownRows, partnerRows, accounts, friendIds } = params

  return ownRows.map((own) => {
    const at = own.finishedAt.getTime()
    const seen = new Set<string>()
    const partners: RecentTablePartner[] = []
    for (const row of partnerRows) {
      if (row.roomId !== own.roomId) continue
      if (Math.abs(row.finishedAt.getTime() - at) > SAME_MATCH_WINDOW_MS) continue
      if (row.userId === selfUserId || seen.has(row.userId)) continue
      seen.add(row.userId)
      const account = accounts.get(row.userId)
      if (!account) continue
      partners.push({
        userId: row.userId,
        name: tableNameOf(account),
        isFriend: friendIds.has(row.userId),
      })
    }
    // Amis d'abord : ce sont eux que la revanche invite, et la fiche n'en
    // montre que trois. Puis l'ordre alphabétique, pour une liste stable.
    partners.sort((a, b) =>
      a.isFriend === b.isFriend ? a.name.localeCompare(b.name) : a.isFriend ? -1 : 1
    )

    return {
      gameId: own.gameId,
      finishedAt: own.finishedAt.toISOString(),
      outcome: own.outcome === 'win' ? 'win' : 'loss',
      rank: own.rank,
      playerCount: own.playerCount,
      humanCount: own.humanCount,
      partners,
    }
  })
}

/**
 * Les `limit` dernières parties classées du joueur (index [userId,
 * finishedAt]), avec leurs partenaires humains et le flag « ami ».
 *
 * Cinq lectures au plus, aucune écriture — jamais appelée dans une
 * transaction. La recherche des partenaires borne chaque partie par sa
 * fenêtre de fin (index [finishedAt]) : la table n'a pas d'index sur roomId,
 * un `roomId IN (…)` seul la parcourrait en entier.
 */
export async function listRecentTables(
  userId: string,
  limit: number = RECENT_TABLES_LIMIT,
  client: MatchHistoryClient = prisma
): Promise<RecentTable[]> {
  const ownRows = await client.onlineMatchResult.findMany({
    where: { userId },
    orderBy: { finishedAt: 'desc' },
    take: clampRecentTablesLimit(limit),
    select: {
      roomId: true,
      gameId: true,
      outcome: true,
      rank: true,
      playerCount: true,
      humanCount: true,
      finishedAt: true,
    },
  })
  if (ownRows.length === 0) return []

  const partnerRows = await client.onlineMatchResult.findMany({
    where: {
      userId: { not: userId },
      OR: ownRows.map((row) => ({
        roomId: row.roomId,
        finishedAt: {
          gte: new Date(row.finishedAt.getTime() - SAME_MATCH_WINDOW_MS),
          lte: new Date(row.finishedAt.getTime() + SAME_MATCH_WINDOW_MS),
        },
      })),
    },
    select: { roomId: true, userId: true, finishedAt: true },
  })

  const candidateIds = [...new Set(partnerRows.map((row) => row.userId))]
  const accounts = new Map<string, PartnerAccount>()
  const friendIds = new Set<string>()

  // Blocage appliqué dans les deux sens (moderation/blocks.ts) : la
  // contrepartie n'est pas lue, elle disparaît donc comme un compte supprimé
  // (assembleRecentTables). Même requête que listBlockedCounterpartIds, mais
  // sur le client reçu et bornée aux partenaires.
  const blocked = new Set<string>()
  if (candidateIds.length > 0) {
    const blocks = await client.userBlock.findMany({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: candidateIds } },
          { blockedId: userId, blockerId: { in: candidateIds } },
        ],
      },
      select: { blockerId: true, blockedId: true },
    })
    for (const b of blocks) blocked.add(b.blockerId === userId ? b.blockedId : b.blockerId)
  }
  const partnerIds = candidateIds.filter((id) => !blocked.has(id))

  if (partnerIds.length > 0) {
    // Comptes encore existants seulement, et rien que le nom de table.
    const users = await client.user.findMany({
      where: { id: { in: partnerIds } },
      select: { id: true, onlineDisplayName: true, displayName: true },
    })
    for (const user of users) {
      accounts.set(user.id, { onlineDisplayName: user.onlineDisplayName, displayName: user.displayName })
    }

    const friendships = await client.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [
          { requesterId: userId, addresseeId: { in: partnerIds } },
          { addresseeId: userId, requesterId: { in: partnerIds } },
        ],
      },
      select: { requesterId: true, addresseeId: true },
    })
    for (const f of friendships) {
      friendIds.add(f.requesterId === userId ? f.addresseeId : f.requesterId)
    }
  }

  return assembleRecentTables({ selfUserId: userId, ownRows, partnerRows, accounts, friendIds })
}
