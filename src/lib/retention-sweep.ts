import { prisma } from '@/lib/prisma'
import { errorTrace } from '@/lib/error-trace'
import { ANALYTICS_CONSENT_GRANTED } from '@/lib/auth-cookies'
import { deleteUserAccount } from '@/lib/user-activity-server'
import {
  ACCOUNT_DELETE_ANONYMIZED_DETAIL,
  NEUTRAL_ACCOUNT_DELETE_DETAILS,
} from '@/lib/account-kind'

/**
 * Purges RGPD : les durées de conservation annoncées dans la politique de
 * confidentialité sont appliquées ici.
 *
 * Deux chemins, un seul balayage :
 *  - NOMINAL — le planificateur (src/lib/scheduler.ts) appelle ce balayage
 *    chaque nuit à 4 h 30, heure de Paris, avec `force` : c'est la cadence
 *    voulue, au creux du trafic. Les suppressions de comptes ne tombent plus
 *    en pleine soirée du simple fait qu'on a déployé à 21 h ;
 *  - FILET — l'appel depuis /api/analytics/ping, sans `force`, donc au plus
 *    une fois par SWEEP_INTERVAL_MS et par processus. Il ne sert plus que si
 *    le planificateur ne s'est pas posé (ancien conteneur, runtime sans
 *    instrumentation) : les durées annoncées restent tenues sans lui.
 *
 * Durées (doivent rester alignées avec docs/legal/<langue>/confidentialite.md §7) :
 * - IpSeenLog / SitePresence : 6 mois après la dernière activité ;
 * - IpSeenLog `user:<id>` d'un compte qui n'existe plus : aussitôt (la
 *   politique promet que l'historique d'IP part avec le compte) ;
 * - AccountVisit (visites d'un compte consentant : début, durées visible,
 *   active et en partie, appareil) : 6 mois après le DÉBUT de la visite,
 *   comme les autres traces de présence ;
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
 * - UserFeedback (retours « Signaler / Suggérer » et avis de 1re partie :
 *   message, captures, page, navigateur) : 24 mois après leur envoi. La
 *   politique le promettait sans que rien ne l'applique ; l'avis de 1re
 *   partie ajoute une ligne par nouveau joueur, anonymes compris ;
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
 *   (filet de la migration 20260912100000_anonymize_account_delete_log) ;
 * - données de l'ancien accord '1' aux statistiques (filet de la migration
 *   20260912130100_legacy_consent_cleanup) : présences non liées et pseudos
 *   locaux écrits hors accord courant, historique IP `visitor:` sans présence
 *   consentie, ancien cumul totalPresenceSeconds.
 *
 * Chaque bloc est indépendant : l'échec de l'un (table verrouillée, compte
 * impossible à supprimer…) est journalisé sans empêcher les autres de passer.
 * Chaque passage laisse un témoin (RETENTION_LAST_RUN_KEY) lu par la
 * Supervision : un échec qui se répète ne reste pas enfoui dans les journaux.
 */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000

/**
 * Témoin du dernier passage, dans SiteSetting (clé/valeur, sans migration) :
 * de quoi PROUVER que les durées annoncées sont tenues, et voir un bloc qui
 * échoue à chaque passage — allSettled ne fait que journaliser. Réécrit à
 * chaque passage, donc au plus une écriture toutes les 6 h par processus.
 */
export const RETENTION_LAST_RUN_KEY = 'retention.lastRun'

/**
 * Contenu du témoin. Aucune donnée personnelle : des noms de blocs (tables et
 * purges, jamais un identifiant de compte) et des volumes.
 */
export type RetentionLastRun = {
  /** Début du passage (ISO) : l'instant d'où partent toutes les échéances. */
  at: string
  /** Vrai quand aucun bloc n'a échoué. */
  ok: boolean
  /**
   * Lignes supprimées ou mises à jour par bloc abouti ; comptes supprimés pour
   * les blocs d'invités (User.orphanGuests, User.staleGuests), où un bloc peut
   * aussi figurer dans `failed` si un compte a résisté.
   */
  counts: Record<string, number>
  /** Blocs en échec ; l'erreur elle-même est dans les journaux du conteneur. */
  failed: string[]
}

