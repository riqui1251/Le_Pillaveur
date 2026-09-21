import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, readApiJson, withApiRoute } from '@/lib/api-route'
import {
  isAppLocale,
  localeCookieOptions,
  normalizeAppLocale,
  updateUserLocale,
} from '@/lib/locale-server'

export const PATCH = withApiRoute('auth/locale PATCH', async (request: Request) => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const parsed = await readApiJson<{ locale?: unknown }>(request)
  if (!parsed.ok) return parsed.response

  const raw = typeof parsed.body?.locale === 'string' ? parsed.body.locale : ''
  if (!isAppLocale(raw)) return apiError('invalid_locale', 400)

  await updateUserLocale(user.id, raw)

  const response = NextResponse.json({ locale: raw })
  response.cookies.set(localeCookieOptions(raw))
  return response
})

export const GET = withApiRoute('auth/locale GET', async () => {
  const user = await getCurrentUser()
  // Pas de session : 401 SANS champ `error` — le sélecteur de langue lit
  // `locale`, pas un message. Forme inchangée.
  if (!user) return NextResponse.json({ locale: null }, { status: 401 })
  return NextResponse.json({ locale: normalizeAppLocale(user.locale) })
})
