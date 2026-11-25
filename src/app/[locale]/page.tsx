import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isAppLocale } from '@/lib/locale-utils'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { soireeSlice } from '@/i18n/messages-slices'
import { ClientMessages } from '@/components/i18n/ClientMessages'
import { HomeLanding } from '@/components/home/HomeLanding'
import { HomeSiteLinks } from '@/components/home/HomeSiteLinks'
import { SoireeShell } from '@/components/soiree/soiree-ui'
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
  if (!isAppLocale(locale)) notFound()
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
  // Le layout rejette déjà une langue inconnue, mais la page est rendue EN
  // PARALLÈLE : /apple-touch-icon.png (hors middleware i18n) arrivait ici
  // avec locale = « apple-touch-icon.png » et l'heure de la table du vendredi
  // (Intl.DateTimeFormat) levait un RangeError — 500 au lieu de 404.
  if (!isAppLocale(locale)) notFound()
  // Mode Soirée ou Jeu libre, pour tout le monde : un compte en mode en ligne
  // n'est plus renvoyé vers /jeux, l'accueil lui présélectionne « Jeu libre ·
  // En ligne » (src/components/home/home-choice.ts).
  setRequestLocale(locale)
  return (
    <ClientMessages messages={soireeSlice(await getMessages({ locale }))}>
      <SoireeShell>
        <HomeLanding />
        <HomeSiteLinks locale={locale} />
      </SoireeShell>
    </ClientMessages>
  )
}
