import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { buildAlternates, pageOpenGraph, siteOgImage } from '@/lib/seo/alternates'

/**
 * SEO du hub /jeux (page client) : metadata dédiée — la page partageait
 * title/description avec la home (duplicate parfait, priorité 1.0 du
 * sitemap) — + canonical/hreflang, et la carte de partage de marque (la page
 * en priorité 1.0 n'avait aucune image : lien nu sur WhatsApp et Discord).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'games.meta.hub' })
  const title = t('title')
  const description = t('description')
  const ogImage = siteOgImage(locale)
  return {
    title: { absolute: title },
    description,
    alternates: buildAlternates('/jeux', locale),
    openGraph: pageOpenGraph(locale, { title, description, url: `/${locale}/jeux` }),
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

/**
 * En-tête SERVEUR du hub : le <h1> et l'accroche partent dans le HTML dès le
 * premier octet, sans attendre la réponse d'authentification côté client — la
 * page est en priorité 1.0 au sitemap et n'avait AUCUN titre de niveau 1
 * (HubShell y est rendu en mode `compact`, qui court-circuite son héros).
 * Conséquence : ne jamais repasser HubShell en mode non-compact ici, sinon
 * deux <h1> se disputeraient la page.
 */
export default async function JeuxLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'hub.jeux' })

  return (
    <>
      {/* Mêmes container/gouttières que HubShell : le titre doit s'aligner
          au pixel près sur la grille rendue juste en dessous. */}
      {/* En-tête serré : à 375×667 il prenait 6 lignes (h1 sur deux, intro
          sur quatre) avant le premier réglage. Le h1 garde son texte entier
          (51 caractères, priorité 1.0 au sitemap) et tient en deux lignes
          courtes ; l'intro est coupée à deux lignes À L'ÉCRAN seulement — le
          texte reste entier dans le HTML. */}
      <div className="container relative mx-auto max-w-6xl px-4 pt-3 sm:px-6 sm:pt-7">
        <header className="space-y-1">
          <h1 className="font-display text-lg font-bold leading-tight tracking-tight text-cream sm:text-3xl">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
              {t('h1')}
            </span>
          </h1>
          <p className="line-clamp-2 max-w-2xl text-[13px] leading-snug text-cream/80 sm:line-clamp-none sm:text-sm">
            {t('intro')}
          </p>
        </header>
      </div>
      {children}
    </>
  )
}
