import { cookies } from 'next/headers'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

export const SESSION_COOKIE = 'lp_session'
const SESSION_DAYS = 30

export type AuthUser = {
  id: string
  email: string
  displayName: string
  playMode: 'local' | 'online'
}

export type PlayMode = 'local' | 'online'

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

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    playMode: (user.playMode === 'online' ? 'online' : 'local') as PlayMode,
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

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8
}
