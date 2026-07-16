import { cookies } from 'next/headers'
import { redirect } from '@/i18n/navigation'
import { setRequestLocale } from 'next-intl/server'
import { LOCAL_PLAY_COOKIE, SESSION_COOKIE } from '@/lib/auth-cookies'
import { LandingPage } from '@/components/landing/LandingPage'

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const jar = await cookies()
  // Les habitués (session ou mode local déjà choisi) entrent directement
  // dans l'app ; les nouveaux visiteurs — et les moteurs de recherche —
  // découvrent la vitrine.
  const isReturning =
    Boolean(jar.get(SESSION_COOKIE)?.value) || jar.get(LOCAL_PLAY_COOKIE)?.value === '1'
  if (isReturning) {
    redirect({ href: '/jeux', locale })
  }
  setRequestLocale(locale)
  return <LandingPage locale={locale} />
}
