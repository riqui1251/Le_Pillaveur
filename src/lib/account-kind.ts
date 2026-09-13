/**
 * TYPE DE COMPTE, calculé à la lecture — module PUR, importable côté client
 * (aucun import serveur). La supervision ne savait pas répondre à « quel genre
 * de compte est-ce ? » : un invité s'affichait « Joueur », et le seul indice
 * (`passwordHash` vide) classait un invité parmi les comptes Google.
 *
 * Aucune donnée nouvelle : tout se déduit de colonnes existantes. « Ex-invité »
 * (compte pérennisé) n'est pas reconnaissable sans une date de pérennisation
 * que le modèle ne garde pas : on n'invente rien.
 */

import { normalizeRole, USER_ROLES, type UserRole } from '@/lib/roles'
import { parisDayString } from '@/lib/paris-time'

export type AccountKind = 'password' | 'google' | 'guest' | 'guest_orphan' | 'legacy'

const ACCOUNT_KINDS: readonly AccountKind[] = ['password', 'google', 'guest', 'guest_orphan', 'legacy']

/**
 * Ordre des tests IMPOSÉ : `isGuest` d'abord (un invité n'a pas de mot de
 * passe, il serait sinon pris pour un compte Google), puis l'email (sans lui,
 * hors invité, c'est un compte legacy), puis le mot de passe (un compte Google
 * qui a réinitialisé son mot de passe devient « mot de passe »). Même partition
 * que les prédicats Prisma d'account-kind-server (accountKindWhere,
 * NON_LEGACY_ACCOUNT_WHERE) : un compte sans email ni drapeau invité reste
 * legacy même s'il porte un hash, sinon l'analyse d'IP le badgerait « Mot de
 * passe » alors que la liste, les totaux et la fiche l'excluent.
 * Legacy : ni email, ni invité (0 en production).
 *
 * Invité ORPHELIN : plus aucune session valide en base. Son cookie était sa
 * seule clé : le compte est irrécupérable, et la purge l'emporte sous 7 jours
 * (retention-sweep.ts).
 */
export function accountKind(a: {
  isGuest: boolean
  email: string | null
  hasPassword: boolean
  hasValidSession: boolean
}): AccountKind {
  if (a.isGuest) return a.hasValidSession ? 'guest' : 'guest_orphan'
  if (a.email == null) return 'legacy'
  return a.hasPassword ? 'password' : 'google'
}

/**
 * Au-delà de ce délai sans activité, un invité dont la session est ENCORE
 * valide en base est probablement perdu : un invité joue depuis l'appareil où
 * son compte a été créé, et chaque visite le fait « vivre ». La ligne Session
 * ne dit rien du cookie — effacé, navigation privée, autre navigateur —, que
 * le serveur ne peut pas voir. Même valeur que ORPHAN_GUEST_INACTIVITY_DAYS
 * (retention-sweep.ts, non importable ici : ce module-là charge Prisma).
 */
export const GUEST_STALE_DAYS = 7

/**
 * Durée d'une session d'invité, recopiée de GUEST_SESSION_DAYS
 * (auth-server.ts, non importable ici : ce module-là charge Prisma et les
 * cookies). Un test vérifie l'égalité.
 */
export const GUEST_SESSION_DAYS_CLIENT = 91

const DAY_MS = 24 * 60 * 60 * 1000

type GuestActivitySource = {
  lastSeenAt: string | null
  createdAt: string
  /** Échéance de la session valide (jour AAAA-MM-JJ ou ISO), si connue. */
  sessionExpiresAt?: string | null
}

/**
 * Dernière preuve d'usage d'un invité (ms epoch), null si aucune date n'est
 * lisible : la plus récente de lastSeenAt (écrit par le ping, à défaut la
 * création) et du dernier RENOUVELLEMENT de sa session. /api/auth/me prolonge
 * la session à chaque chargement sans toucher lastSeenAt, si bien qu'un joueur
 * dont le ping est bloqué (bloqueur de pub) garde un lastSeenAt figé. La
 * session n'étant prolongée que sous (durée − 1 jour) restant, son échéance
 * moins GUEST_SESSION_DAYS_CLIENT date ce renouvellement. L'échéance est
 * servie au JOUR près (AAAA-MM-JJ, jour de Paris) : on retient la fin de ce
 * jour, pour ne jamais vieillir à tort un joueur venu la veille.
 */
