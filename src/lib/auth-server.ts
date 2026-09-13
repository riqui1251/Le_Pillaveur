import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'
import {
  canAccessSupervision,
  canAssignRoles,
  canManageUsers,
  normalizeRole,
  type UserRole,
} from '@/lib/roles'
import { ensureUserAccountCode } from '@/lib/account-code'
import { clearExpiredBanIfNeeded, getBanState } from '@/lib/ban-server'
import { LOCAL_PLAY_COOKIE, SESSION_COOKIE, VISITOR_COOKIE } from '@/lib/auth-cookies'
import { normalizeAppLocale } from '@/lib/locale-server'
import { parseOnlinePreferences, type OnlinePreferences } from '@/lib/online-preferences'

export { SESSION_COOKIE, VISITOR_COOKIE, LOCAL_PLAY_COOKIE } from '@/lib/auth-cookies'
/**
 * Durée d'une session de COMPTE (email ou Google) : 30 jours GLISSANTS,
 * repoussés à l'usage par renewSessionIfStale (ping et /api/auth/me) — sauf
 * pour les comptes de l'équipe, qui gardent une échéance fixe.
 */
export const SESSION_DAYS = 30
/**
 * Durée d'une session d'INVITÉ : 91 jours glissants. Le cookie est sa seule
 * clé (ni email, ni mot de passe, ni Google). Un jour de plus que
 * GUEST_INACTIVITY_DAYS (retention-sweep.ts) : le renouvellement n'a lieu que
 * sous le seuil « durée − 1 jour » (shouldRenewSession), donc après une visite
 * l'échéance tombe entre 90 et 91 jours plus tard — jamais avant les 90 jours
 * sans activité promis. À 90 jours pile, une session renouvelée la veille
 * expirait jusqu'à 24 h trop tôt, et la purge des orphelins emportait le
 * compte avant le délai annoncé.
 */
export const GUEST_SESSION_DAYS = 91
const VISITOR_DAYS = 365
const LOCAL_PLAY_DAYS = 365
const DAY_MS = 24 * 60 * 60 * 1000

export type AuthUser = {
  id: string
  email: string
  displayName: string
  onlineDisplayName: string | null
  onlinePreferences: OnlinePreferences
  accountCode: string
  role: UserRole
  locale: string
  playMode: 'local' | 'online'
  ambianceMode: 'alcool' | 'soft'
  /** XP de progression en ligne (niveau dérivé via levelForXp). */
  onlineXp: number
  /**
   * Compte invité (table rejointe par code ou QR, « Essayer avec des bots ») —
   * email vide. Purgé 90 jours sans activité, ou 7 jours après sa dernière
   * activité s'il n'a plus de session valide (retention-sweep).
   */
  isGuest?: boolean
}

/** Durée de session selon le type de compte (création et renouvellement). */
export function sessionDaysFor(isGuest: boolean | undefined): number {
  return isGuest ? GUEST_SESSION_DAYS : SESSION_DAYS
}

/**
 * Échéance en millisecondes exactes (et non en jours calendaires locaux) :
 * elle reste égale au maxAge du cookie posé dans la même réponse.
 */
function sessionExpiry(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * DAY_MS)
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(password, hash)
}

export function createSessionToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Le cookie porte le jeton BRUT, la base ne stocke que son empreinte SHA-256
 * (même colonne Session.token, contenu haché) — comme les jetons de
 * réinitialisation. Une lecture de la base (dump, sauvegarde égarée) ne donne
 * donc plus de sessions utilisables. Tout accès à Session.token passe par ici.
 *
 * `days` : SESSION_DAYS pour un compte, GUEST_SESSION_DAYS pour un invité —
 * le cookie doit être posé avec la MÊME durée (sessionCookieOptions).
 */
export async function createSession(userId: string, days: number = SESSION_DAYS): Promise<string> {
  const token = createSessionToken()
  await prisma.session.create({
    data: {
      token: hashToken(token),
      userId,
      expiresAt: sessionExpiry(days),
    },
  })
  return token
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token: hashToken(token) } })
}