/**
 * Lecture TOLÉRANTE du témoin : absent, JSON illisible ou sans date → null ;
 * volumes qui ne sont pas des entiers positifs et noms de blocs qui ne sont
 * pas des chaînes ignorés. Un témoin abîmé ne doit jamais faire échouer la vue
 * d'ensemble. Pure.
 */
export function parseRetentionLastRun(value: string | null | undefined): RetentionLastRun | null {
  if (!value) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const raw = parsed as Record<string, unknown>
  if (typeof raw.at !== 'string' || Number.isNaN(Date.parse(raw.at))) return null

  const counts: Record<string, number> = {}
  if (raw.counts && typeof raw.counts === 'object' && !Array.isArray(raw.counts)) {
    for (const [block, rows] of Object.entries(raw.counts)) {
      if (typeof rows === 'number' && Number.isInteger(rows) && rows >= 0) counts[block] = rows
    }
  }
  const failed = Array.isArray(raw.failed)
    ? raw.failed.filter((block): block is string => typeof block === 'string')
    : []
  // Un `ok` absent se déduit des échecs ; jamais « tout va bien » avec des échecs listés.
  const ok = (typeof raw.ok === 'boolean' ? raw.ok : true) && failed.length === 0
  return { at: raw.at, ok, counts, failed }
}

/**
 * Présence écrite hors de l'accord courant : NULL (ancien '1', ou ancien
 * conteneur qui ignore la colonne) ou version dépassée. Le OR sur null est
 * nécessaire : un `not` seul exclut les lignes NULL.
 */
