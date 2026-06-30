'use client'

import { useCallback, useMemo } from 'react'
import { useParams, useRouter as useNextRouter } from 'next/navigation'
import { routing, type AppLocale } from './routing'

function withLocale(locale: string, href: string): string {
  const path = href.startsWith('/') ? href : `/${href}`
  if (path === '/') return `/${locale}`
  return `/${locale}${path}`
}

/** Router compatible i18n, sans erreur au pre-rendu build. */
export function useRouter() {
  const nextRouter = useNextRouter()
  const params = useParams()
  const locale = (params?.locale as AppLocale | undefined) ?? routing.defaultLocale

  const push = useCallback(
    (href: string, options?: { locale?: AppLocale }) => {
      nextRouter.push(withLocale(options?.locale ?? locale, href))
    },
    [nextRouter, locale]
  )

  const replace = useCallback(
    (href: string, options?: { locale?: AppLocale }) => {
      nextRouter.replace(withLocale(options?.locale ?? locale, href))
    },
    [nextRouter, locale]
  )

  const prefetch = useCallback(
    (href: string) => nextRouter.prefetch(withLocale(locale, href)),
    [nextRouter, locale]
  )

  return useMemo(
    () => ({
      push,
      replace,
      back: nextRouter.back,
      forward: nextRouter.forward,
      refresh: nextRouter.refresh,
      prefetch,
    }),
    [push, replace, prefetch, nextRouter]
  )
}
