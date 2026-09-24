import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from '@/i18n/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LOCAL_PLAY_COOKIE, SESSION_COOKIE } from '@/lib/auth-cookies'
import { LandingPage } from '@/components/landing/LandingPage'
import { GAMES } from '@/lib/games'
import { buildAlternates, buildOpenGraphLocale, siteOgImage } from '@/lib/seo/alternates'

/**
 * Metadata de la vitrine. Le nombre de jeux est DÉRIVÉ du catalogue, il
 * n'est plus recopié à la main dans les 4 langues (les metadata annonçaient
 * 21 jeux quand la grille en affichait 22) — il ne peut donc pas se
 * contredire, et sert aussi aux aperçus de partage.
 *
 * Canonical + hreflang (la vitrine n'en avait pas : quatre URL pour un même
 * contenu, sans lien entre elles) et carte de partage de marque. `openGraph`
 * ne se FUSIONNE pas avec celui du layout — Next remplace l'objet entier dès
 * qu'une page le pose — d'où titre, langue et url redonnés ici en entier.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'metadata' })
  const title = t('titleFull')
  const description = t('descriptionCount', { count: GAMES.filter((g) => !g.hidden).length })
  const ogImage = siteOgImage(locale)
  return {
    description,
    alternates: buildAlternates('', locale),
    openGraph: {
      type: 'website',
      siteName: t('title'),
      ...buildOpenGraphLocale(locale),
      title,
      description,
      url: `/${locale}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
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