/**
 * Connexion PAR-DESSUS une session (login, inscription, Google, invité,
 * pérennisation) : la session du cookie reçu est supprimée une fois la
 * nouvelle posée. Sinon le cookie est écrasé mais la ligne reste valide en
 * base : un invité ainsi abandonné (son cookie était sa seule clé) ne serait
 * jamais vu comme orphelin, ni purgé, et sa fiche afficherait une connexion
 * active fictive.
 *
 * À appeler en DERNIER, après la création de la nouvelle session et toutes
 * les écritures qui peuvent lever : un échec de connexion (503 sans cookie)
 * ne doit pas déconnecter la session en place — pour un invité, ce serait la
 * perte définitive du compte.
 *
 * Simple nettoyage : un échec n'est pas remonté (la connexion, déjà acquise,
 * ne doit pas échouer pour ça). La ligne restante expire d'elle-même.
 */
export async function deleteIncomingSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (!token) return
  try {
    await deleteSession(token)
  } catch (error) {
    console.error('incoming session delete error:', error)
  }
}

/** Session valide lue depuis le cookie : le compte, le jeton brut et l'échéance en base. */
export type ValidSession = {
  user: AuthUser
  /** Jeton BRUT du cookie (à reposer tel quel au renouvellement). */
  token: string
  expiresAt: Date
}

export async function getUserFromSessionToken(token: string | undefined): Promise<AuthUser | null> {
  return (await getSessionFromToken(token))?.user ?? null
}

/**
 * Comme getUserFromSessionToken, mais expose aussi l'échéance lue : les routes
 * qui renouvellent la session (renewSessionIfStale) décident ainsi sans
 * seconde lecture. Aucune prolongation ICI : la base serait repoussée sans que
 * le cookie soit reposé dans la réponse.
 */
export async function getSessionFromToken(token: string | undefined): Promise<ValidSession | null> {
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const user = session.user
  // Sessions valables : comptes invités (isGuest, ni email ni mot de passe)
  // et tout compte avec email — mot de passe OU Google (passwordHash vide).
  // Seuls les enregistrements legacy sans email ni statut invité sont rejetés.
  if (!user.isGuest && !user.email) return null

  await clearExpiredBanIfNeeded(user.id)
  const ban = getBanState(user)
  if (ban.banned) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const role = normalizeRole(user.role)
  const accountCode = user.accountCode ?? (await ensureUserAccountCode(user.id))
  const normalizedOnlineName =
    typeof user.name === 'string' && user.name.trim().length > 0 && user.name.trim() !== user.displayName
      ? user.name.trim()
      : null

  return {
    token,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      email: user.email ?? '',
      displayName: user.displayName,
      onlineDisplayName: normalizedOnlineName,
      onlinePreferences: parseOnlinePreferences(user.onlinePreferencesJson),
      accountCode,
      role,
      locale: normalizeAppLocale(user.locale),
      playMode: user.playMode === 'online' ? 'online' : 'local',
      ambianceMode: user.ambianceMode === 'soft' ? 'soft' : 'alcool',
      onlineXp: user.onlineXp,
      isGuest: user.isGuest,
    },
  }
}

/**
 * Faut-il repousser l'échéance ? Seulement quand il reste MOINS de
 * (durée − 1 jour) : une session renouvelée repart à la durée pleine, donc la
 * prochaine écriture n'arrive qu'un jour plus tard au plus tôt — au plus une
 * écriture par jour par session, au lieu d'un UPDATE à chaque ping.
 */
export function shouldRenewSession(expiresAt: Date, days: number, now: Date = new Date()): boolean {
  const remaining = expiresAt.getTime() - now.getTime()
  return remaining > 0 && remaining < (days - 1) * DAY_MS
}

/**
 * Les comptes de l'ÉQUIPE (modérateur et au-dessus) gardent une session à
 * échéance FIXE de 30 jours : un cookie de supervision volé ne doit pas
 * rester valable indéfiniment du seul fait qu'on s'en sert.
 */
function isSlidingSession(user: AuthUser): boolean {
  return !canAccessSupervision(user.role)
}

/**
 * Session GLISSANTE : repousse l'échéance à maintenant + durée (30 j, 91 j
 * pour un invité) quand shouldRenewSession le demande. Jamais pour un compte
 * de l'équipe (isSlidingSession).
 *
 * Renvoie la durée appliquée (en jours) si la base a été prolongée, sinon
 * null. L'appelant DOIT alors reposer sessionCookieOptions(session.token,
 * durée) dans la même réponse : jamais de base prolongée avec un cookie qui
 * expire quand même.
 *
 * Écriture conditionnelle : updateMany sur l'empreinte ET une échéance encore
 * valide et encore sous le seuil. Deux onglets qui pinguent en même temps ne
 * prolongent qu'une fois (le second ne trouve plus de ligne sous le seuil), et
 * une session supprimée entre-temps (déconnexion, ban) n'est pas ressuscitée.
 * Un échec d'écriture (base verrouillée) n'est pas remonté : la requête sert
 * quand même le compte, le renouvellement sera retenté à la suivante.
 */
