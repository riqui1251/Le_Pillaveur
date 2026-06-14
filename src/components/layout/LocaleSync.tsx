'use client'

import { useEffect, useRef } from 'react'
import { useLocale } from 'next-intl'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { isAppLocale } from '@/lib/locale-utils'
import { type AppLocale } from '@/i18n/routing'

/** Aligne l’URL avec la locale enregistrée sur le compte (sync multi-appareils). */
export function LocaleSync() {
  const { user, loading } = useAuth()
  const locale = useLocale() as AppLocale
  const pathname = usePathname()
  const router = useRouter()
  const syncedForUser = useRef<string | null>(null)

  useEffect(() => {
    if (loading || !user?.locale || !isAppLocale(user.locale)) return
    if (syncedForUser.current === user.id) return

    const preferred = user.locale as AppLocale
    if (preferred !== locale) {
      syncedForUser.current = user.id
      router.replace(pathname, { locale: preferred })
    }
  }, [loading, user, locale, pathname, router])

  return null
}
