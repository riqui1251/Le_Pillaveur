import { prisma } from '@/lib/prisma'
import { deleteUserAccount } from '@/lib/user-activity-server'
import {
  ACCOUNT_DELETE_ANONYMIZED_DETAIL,
  NEUTRAL_ACCOUNT_DELETE_DETAILS,
} from '@/lib/account-kind'

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
 * - Session : la ligne part dès son échéance (jusqu'ici, seule la lecture du
 *   cookie correspondant l'effaçait — une session jamais représentée restait
 *   en base indéfiniment) ;
 * - comptes INVITÉS (isGuest : pseudo saisi pour rejoindre une table par son
 *   code ou son QR, ou pour « Essayer avec des bots ») : 90 jours après la
 *   dernière activité (voir GUEST_INACTIVITY_DAYS ci-dessous) ;
 * - comptes INVITÉS ORPHELINS (plus aucune session valide) : 7 jours après la
 *   dernière activité (voir ORPHAN_GUEST_INACTIVITY_DAYS ci-dessous) ;
 * - journal du staff, suppressions de compte ('account-delete') : aucune
 *   purge, mais tout détail hors du format neutre `type:rôle` est anonymisé
 *   (filet de la migration 20260912100000_anonymize_account_delete_log).
 *
 * Chaque bloc est indépendant : l'échec de l'un (table verrouillée, compte
 * impossible à supprimer…) est journalisé sans empêcher les autres de passer.
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30 * DAY_MS
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
 * - GUEST_SESSION_DAYS dans src/lib/auth-server.ts (cette durée + 1 jour) ;
 * - GUEST_INACTIVITY_DAYS dans src/components/ui/AccountInfo.tsx (client :
 *   ce module importe Prisma, il ne peut pas y être importé) ;
 * - docs/legal/<langue>/confidentialite.md §7.
 */
export const GUEST_INACTIVITY_DAYS = 90
const GUEST_TTL_MS = GUEST_INACTIVITY_DAYS * DAY_MS
/**
 * Durée de conservation d'un invité ORPHELIN : plus aucune session valide.
 *
 * Un invité n'a ni email, ni mot de passe, ni Google : son cookie de session
 * est sa seule clé. Sans session valide en base (déconnexion, connexion à un
 * autre compte dans le même navigateur, expiration, purge de sessions), le
 * compte est irrécupérable — le garder 90 jours ne sert à personne et bloque
 * son pseudo. (Un cookie simplement effacé laisse, lui, la ligne Session
 * valide jusqu'à son échéance : ce compte-là n'est emporté qu'à ce moment.)
 * Le délai de 7 jours,
 * compté depuis la dernière activité, n'est qu'une marge : un compte qui vient
 * de perdre sa session ne disparaît pas dans l'heure, et l'exploitant a le
 * temps de le voir passer.
 *
 * Ne tient que grâce au renouvellement glissant des sessions (auth-server) :
 * sans lui, tout invité perdrait sa session à échéance fixe, puis son compte
 * 7 jours plus tard, même en jouant chaque semaine.
 *
 * Exclus, pour ne rien retirer à la modération :
 * - les invités BANNIS (banType non nul) : le ban supprime leurs sessions
 *   (ban-server.ts), et la suppression emporterait leur historique de
 *   sanctions ; ils suivent la purge ordinaire à 90 jours ;
 * - les invités visés par un signalement OUVERT : le dossier perdrait sa
 *   cible (AbuseReport.reportedUserId en SetNull) avant d'avoir été traité.
 *
 * ⚠️ Doit rester aligné avec docs/legal/<langue>/confidentialite.md §7.
 */
export const ORPHAN_GUEST_INACTIVITY_DAYS = 7
const ORPHAN_GUEST_TTL_MS = ORPHAN_GUEST_INACTIVITY_DAYS * DAY_MS

/** Taille des lots de suppression de comptes, par passage. */
const ACCOUNT_PURGE_BATCH = 50

let lastSweepAt = 0

function dateStringParis(msAgo: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() - msAgo))
}

/**
 * Supprime les comptes par la routine complète (mêmes garanties que la
 * suppression de compte), un par un : un compte récalcitrant ne doit pas
 * bloquer les suivants — sans quoi, revenant en tête de chaque lot, il
 * immobiliserait la purge pour de bon. Seul l'identifiant est journalisé,
 * jamais le pseudo.
 */
async function deleteAccounts(label: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await deleteUserAccount(id)
    } catch (error) {
      console.error(`retention sweep error (${label}, user ${id}):`, error)
    }
  }
}

