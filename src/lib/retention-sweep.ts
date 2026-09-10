import { prisma } from '@/lib/prisma'
import { deleteUserAccount } from '@/lib/user-activity-server'

/**
 * Purges RGPD « au passage » : le projet n'a aucun cron serveur (tout est
 * déclenché par le trafic, même principe que cleanupAbandonedRooms), donc les
 * durées de conservation annoncées dans la politique de confidentialité sont
 * appliquées ici, au plus une fois par SWEEP_INTERVAL_MS par processus.
 *
 * Durées (doivent rester alignées avec docs/legal/<langue>/confidentialite.md §7) :
 * - IpSeenLog / SitePresence : 6 mois après la dernière activité ;
 * - User.lastIp / User.lastCountry : effacés après 6 mois d'inactivité du
 *   compte (le compte lui-même est conservé — seule la trace technique part) ;
 * - ChatMessage / NameModerationAttempt : 12 mois ;
 * - OnlineGameSession (journal des parties lancées) : 12 mois, comme les
 *   autres traces d'exploitation. La durée se défend : ce journal sert à
 *   comprendre l'usage d'une SAISON de jeu (comparer une rentrée à la
 *   précédente, retrouver le contexte d'un signalement de plusieurs mois),
 *   pas à constituer un historique de vie. Il ne porte d'ailleurs aucun
 *   pseudo recopié — juste une référence de compte qui tombe à null dès la
 *   suppression dudit compte. Les participants partent en cascade ;
 * - DailyVisitor (mesure d'audience) : 13 mois ;
 * - comptes INVITÉS (isGuest, scan de QR) : 90 jours après la dernière
 *   activité (voir GUEST_INACTIVITY_DAYS ci-dessous).
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

const MONTH_MS = 30 * 24 * 60 * 60 * 1000
const SIX_MONTHS_MS = 6 * MONTH_MS
const TWELVE_MONTHS_MS = 12 * MONTH_MS
const THIRTEEN_MONTHS_MS = 13 * MONTH_MS
/**
 * Durée de vie d'un compte INVITÉ sans activité.
 *
 * C'était 48 h — pensé « pour une soirée ». Mais l'usage réel du site, c'est
 * « le samedi, puis le samedi suivant » : à J+7 le joueur retrouvait un pseudo
 * libre, un niveau 1 et zéro succès, et ses amis avaient perdu le contact.
 * 90 jours (≈ un trimestre) laisse passer une pause d'été, des examens ou un
 * déménagement sans rien perdre, tout en restant une durée courte et
 * défendable : un compte invité ne porte ni email ni mot de passe, seulement
 * un pseudo et une progression de jeu, et il suffit d'une partie pour
 * repousser l'échéance. Le joueur est prévenu sur sa carte de compte
 * (AccountInfo) et peut pérenniser son compte d'un clic.
 *
 * ⚠️ Doit rester aligné avec :
 * - GUEST_INACTIVITY_DAYS dans src/components/ui/AccountInfo.tsx (client :
 *   ce module importe Prisma, il ne peut pas y être importé) ;
 * - docs/legal/<langue>/confidentialite.md §7.
 */
export const GUEST_INACTIVITY_DAYS = 90
const GUEST_TTL_MS = GUEST_INACTIVITY_DAYS * 24 * 60 * 60 * 1000

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
      // Journal des parties : la ligne part avec ses participants (cascade).
      // On borne sur le LANCEMENT, seule date toujours renseignée (`endedAt`
      // reste nul pour une partie que rien n'a jamais close).
      prisma.onlineGameSession.deleteMany({ where: { startedAt: { lt: twelveMonthsAgo } } }),
      // La dernière IP/pays connus d'un compte sont des logs techniques : ils
      // tombent sous les 6 mois annoncés, au même titre qu'IpSeenLog. On ne
      // touche qu'aux comptes silencieux depuis 6 mois (lastSeenAt jamais
      // renseigné : on retient la date de création).
      prisma.user.updateMany({
        where: {
          AND: [
            { OR: [{ lastIp: { not: null } }, { lastCountry: { not: null } }] },
            {
              OR: [
                { lastSeenAt: { lt: sixMonthsAgo } },
                { lastSeenAt: null, createdAt: { lt: sixMonthsAgo } },
              ],
            },
          ],
        },
        data: { lastIp: null, lastCountry: null },
      }),
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
