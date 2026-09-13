import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { accountKind, type AccountKind } from '@/lib/account-kind'
import { parisDayString } from '@/lib/paris-time'
import { GUEST_INACTIVITY_DAYS, ORPHAN_GUEST_INACTIVITY_DAYS } from '@/lib/retention-sweep'

/**
 * Helpers SERVEUR du type de compte (le calcul lui-même vit dans
 * account-kind.ts, importable côté client). Une seule définition pour la
 * liste des comptes, la fiche, la tuile « Comptes », la répartition par rôle
 * et la recherche par IP : ces cinq écrans comptaient chacun à leur façon
 * (15 comptes ici, 22 là, 28 en réalité).
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Types filtrables : tous sauf legacy, exclu du périmètre. */
export type ListedAccountKind = Exclude<AccountKind, 'legacy'>

export const LISTED_ACCOUNT_KINDS: readonly ListedAccountKind[] = [
  'password',
  'google',
  'guest',
  'guest_orphan',
]

/**
 * Compte « non legacy » : un email (mot de passe ou Google) OU un invité.
 * Legacy = ni l'un ni l'autre (0 en production) : hors de toutes les listes et
 * de tous les totaux. À combiner par AND — jamais à fusionner dans un objet qui
 * porte déjà son propre OR.
 */
export const NON_LEGACY_ACCOUNT_WHERE: Prisma.UserWhereInput = {
  OR: [{ email: { not: null } }, { isGuest: true }],
}

/**
 * Sessions VALIDES d'un compte, la plus lointaine d'abord, une seule ligne :
 * assez pour savoir s'il en reste une et jusqu'à quand. Relation filtrée dans
 * le select : Prisma la charge en une requête pour toute la page (IN), pas une
 * par compte. Les lignes échues restent en base jusqu'au balayage : les
 * compter faisait croire à une connexion active.
 */
export function validSessionsSelect(now: Date) {
  return {
    where: { expiresAt: { gt: now } },
    orderBy: { expiresAt: 'desc' },
    take: 1,
    select: { expiresAt: true },
  } as const satisfies Prisma.User$sessionsArgs
}

/** Champs à sélectionner pour déduire le type (voir kindOfAccount). */
export function accountKindSelect(now: Date) {
  return {
    isGuest: true,
    email: true,
    passwordHash: true,
    sessions: validSessionsSelect(now),
  } as const satisfies Prisma.UserSelect
}

/**
 * Champs à sélectionner pour la description complète (voir describeAccount) :
 * le type, plus de quoi dater la suppression automatique d'un invité.
 */
export function accountDescriptionSelect(now: Date) {
  return {
    ...accountKindSelect(now),
    lastSeenAt: true,
    createdAt: true,
    banType: true,
    abuseReportsReceived: { where: { status: 'open' }, take: 1, select: { id: true } },
  } as const satisfies Prisma.UserSelect
}

type KindSource = {
  isGuest: boolean
  email: string | null
  passwordHash: string
  /** Sessions déjà filtrées par validSessionsSelect. */
  sessions: Array<{ expiresAt: Date }>
}

/** Type d'un compte lu avec accountKindSelect. Jamais le hash lui-même. */
export function kindOfAccount(user: KindSource): AccountKind {
  return accountKind({
    isGuest: user.isGuest,
    email: user.email,
    hasPassword: user.passwordHash !== '',
    hasValidSession: user.sessions.length > 0,
  })
}

/**
 * Date AU PLUS TÔT de la suppression automatique d'un invité, alignée sur les
 * deux purges de retention-sweep.ts (null pour un compte ordinaire) :
 * - purge des orphelins : ORPHAN_GUEST_INACTIVITY_DAYS après la dernière
 *   activité, une fois la dernière session échue — sauf invité banni ou visé
 *   par un signalement ouvert, exclus de cette purge ;
 * - purge ordinaire : GUEST_INACTIVITY_DAYS après la dernière activité, elle
 *   aussi seulement sans session valide.
 * D'où le plancher « échéance de la session » : un invité dont la session
 * court encore n'est jamais supprimé avant, et une session créée à 30 jours
 * fixes (avant les sessions glissantes) le fait partir bien avant les 90 jours
 * si le joueur ne revient pas. Le balayage passe au fil du trafic : la
 * suppression réelle peut suivre de quelques heures.
 */
