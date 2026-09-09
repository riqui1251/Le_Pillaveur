import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { locales } from '@/i18n/routing'

/**
 * SEO du hub /jeux (page client) : metadata dédiée — la page partageait
 * title/description avec la home (duplicate parfait, priorité 1.0 du
 * sitemap) — + canonical/hreflang.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'games.meta.hub' })
  const languages: Record<string, string> = { 'x-default': '/fr/jeux' }
  for (const l of locales) {
    languages[l] = `/${l}/jeux`
  }
  return {
    title: { absolute: t('title') },
    description: t('description'),
    alternates: { canonical: `/${locale}/jeux`, languages },
    openGraph: { title: t('title'), description: t('description'), url: `/${locale}/jeux` },
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
      <div className="container relative mx-auto max-w-6xl px-4 pt-5 sm:px-6 sm:pt-7">
        <header className="space-y-1.5">
          <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
              {t('h1')}
            </span>
          </h1>
          <p className="max-w-2xl text-sm text-white/65">{t('intro')}</p>
        </header>
      </div>
      {children}
    </>
  )
}
