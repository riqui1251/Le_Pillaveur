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
const SESSION_DAYS = 30
const VISITOR_DAYS = 365
const LOCAL_PLAY_DAYS = 365

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
}

function sessionExpiry(): Date {
  const d = new Date()
  d.setDate(d.getDate() + SESSION_DAYS)
  return d
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

export async function createSession(userId: string): Promise<string> {
  const token = createSessionToken()
  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt: sessionExpiry(),
    },
  })
  return token
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } })
}

export async function getUserFromSessionToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }

  const user = session.user
  if (!user.email || !user.passwordHash) return null

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
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    onlineDisplayName: normalizedOnlineName,
    onlinePreferences: parseOnlinePreferences(user.onlinePreferencesJson),
    accountCode,
    role,
    locale: normalizeAppLocale(user.locale),
    playMode: user.playMode === 'online' ? 'online' : 'local',
    ambianceMode: user.ambianceMode === 'soft' ? 'soft' : 'alcool',
    onlineXp: user.onlineXp,
  }
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
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  return getUserFromSessionToken(token)
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
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
