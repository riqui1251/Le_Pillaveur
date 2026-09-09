import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from '@/i18n/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LOCAL_PLAY_COOKIE, SESSION_COOKIE } from '@/lib/auth-cookies'
import { LandingPage } from '@/components/landing/LandingPage'
import { GAMES } from '@/lib/games'

/**
 * Description de la vitrine : le nombre de jeux est DÉRIVÉ du catalogue, il
 * n'est plus recopié à la main dans les 4 langues (les metadata annonçaient
 * 21 jeux quand la grille en affichait 22). Seule la `description` est
 * redéfinie ici — le reste (titre, OG, Twitter) est hérité du layout, qui
 * garde une formulation sans chiffre pour ne jamais se contredire.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata' })
  return {
    description: t('descriptionCount', { count: GAMES.filter((g) => !g.hidden).length }),
  }
}

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
