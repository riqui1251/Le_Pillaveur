import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { LOCALE_COOKIE } from '@/lib/locale-cookies'
import { normalizeAppLocale } from '@/lib/locale-utils'
import type { AppLocale } from '@/i18n/routing'

export { isAppLocale, normalizeAppLocale, localeCookieOptions } from '@/lib/locale-utils'

export async function getLocaleFromCookie(): Promise<AppLocale> {
  const cookieStore = await cookies()
  return normalizeAppLocale(cookieStore.get(LOCALE_COOKIE)?.value)
}

export async function updateUserLocale(userId: string, locale: AppLocale): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { locale },
  })
}
