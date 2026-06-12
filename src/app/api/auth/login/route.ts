import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  createSession,
  isValidEmail,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth-server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user?.passwordHash) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Email ou mot de passe incorrect' }, { status: 401 })
    }

    const token = await createSession(user.id)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        playMode: user.playMode,
      },
    })
    response.cookies.set(sessionCookieOptions(token))
    return response
  } catch (error) {
    console.error('login error:', error)
    return NextResponse.json({ error: 'Erreur de connexion' }, { status: 500 })
  }
}
