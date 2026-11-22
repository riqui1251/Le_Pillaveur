import { ANALYTICS_CONSENT_V2_SINCE } from '@/lib/auth-cookies'
import { parisDayStartUtc } from '@/lib/paris-time'
import { normalizeRole } from '@/lib/roles'

/**
 * POURQUOI UN COMPTE N'A PAS DE TEMPS DE VISITE — module PUR, sans Prisma ni
 * React : la liste Comptes le lit côté serveur, la fiche côté navigateur.
 *
 * Une visite (AccountVisit) n'est écrite que pour le rôle 'user' et sur un
 * navigateur qui a accepté les statistiques de visite. « Aucune visite suivie »
 * recouvrait donc trois réalités — compte de l'équipe, joueur vu sans visite
 * suivie, joueur pas vu — que l'exploitant lisait comme « n'a pas joué » : à
 * une table de deux, un seul des deux semblait compté.
 *
 * La Supervision ne lit JAMAIS le choix de quelqu'un (c'est un cookie de son
 * navigateur) : « vu sans visite suivie » est une DÉDUCTION de deux faits, et
 * aucun libellé ne parle de refus.
 */

/**
 * État d'un compte sur la fenêtre de 7 jours de la liste Comptes.
 * - `tracked` : au moins une visite COMMENCÉE dans la fenêtre ;
 * - `carried` : aucune, mais une visite commencée avant s'y est poursuivie (la
 *   soirée du vendredi passé minuit, lue le vendredi suivant) ;
 * - `staff` : compte de l'équipe, jamais suivi ;
 * - `seenUntracked` : joueur vu, ou assis à une table, sans visite suivie ;
 * - `notSeen` : aucun signe de vie enregistré.
 */
export const VISIT_TRACKING_STATES = ['tracked', 'carried', 'staff', 'seenUntracked', 'notSeen'] as const
export type VisitTrackingState = (typeof VISIT_TRACKING_STATES)[number]

export function isVisitTrackingState(value: unknown): value is VisitTrackingState {
  return (VISIT_TRACKING_STATES as readonly unknown[]).includes(value)
}

/** Clé `supervision.accounts` de la ligne « 7 j : … » quand aucune visite n'a commencé dans la fenêtre. */
export const VISITS_7D_KEYS = {
  carried: 'visits7dCarried',
  staff: 'visits7dStaff',
  seenUntracked: 'visits7dSeen',
  notSeen: 'visits7dNotSeen',
} as const satisfies Record<Exclude<VisitTrackingState, 'tracked'>, string>

function isOnOrAfter(date: Date | null, bound: Date): boolean {
  if (!date) return false
  const ms = date.getTime()
  return Number.isFinite(ms) && ms >= bound.getTime()
}

/**
 * Les visites priment sur le rôle : un compte qui en a (promu hors de la
 * route, qui efface celles d'un joueur passé dans l'équipe) garde ses chiffres
 * plutôt qu'un « non suivi » que la ligne contredirait.
 *
 * `carried` passe avant « vu sans visite suivie » : la liste compte les
 * visites par jour de DÉBUT, et un compte suivi dont la soirée a commencé la
 * veille de la fenêtre y serait déclaré non suivi.
 *
 * Un siège au journal des parties prouve la présence autant que lastSeenAt :
 * il ne dépend ni de l'accord, ni d'un battement qu'un bloqueur de publicité
 * peut retenir.
 */
export function classifyVisitTracking(input: {
  role: string
  /** Visites commencées dans la fenêtre. */
  visitsStarted: number
  /** Une visite commencée avant la fenêtre a battu dedans. */
  carriedVisit: boolean
  /** Parties du journal lancées dans la fenêtre où le compte a un siège. */
  games: number
  lastSeenAt: Date | null
  windowStart: Date
}): VisitTrackingState {
  if (input.visitsStarted > 0) return 'tracked'
  if (input.carriedVisit) return 'carried'
  if (normalizeRole(input.role) !== 'user') return 'staff'
  if (input.games > 0 || isOnOrAfter(input.lastSeenAt, input.windowStart)) return 'seenUntracked'
  return 'notSeen'
}

/**
 * Raison donnée par la fiche d'un compte qui n'a AUCUNE visite conservée.
 * - `beforeTracking` : dernier signe de vie trop ancien pour qu'une visite,
 *   même suivie, existe encore — on ne peut rien en déduire ;
 * - `neverSeen` : aucun signe de vie enregistré.
 */
export const UNTRACKED_REASONS = ['staff', 'seenUntracked', 'beforeTracking', 'neverSeen'] as const
export type UntrackedReason = (typeof UNTRACKED_REASONS)[number]

/** Clé `supervision.accountFile` du message de chaque raison. */
export const UNTRACKED_REASON_KEYS = {
  staff: 'visitsStaffNotTracked',
  seenUntracked: 'visitsSeenUntracked',
  beforeTracking: 'visitsBeforeTracking',
  neverSeen: 'visitsNeverSeen',
} as const satisfies Record<UntrackedReason, string>

/**
 * Conservation d'une visite après son début : la même que SIX_MONTHS_MS de
 * retention-sweep.ts, qui la purge (égalité tenue par un test).
 */
export const VISIT_RETENTION_MS = 6 * 30 * 24 * 60 * 60 * 1000

/**
 * Depuis quand une visite suivie existerait encore : le début du suivi par
 * visites, ou la limite de conservation. Un compte vu APRÈS cette date et qui
 * n'a aucune visite n'a pas été suivi ; vu avant, on ne peut rien en dire.
 */
export function visitsKeptSince(now: Date = new Date()): Date {
  return new Date(
    Math.max(parisDayStartUtc(ANALYTICS_CONSENT_V2_SINCE).getTime(), now.getTime() - VISIT_RETENTION_MS)
  )
}

/** À n'appeler que pour un compte sans aucune visite conservée. */
export function untrackedReason(input: {
  role: string
  lastSeenAt: Date | null
  /** Parties du journal où le compte a un siège, sur la fenêtre de la fiche. */
  games: number
  now?: Date
}): UntrackedReason {
  if (normalizeRole(input.role) !== 'user') return 'staff'
  if (input.games > 0) return 'seenUntracked'
  if (!input.lastSeenAt || !Number.isFinite(input.lastSeenAt.getTime())) return 'neverSeen'
  return isOnOrAfter(input.lastSeenAt, visitsKeptSince(input.now)) ? 'seenUntracked' : 'beforeTracking'
}