export async function renewSessionIfStale(
  session: ValidSession,
  now: Date = new Date()
): Promise<number | null> {
  if (!isSlidingSession(session.user)) return null
  const days = sessionDaysFor(session.user.isGuest)
  if (!shouldRenewSession(session.expiresAt, days, now)) return null
  try {
    const { count } = await prisma.session.updateMany({
      where: {
        token: hashToken(session.token),
        expiresAt: { gt: now, lt: new Date(now.getTime() + (days - 1) * DAY_MS) },
      },
      data: { expiresAt: sessionExpiry(days, now) },
    })
    return count === 1 ? days : null
  } catch (error) {
    console.error('session renew error:', error)
    return null
  }
}

/**
 * Cookie de session RÉALIGNÉ sur l'échéance lue en base, sans aucune écriture,
 * pour une session qui n'avait pas à être renouvelée.
 *
 * Filet réseau : un renouvellement validé en base dont la réponse (et donc le
 * Set-Cookie) s'est perdue — fetch coupé par une navigation, onglet fermé —
 * laisserait le cookie sur son ANCIENNE échéance, et le seuil « au plus une
 * écriture par jour » en empêcherait la réémission : la session serait perdue
 * alors que la base la croit valide. Reposé à chaque /api/auth/me, le cookie
 * rattrape la base au chargement suivant.
 *
 * null quand un renouvellement était dû : l'échéance lue est alors peut-être
 * déjà dépassée par une écriture concurrente (le ping du même chargement), et
 * la réponse qui a prolongé porte le bon cookie — le réaligner ici sur l'ancienne
 * valeur le raccourcirait.
 */
export function alignedSessionCookieOptions(session: ValidSession, now: Date = new Date()) {
  const days = sessionDaysFor(session.user.isGuest)
  if (isSlidingSession(session.user) && shouldRenewSession(session.expiresAt, days, now)) return null
  const remainingSec = Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)
  if (remainingSec <= 0) return null
  return { ...sessionCookieOptions(session.token, days), maxAge: remainingSec }
}

export async function requireSupervisionUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user || !canAccessSupervision(user.role)) {
    throw new Error('FORBIDDEN')
  }
  return user
}

export async function requireAdminUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user || !canManageUsers(user.role)) {
    throw new Error('FORBIDDEN')
  }
  return user
}

export function assertCanAssignRoles(actor: AuthUser): void {
  if (!canAssignRoles(actor.role)) {
    throw new Error('FORBIDDEN')
  }
}

export function createVisitorId(): string {
  return randomBytes(16).toString('hex')
}

export function visitorCookieOptions(visitorId: string) {
  return {
    name: VISITOR_COOKIE,
    value: visitorId,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: VISITOR_DAYS * 24 * 60 * 60,
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await getCurrentSession())?.user ?? null
}

/** Session valide du cookie de la requête (compte + jeton + échéance), ou null. */
export async function getCurrentSession(): Promise<ValidSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  return getSessionFromToken(token)
}

/** `days` : même durée que la session en base (createSession / renewSessionIfStale). */
export function sessionCookieOptions(token: string, days: number = SESSION_DAYS) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: days * 24 * 60 * 60,
  }
}

export function clearSessionCookieOptions() {
  return {
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
}

export function localPlayCookieOptions() {
  return {
    name: LOCAL_PLAY_COOKIE,
    value: '1',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: LOCAL_PLAY_DAYS * 24 * 60 * 60,
  }
}

export function clearLocalPlayCookieOptions() {
  return {
    name: LOCAL_PLAY_COOKIE,
    value: '',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } })
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPassword(password: string): boolean {
  if (password.length < 8 || password.length > 128) return false
  if (!/[a-zA-Z]/.test(password)) return false
  if (!/[0-9]/.test(password)) return false
  return true
}

export function passwordRequirementsHint(): string {
  return '8 caractères minimum, avec au moins une lettre et un chiffre'
}