const OUTDATED_CONSENT_PRESENCE = {
  OR: [{ consentVersion: null }, { consentVersion: { not: ANALYTICS_CONSENT_GRANTED } }],
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30 * DAY_MS
const SIX_MONTHS_MS = 6 * MONTH_MS
const TWELVE_MONTHS_MS = 12 * MONTH_MS
const THIRTEEN_MONTHS_MS = 13 * MONTH_MS
const TWENTY_FOUR_MONTHS_MS = 24 * MONTH_MS
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

/** Noms des blocs de suppression de comptes dans le témoin. */
const ORPHAN_GUESTS_BLOCK = 'User.orphanGuests'
const STALE_GUESTS_BLOCK = 'User.staleGuests'
/** Échec avant même le lancement des purges simples (voir le filet plus bas). */
const SIMPLE_PURGES_BLOCK = 'purges'

/**
 * Lignes touchées par une purge : `{ count }` pour deleteMany / updateMany,
 * un nombre pour $executeRaw.
 */
function affectedRows(result: unknown): number {
  if (typeof result === 'number') return result
  if (typeof result === 'bigint') return Number(result)
  if (result && typeof result === 'object' && 'count' in result && typeof result.count === 'number') {
    return result.count
  }
  return 0
}

/**
 * Dernier passage du FILET (l'appel sans `force` depuis /api/analytics/ping).
 *
 * Initialisé à `Date.now()` et non à 0 : à 0, le tout premier ping suivant un
 * déploiement passait la garde des 6 h et déclenchait un balayage complet
 * IMMÉDIATEMENT, à l'heure du déploiement — c'est-à-dire, en pratique, au
 * premier visiteur d'une soirée. Tout l'objet du passage au planificateur
 * (4 h 30, heure de Paris) était perdu : jusqu'à 100 suppressions de comptes
 * retombaient dans le pic d'usage, au premier visiteur venu.
 *
 * Variable de module, donc remise à l'heure de démarrage à CHAQUE processus :
 * le filet ne peut se déclencher qu'après 6 h de fonctionnement continu, ce
 * qui laisse au planificateur son tour de la nuit. Le chemin `force: true` du
 * planificateur, lui, ignore cette garde et n'est pas concerné.
 */
let lastSweepAt = Date.now()

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
 * jamais le pseudo — et dans les journaux du conteneur seulement, jamais dans
 * le témoin, qui ne reçoit que les deux compteurs renvoyés.
 */
async function deleteAccounts(
  label: string,
  ids: string[]
): Promise<{ deleted: number; failures: number }> {
  let deleted = 0
  let failures = 0
  for (const id of ids) {
    try {
      await deleteUserAccount(id)
      deleted += 1
    } catch (error) {
      failures += 1
      console.error(`retention sweep error (${label}, user ${id}):`, errorTrace(error))
    }
  }
  return { deleted, failures }
}

/**
 * Options du balayage.
 * `force` : passer outre la garde des 6 h. Réservé au planificateur, qui a
 * déjà sa propre cadence (une fois par nuit) — sans quoi un redéploiement en
 * soirée, suivi d'un ping, lui ferait sauter son tour de la nuit suivante.
 */
export type RetentionSweepOptions = { force?: boolean }

export async function runRetentionSweep({ force = false }: RetentionSweepOptions = {}): Promise<void> {
  const now = Date.now()
  if (!force && now - lastSweepAt < SWEEP_INTERVAL_MS) return
  // Le témoin est repoussé même quand `force` a court-circuité la garde : le
  // filet du ping n'a aucune raison de refaire le travail dans les 6 h.
  lastSweepAt = now

  const nowDate = new Date(now)
  const sixMonthsAgo = new Date(now - SIX_MONTHS_MS)
  const twelveMonthsAgo = new Date(now - TWELVE_MONTHS_MS)
  const twentyFourMonthsAgo = new Date(now - TWENTY_FOUR_MONTHS_MS)
  const dailyVisitorCutoff = dateStringParis(THIRTEEN_MONTHS_MS)

  // Témoin du passage (RetentionLastRun), rempli bloc par bloc.
  const counts: Record<string, number> = {}
  const failed: string[] = []

  try {
    // Purges simples : allSettled plutôt que Promise.all, pour qu'une table en
    // échec n'empêche ni les autres purges de ce bloc ni les suppressions de
    // comptes plus bas.
    const purges: Array<[string, PromiseLike<unknown>]> = [
      // $executeRaw : IpSeenLog est manipulé en SQL brut partout ailleurs
      // (voir ip-history-server.ts) et ses dates sont stockées en ISO string.
      ['IpSeenLog', prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "lastSeen" < ${sixMonthsAgo.toISOString()}`],
      // Historique IP de comptes qui n'existent plus. deleteUserAccount efface
      // `user:<id>` avec le compte, mais seulement depuis le déploiement du
      // 10/09/2026 : les suppressions d'avant (invités purgés à 48 h surtout)
      // en ont laissé — au moins 21 sujets en production, que rien n'affiche
      // et qui ne partaient qu'à 6 mois. Filet permanent : la table n'a pas de
      // clé étrangère vers User, et un compte supprimé entre l'écriture de sa
      // présence et celle de son IP (recordAccountPresence) en laisserait une.
      // Aucune date comparée : le format des colonnes (ISO ici, millisecondes
      // ailleurs) n'entre pas en jeu. `substr(…, 6)` retire le préfixe « user: »
      // (5 caractères) ; User.id n'est jamais NULL, donc pas de piège NOT IN.
      [
        'IpSeenLog.orphanUser',
        prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "subjectKey" LIKE 'user:%' AND substr("subjectKey", 6) NOT IN (SELECT "id" FROM "User")`,
      ],
      ['SitePresence', prisma.sitePresence.deleteMany({ where: { lastSeen: { lt: sixMonthsAgo } } })],
      // Visites des comptes : bornées sur leur début (index startedAt). Client
      // Prisma, donc dates en millisecondes sans piège de format — jamais le
      // SQL brut en chaînes ISO d'IpSeenLog ci-dessus.
      ['AccountVisit', prisma.accountVisit.deleteMany({ where: { startedAt: { lt: sixMonthsAgo } } })],
      ['ChatMessage', prisma.chatMessage.deleteMany({ where: { createdAt: { lt: twelveMonthsAgo } } })],
      [
        'NameModerationAttempt',
        prisma.nameModerationAttempt.deleteMany({ where: { createdAt: { lt: twelveMonthsAgo } } }),
      ],
      ['DailyVisitor', prisma.dailyVisitor.deleteMany({ where: { date: { lt: dailyVisitorCutoff } } })],
      // Retours et avis de 1re partie : 24 mois après l'envoi, quel que soit
      // leur statut — un retour « ouvert » depuis deux ans ne sera plus traité.
      ['UserFeedback', prisma.userFeedback.deleteMany({ where: { createdAt: { lt: twentyFourMonthsAgo } } })],
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
      // Filets idempotents de la migration de l'ancien accord '1', pour la
      // même raison : entre `migrate deploy` et le remplacement du conteneur
      // (ou après un retour arrière), l'ancien code prend encore '1' pour un
      // accord et réécrit présences, pseudos locaux, historique IP visiteur et
      // cumul de présence. Le nouveau code n'écrit jamais rien de tout cela
      // hors accord courant : une fois nettoyée, une ligne ne correspond plus.
      [
        'SitePresence.legacy',
        prisma.sitePresence.deleteMany({ where: { userId: null, ...OUTDATED_CONSENT_PRESENCE } }),
      ],
      [
        'SitePresence.legacyNames',
        prisma.sitePresence.updateMany({
          where: {
            AND: [
              OUTDATED_CONSENT_PRESENCE,
              { OR: [{ localPlayerNames: { not: null } }, { localPlayerCount: { not: 0 } }] },
            ],
          },
          data: { localPlayerNames: null, localPlayerCount: 0 },
        }),
      ],
      // Un navigateur consentant a toujours sa présence (écrite avant son
      // historique IP, effacée avec lui) : une ligne `visitor:` sans présence à
      // l'accord courant n'a pas de base, et plus aucun refus ne la désigne.
      // `substr(…, 9)` retire le préfixe « visitor: » (8 caractères).
      [
        'IpSeenLog.legacyVisitor',
        prisma.$executeRaw`DELETE FROM "IpSeenLog" WHERE "subjectKey" LIKE 'visitor:%' AND substr("subjectKey", 9) NOT IN (SELECT "visitorId" FROM "SitePresence" WHERE "consentVersion" = ${ANALYTICS_CONSENT_GRANTED})`,
      ],
      [
        'User.totalPresenceSeconds',
        prisma.user.updateMany({
          where: { totalPresenceSeconds: { gt: 0 } },
          data: { totalPresenceSeconds: 0 },
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
      const block = purges[index][0]
      if (result.status === 'rejected') {
        failed.push(block)
        console.error(`retention sweep error (${block}):`, errorTrace(result.reason))
      } else {
        counts[block] = affectedRows(result.value)
      }
    })
  } catch (error) {
    // Filet : une purge qui lèverait avant même d'être lancée ne doit pas
    // remonter en rejet non géré (appel sans await depuis le ping).
    failed.push(SIMPLE_PURGES_BLOCK)
    console.error('retention sweep error:', errorTrace(error))
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
    const { deleted, failures } = await deleteAccounts('orphan guests', orphanGuests.map((guest) => guest.id))
    counts[ORPHAN_GUESTS_BLOCK] = deleted
    if (failures > 0) failed.push(ORPHAN_GUESTS_BLOCK)
  } catch (error) {
    failed.push(ORPHAN_GUESTS_BLOCK)
    console.error('retention sweep error (orphan guests):', errorTrace(error))
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
    const { deleted, failures } = await deleteAccounts('stale guests', staleGuests.map((guest) => guest.id))
    counts[STALE_GUESTS_BLOCK] = deleted
    if (failures > 0) failed.push(STALE_GUESTS_BLOCK)
  } catch (error) {
    failed.push(STALE_GUESTS_BLOCK)
    console.error('retention sweep error (stale guests):', errorTrace(error))
  }

  // Témoin écrit en dernier, que les blocs aient abouti ou non : c'est
  // justement un échec qu'il doit rendre visible. Son propre échec ne fait
  // que se journaliser (appel sans await depuis le ping).
  const lastRun: RetentionLastRun = { at: nowDate.toISOString(), ok: failed.length === 0, counts, failed }
  try {
    const value = JSON.stringify(lastRun)
    await prisma.siteSetting.upsert({
      where: { key: RETENTION_LAST_RUN_KEY },
      create: { key: RETENTION_LAST_RUN_KEY, value },
      update: { value },
    })
  } catch (error) {
    console.error('retention sweep error (lastRun):', errorTrace(error))
  }
}
