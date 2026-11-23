import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isAppLocale } from '@/lib/locale-utils'
import { LandingPage } from '@/components/landing/LandingPage'
import { GAMES } from '@/lib/games'
import { buildAlternates, buildOpenGraphLocale, siteOgImage } from '@/lib/seo/alternates'

// Aucune lecture de cookies ni d'en-têtes sur la chaîne : la page est prérendue.
// Sans revalidation, la liste cachée, le classement, les joueurs en ligne et la
// Table du vendredi resteraient figés jusqu'au déploiement suivant.
export const revalidate = 300

/**
 * L'ancien accueil (la vitrine : héros, jeux, règles, FAQ), déplacé ici le
 * 22/11/2026 quand le Mode Soirée est devenu l'accueil — toujours dans le
 * menu (« Découvrir Le Pillaveur »).
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  const t = await getTranslations({ locale, namespace: 'metadata' })
  const title = t('titleFull')
  const description = t('descriptionCount', { count: GAMES.filter((g) => !g.hidden).length })
  const ogImage = siteOgImage(locale)
  return {
    description,
    alternates: buildAlternates('/decouvrir', locale),
    openGraph: {
      type: 'website',
      siteName: t('title'),
      ...buildOpenGraphLocale(locale),
      title,
      description,
      url: `/${locale}/decouvrir`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function DecouvrirPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isAppLocale(locale)) notFound()
  setRequestLocale(locale)
  return <LandingPage locale={locale} />
}
