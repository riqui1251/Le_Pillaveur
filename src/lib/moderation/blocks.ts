import { prisma } from '@/lib/prisma'

/**
 * Blocage entre joueurs — seul point de vérité.
 *
 * Le blocage est ENREGISTRÉ dans un sens (qui a bloqué qui) mais APPLIQUÉ dans
 * les deux : celui qui bloque ne veut plus rien recevoir, et il n'a aucune
 * raison de pouvoir continuer à écrire à celui qu'il vient de couper. Une
 * vérification unique (`isBlockedBetween`) évite d'oublier un sens à l'usage.
 */

export type BlockedUserDto = {
  userId: string
  displayName: string
  accountCode: string | null
  createdAt: string
}

/** Un blocage existe-t-il dans un sens ou dans l'autre entre A et B ? */
export async function isBlockedBetween(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return false
  const block = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userIdA, blockedId: userIdB },
        { blockerId: userIdB, blockedId: userIdA },
      ],
    },
    select: { id: true },
  })
  return block !== null
}

/**
 * Tous les joueurs liés à `userId` par un blocage, quel qu'en soit le sens —
 * une seule requête, réutilisée pour masquer leurs messages dans le chat de
 * salle et pour ne pas compter leurs non-lus.
 */
export async function listBlockedCounterpartIds(userId: string): Promise<Set<string>> {
  const blocks = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  })
  return new Set(blocks.map((b) => (b.blockerId === userId ? b.blockedId : b.blockerId)))
}

/**
 * Statuts d'amitié qu'un blocage efface. Le refus (`declined`) en est
 * VOLONTAIREMENT absent : c'est cette ligne-là qui porte l'horodatage du délai
 * avant relance (voir DECLINE_COOLDOWN_MS dans src/lib/friends.ts). L'effacer
 * offrirait un contournement en trois clics — bloquer, débloquer, redemander —
 * qui remettrait le compteur à zéro et rendrait le refus inopérant.
 */
const FRIENDSHIP_STATUSES_CLEARED_BY_BLOCK = ['accepted', 'pending'] as const

/**
 * Bloque un joueur. Effet de bord assumé : l'amitié acceptée et les demandes en
 * attente (dans les deux sens) sont SUPPRIMÉES — laisser une amitié vivante
 * avec quelqu'un qu'on vient de bloquer n'aurait aucun sens. Le refus, lui,
 * SURVIT au blocage puis au déblocage : il est la mémoire du « non ».
 */
export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.$transaction([
    prisma.friendship.deleteMany({
      where: {
        status: { in: [...FRIENDSHIP_STATUSES_CLEARED_BY_BLOCK] },
        OR: [
          { requesterId: blockerId, addresseeId: blockedId },
          { requesterId: blockedId, addresseeId: blockerId },
        ],
      },
    }),
    prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    }),
  ])
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } })
}

/** Liste des joueurs que `userId` a bloqués (pas ceux qui l'ont bloqué). */
export async function listBlockedUsers(userId: string): Promise<BlockedUserDto[]> {
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: userId },
    orderBy: { createdAt: 'desc' },
    include: { blocked: { select: { id: true, displayName: true, accountCode: true } } },
  })
  return rows.map((row) => ({
    userId: row.blocked.id,
    displayName: row.blocked.displayName,
    accountCode: row.blocked.accountCode,
    createdAt: row.createdAt.toISOString(),
  }))
}
