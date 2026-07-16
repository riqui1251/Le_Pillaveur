import { prisma } from '@/lib/prisma'
import { deleteUserAccount } from '@/lib/user-activity-server'

/**
 * Purges RGPD « au passage » : le projet n'a aucun cron serveur (tout est
 * déclenché par le trafic, même principe que cleanupAbandonedRooms), donc les
 * durées de conservation annoncées dans la politique de confidentialité sont
 * appliquées ici, au plus une fois par SWEEP_INTERVAL_MS par processus.
 *
 * Durées (doivent rester alignées avec docs/legal/x/confidentialite.md §7) :
 * - IpSeenLog / SitePresence : 6 mois après la dernière activité ;
 * - ChatMessage / NameModerationAttempt : 12 mois ;
 * - DailyVisitor (mesure d'audience) : 13 mois ;
 * - comptes INVITÉS (isGuest, scan de QR) : 48 h après la dernière activité —
 *   ils sont pensés pour une soirée, et la purge libère leurs pseudos.
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const SIX_MONTHS_MS = 6 * MONTH_MS
const TWELVE_MONTHS_MS = 12 * MONTH_MS
const THIRTEEN_MONTHS_MS = 13 * MONTH_MS
const GUEST_TTL_MS = 48 * 60 * 60 * 1000

let lastSweepAt = 0

function dateStringParis(msAgo: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - msAgo))
}

export async function runRetentionSweep(): Promise<void> {
  const now = Date.now()
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now

  const sixMonthsAgo = new Date(now - SIX_MONTHS_MS)
  const twelveMonthsAgo = new Date(now - TWELVE_MONTHS_MS)
  const dailyVisitorCutoff = dateStringParis(THIRTEEN_MONTHS_MS)

  try {
    await Promise.all([
      // $executeRaw : IpSeenLog est manipulé en SQL brut partout ailleurs
      // (voir ip-history-server.ts) et ses dates sont stockées en ISO string.
      prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "lastSeen" < ${sixMonthsAgo.toISOString()}`,
      prisma.sitePresence.deleteMany({ where: { lastSeen: { lt: sixMonthsAgo } } }),
      prisma.chatMessage.deleteMany({ where: { createdAt: { lt: twelveMonthsAgo } } }),
      prisma.nameModerationAttempt.deleteMany({ where: { createdAt: { lt: twelveMonthsAgo } } }),
      prisma.dailyVisitor.deleteMany({ where: { date: { lt: dailyVisitorCutoff } } }),
    ])

    // Invités inactifs : suppression via la routine complète (mêmes garanties
    // que la suppression de compte), par petits lots pour rester léger.
    const guestCutoff = new Date(now - GUEST_TTL_MS)
    const staleGuests = await prisma.user.findMany({
      where: {
        isGuest: true,
        OR: [
          { lastSeenAt: { lt: guestCutoff } },
          { lastSeenAt: null, createdAt: { lt: guestCutoff } },
        ],
      },
      select: { id: true },
      take: 50,
    })
    for (const guest of staleGuests) {
      await deleteUserAccount(guest.id)
    }
  } catch (error) {
    console.error('retention sweep error:', error)
  }
}
