'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { usePathname, useRouter } from '@/i18n/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { localeFlags, localeLabels, locales, type AppLocale } from '@/i18n/routing'
import { LOCALE_COOKIE, LOCALE_MAX_AGE } from '@/lib/locale-cookies'
import { useAuth } from '@/hooks/useAuth'

function setLocaleCookie(locale: AppLocale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${LOCALE_MAX_AGE}; SameSite=Lax`
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations('nav')
  const locale = useLocale() as AppLocale
  const router = useRouter()
  const pathname = usePathname()
  const { user, refresh } = useAuth()
  const [isPending, startTransition] = useTransition()

  const onChange = (nextLocale: string) => {
    if (nextLocale === locale || !locales.includes(nextLocale as AppLocale)) return
    const target = nextLocale as AppLocale
    setLocaleCookie(target)

    void (async () => {
      if (user) {
        try {
          await fetch('/api/auth/locale', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ locale: target }),
          })
          await refresh()
        } catch {
          // cookie + URL restent la source de vérité locale
        }
      }

      startTransition(() => {
        router.replace(pathname, { locale: target })
      })
    })()
  }

  return (
    <Select value={locale} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger
        className={className}
        aria-label={t('languageSwitcher')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[130]">
        {locales.map((loc) => (
          <SelectItem key={loc} value={loc}>
            <span className="flex items-center gap-2">
              <span aria-hidden>{localeFlags[loc]}</span>
              <span>{localeLabels[loc]}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