export function guestLastActivityAt(a: GuestActivitySource): number | null {
  const lastSeen = Date.parse(a.lastSeenAt ?? a.createdAt)
  const expiresAt = a.sessionExpiresAt ? Date.parse(a.sessionExpiresAt) : Number.NaN
  const lastRenewal = expiresAt + DAY_MS - GUEST_SESSION_DAYS_CLIENT * DAY_MS
  const candidates = [lastSeen, lastRenewal].filter(Number.isFinite)
  return candidates.length > 0 ? Math.max(...candidates) : null
}

/**
 * Vrai pour un invité (session valide) sans activité depuis plus de
 * GUEST_STALE_DAYS jours (voir guestLastActivityAt) : l'écran doit alors dire
 * « session en base valide jusqu'au … (le cookie a pu être perdu) », jamais
 * « Connexion active ». Dates telles que servies par les routes
 * d'administration.
 */
export function isGuestProbablyLost(
  a: GuestActivitySource & { kind: AccountKind },
  now: number = Date.now()
): boolean {
  if (a.kind !== 'guest') return false
  const lastActivity = guestLastActivityAt(a)
  return lastActivity !== null && now - lastActivity > GUEST_STALE_DAYS * DAY_MS
}

/**
 * La date de suppression automatique d'un invité (jour AAAA-MM-JJ) est-elle
 * déjà passée ? Le balayage ne tourne qu'au fil du trafic (au plus toutes les
 * 6 h, par lots) : un compte échu peut rester en base quelques heures, et
 * l'écran ne doit pas annoncer au futur une date d'hier. Le jour même, la
 * date reste affichée.
 */
export function isGuestPurgeOverdue(purgeDay: string, now: Date = new Date()): boolean {
  return purgeDay.slice(0, 10) < parisDayString(now)
}

/**
 * JOURNAL DU STAFF — détail d'une suppression de compte. La ligne survit au
 * compte effacé (ancrée sur l'auteur) : ni pseudo, ni code, ni email, et pas
 * de phrase en français non plus. On stocke un détail NEUTRE `type:rôle`
 * (ex. `guest:user`), traduit à la lecture dans la langue du staff.
 */
export function accountDeleteLogDetail(kind: AccountKind, role: string): string {
  return `${kind}:${normalizeRole(role)}`
}

/** Détail des lignes 'account-delete' antérieures, anonymisées sans type ni rôle. */
export const ACCOUNT_DELETE_ANONYMIZED_DETAIL = 'compte supprimé'

/** Relit un détail `type:rôle` ; null pour tout autre texte (lignes anonymisées). */
export function parseAccountDeleteLogDetail(
  detail: string | null | undefined
): { kind: AccountKind; role: UserRole } | null {
  const match = /^([a-z_]+):([a-z]+)$/.exec(detail ?? '')
  if (!match) return null
  const kind = ACCOUNT_KINDS.find((candidate) => candidate === match[1])
  const role = USER_ROLES.find((candidate) => candidate === match[2])
  return kind && role ? { kind, role } : null
}

/**
 * Tous les détails 'account-delete' admis en base : les `type:rôle` et la
 * forme anonymisée. Le balayage de conservation anonymise tout le reste (un
 * ancien conteneur qui aurait encore écrit « pseudo (code) — email »).
 */
export const NEUTRAL_ACCOUNT_DELETE_DETAILS: readonly string[] = [
  ACCOUNT_DELETE_ANONYMIZED_DETAIL,
  ...ACCOUNT_KINDS.flatMap((kind) => USER_ROLES.map((role) => accountDeleteLogDetail(kind, role))),
]
