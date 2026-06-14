import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import {
  isAppLocale,
  localeCookieOptions,
  normalizeAppLocale,
  updateUserLocale,
} from '@/lib/locale-server'

export async function PATCH(request: Request) {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const raw = typeof body.locale === 'string' ? body.locale : ''
    if (!isAppLocale(raw)) {
      return NextResponse.json({ error: 'Locale invalide' }, { status: 400 })
    }

    await updateUserLocale(user.id, raw)

    const response = NextResponse.json({ locale: raw })
    response.cookies.set(localeCookieOptions(raw))
    return response
  } catch (error) {
    console.error('locale update error:', error)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ locale: null }, { status: 401 })
  }
  return NextResponse.json({ locale: normalizeAppLocale(user.locale) })
}