export async function runRetentionSweep(): Promise<void> {
  const now = Date.now()
  if (now - lastSweepAt < SWEEP_INTERVAL_MS) return
  lastSweepAt = now

  const nowDate = new Date(now)
  const sixMonthsAgo = new Date(now - SIX_MONTHS_MS)
  const twelveMonthsAgo = new Date(now - TWELVE_MONTHS_MS)
  const dailyVisitorCutoff = dateStringParis(THIRTEEN_MONTHS_MS)

  try {
    // Purges simples : allSettled plutôt que Promise.all, pour qu'une table en
    // échec n'empêche ni les autres purges de ce bloc ni les suppressions de
    // comptes plus bas.
    const purges: Array<[string, PromiseLike<unknown>]> = [
      // $executeRaw : IpSeenLog est manipulé en SQL brut partout ailleurs
      // (voir ip-history-server.ts) et ses dates sont stockées en ISO string.
      ['IpSeenLog', prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "lastSeen" < ${sixMonthsAgo.toISOString()}`],
      ['SitePresence', prisma.sitePresence.deleteMany({ where: { lastSeen: { lt: sixMonthsAgo } } })],
      ['ChatMessage', prisma.chatMessage.deleteMany({ where: { createdAt: { lt: twelveMonthsAgo } } })],
      [
        'NameModerationAttempt',
        prisma.nameModerationAttempt.deleteMany({ where: { createdAt: { lt: twelveMonthsAgo } } }),
      ],
      ['DailyVisitor', prisma.dailyVisitor.deleteMany({ where: { date: { lt: dailyVisitorCutoff } } })],
      // Journal des parties : la ligne part avec ses participants (cascade).
      // On borne sur le LANCEMENT, seule date toujours renseignée (`endedAt`
      // reste nul pour une partie que rien n'a jamais close).
      ['OnlineGameSession', prisma.onlineGameSession.deleteMany({ where: { startedAt: { lt: twelveMonthsAgo } } })],
      // Sessions échues : plus aucun cookie ne peut s'en servir
      // (getUserFromSessionToken les refuse), elles ne font que fausser le
      // compteur de sessions d'une fiche. Client Prisma, donc comparaison de
      // DateTime sans piège de format.
      ['Session', prisma.session.deleteMany({ where: { expiresAt: { lt: nowDate } } })],
      // Filet idempotent de la migration d'anonymisation : pendant un
      // déploiement, l'ancien conteneur tourne encore APRÈS `migrate deploy`
      // (et un retour arrière le relance) ; une suppression faite par le staff
      // dans cet intervalle réécrirait « pseudo (code) — email » dans une
      // table jamais purgée. Tout détail hors du format neutre est ramené à la
      // forme anonymisée — une fois fait, la ligne ne correspond plus.
      [
        'AccountBanEvent.account-delete',
        prisma.accountBanEvent.updateMany({
          where: {
            action: 'account-delete',
            NOT: { comment: { in: [...NEUTRAL_ACCOUNT_DELETE_DETAILS] } },
          },
          data: { comment: ACCOUNT_DELETE_ANONYMIZED_DETAIL },
        }),
      ],
      // La dernière IP/pays connus d'un compte sont des logs techniques : ils
      // tombent sous les 6 mois annoncés, au même titre qu'IpSeenLog. On ne
      // touche qu'aux comptes silencieux depuis 6 mois (lastSeenAt jamais
      // renseigné : on retient la date de création).
      [
        'User.lastIp',
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
      ],
    ]
    const results = await Promise.allSettled(purges.map(([, purge]) => purge))
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`retention sweep error (${purges[index][0]}):`, result.reason)
      }
    })
  } catch (error) {
    // Filet : une purge qui lèverait avant même d'être lancée ne doit pas
    // remonter en rejet non géré (appel sans await depuis le ping).
    console.error('retention sweep error:', error)
  }

  // Invités orphelins : aucune session valide, donc irrécupérables. Try à
  // part : un échec ici ne doit pas priver la purge à 90 jours de son tour.
  try {
    const orphanCutoff = new Date(now - ORPHAN_GUEST_TTL_MS)
    const orphanGuests = await prisma.user.findMany({
      where: {
        isGuest: true,
        banType: null,
        sessions: { none: { expiresAt: { gt: nowDate } } },
        abuseReportsReceived: { none: { status: 'open' } },
        OR: [
          { lastSeenAt: { lt: orphanCutoff } },
          { lastSeenAt: null, createdAt: { lt: orphanCutoff } },
        ],
      },
      select: { id: true },
      take: ACCOUNT_PURGE_BATCH,
    })
    await deleteAccounts('orphan guests', orphanGuests.map((guest) => guest.id))
  } catch (error) {
    console.error('retention sweep error (orphan guests):', error)
  }

  // Invités inactifs : suppression via la routine complète, par petits lots
  // pour rester léger. Lancée APRÈS les orphelins (et non en parallèle) : un
  // même compte peut remplir les deux critères, il ne doit être supprimé
  // qu'une fois.
  // Jamais un invité qui a encore une session valide : /api/auth/me prolonge
  // la session sans toucher lastSeenAt (écrit par le ping), donc un joueur
  // dont le ping est bloqué garderait une session vivante sur un lastSeenAt
  // figé. Un invité vraiment inactif perd sa session 90 à 91 jours après sa
  // dernière visite (GUEST_SESSION_DAYS) : il passe alors par ce bloc ou par
  // celui des orphelins, sans que la durée annoncée change.
  try {
    const guestCutoff = new Date(now - GUEST_TTL_MS)
    const staleGuests = await prisma.user.findMany({
      where: {
        isGuest: true,
        sessions: { none: { expiresAt: { gt: nowDate } } },
        OR: [
          { lastSeenAt: { lt: guestCutoff } },
          { lastSeenAt: null, createdAt: { lt: guestCutoff } },
        ],
      },
      select: { id: true },
      take: ACCOUNT_PURGE_BATCH,
    })
    await deleteAccounts('stale guests', staleGuests.map((guest) => guest.id))
  } catch (error) {
    console.error('retention sweep error (stale guests):', error)
  }
}