export function computeGuestPurgeAt(a: {
  isGuest: boolean
  lastSeenAt: Date | null
  createdAt: Date
  sessionExpiresAt: Date | null
  banType: string | null
  hasOpenReport: boolean
}): Date | null {
  if (!a.isGuest) return null
  const lastActivity = (a.lastSeenAt ?? a.createdAt).getTime()
  const orphanPurgeApplies = a.banType === null && !a.hasOpenReport
  const days = orphanPurgeApplies ? ORPHAN_GUEST_INACTIVITY_DAYS : GUEST_INACTIVITY_DAYS
  return new Date(Math.max(lastActivity + days * DAY_MS, a.sessionExpiresAt?.getTime() ?? 0))
}

export type AccountDescription = {
  kind: AccountKind
  isGuest: boolean
  hasValidSession: boolean
  /** Jour de Paris (AAAA-MM-JJ) de l'échéance de la session valide la plus lointaine, sinon null. */
  sessionExpiresAt: string | null
  /** Invité seulement : jour de Paris (AAAA-MM-JJ) de la suppression automatique au plus tôt. */
  guestPurgeAt: string | null
}

/**
 * Échéance de session servie au staff, au JOUR près. Avec les sessions
 * glissantes, l'échéance vaut « première requête d'une visite + durée » à la
 * milliseconde : servie telle quelle à un modérateur, elle redonnerait l'heure
 * exacte d'une visite, que le plan réserve aux admins. Le jour suffit pour
 * dire si la connexion vit encore. Même arrondi pour la date de purge d'un
 * invité, qui vaut cette échéance tant que la session court.
 */
export function sessionExpiryDay(user: Pick<KindSource, 'sessions'>): string | null {
  const expiresAt = user.sessions[0]?.expiresAt
  return expiresAt ? parisDayString(expiresAt) : null
}

/** Description d'un compte lu avec accountDescriptionSelect. */
export function describeAccount(
  user: KindSource & {
    lastSeenAt: Date | null
    createdAt: Date
    banType: string | null
    abuseReportsReceived: Array<{ id: string }>
  }
): AccountDescription {
  const sessionExpiresAt = user.sessions[0]?.expiresAt ?? null
  const purgeAt = computeGuestPurgeAt({
    isGuest: user.isGuest,
    lastSeenAt: user.lastSeenAt,
    createdAt: user.createdAt,
    sessionExpiresAt,
    banType: user.banType,
    hasOpenReport: user.abuseReportsReceived.length > 0,
  })
  return {
    kind: kindOfAccount(user),
    isGuest: user.isGuest,
    hasValidSession: sessionExpiresAt !== null,
    sessionExpiresAt: sessionExpiryDay(user),
    guestPurgeAt: purgeAt ? parisDayString(purgeAt) : null,
  }
}

/**
 * Prédicat Prisma d'un type, autonome (il porte sa propre condition « non
 * legacy ») : même partition que accountKind, dans le même ordre de tests.
 */
export function accountKindWhere(kind: ListedAccountKind, now: Date): Prisma.UserWhereInput {
  switch (kind) {
    case 'password':
      return { isGuest: false, email: { not: null }, passwordHash: { not: '' } }
    case 'google':
      return { isGuest: false, email: { not: null }, passwordHash: '' }
    case 'guest':
      return { isGuest: true, sessions: { some: { expiresAt: { gt: now } } } }
    case 'guest_orphan':
      return { isGuest: true, sessions: { none: { expiresAt: { gt: now } } } }
  }
}

export type AccountKindCounts = {
  total: number
  password: number
  google: number
  guest: number
  guestOrphan: number
}

/**
 * Décompte UNIQUE des comptes par type, sans aucun filtre d'écran. Les quatre
 * types partitionnent les comptes non legacy : le total est leur somme.
 */
export async function countAccountsByKind(now: Date = new Date()): Promise<AccountKindCounts> {
  const [password, google, guest, guestOrphan] = await Promise.all(
    LISTED_ACCOUNT_KINDS.map((kind) => prisma.user.count({ where: accountKindWhere(kind, now) }))
  )
  return { total: password + google + guest + guestOrphan, password, google, guest, guestOrphan }
}

/**
 * La recherche de comptes ne fouille les adresses IP que si la saisie en a
 * l'allure : un « : » (IPv6), ou uniquement des chiffres et des points avec au
 * moins un point (IPv4, même partielle). Sans cette garde, « ad », « fe » ou
 * « 12 » remontaient tous les comptes dont une IPv6 contient ces caractères.
 */
export function looksLikeIpQuery(query: string): boolean {
  if (query.includes(':')) return true
  return /^[0-9.]+$/.test(query) && query.includes('.')
}

/** Caractère d'échappement des motifs LIKE bruts (`ESCAPE '!'`). */
export const LIKE_ESCAPE_CHAR = '!'

/** Échappe %, _ et le caractère d'échappement pour un LIKE brut. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[!%_]/g, (char) => `${LIKE_ESCAPE_CHAR}${char}`)
}
