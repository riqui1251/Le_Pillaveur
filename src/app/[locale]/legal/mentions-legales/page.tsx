import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { LegalPage } from '@/components/legal/LegalPage'
import { buildAlternates, pageOpenGraph, pageTwitter } from '@/lib/seo/alternates'

/**
 * Titre (legal.pages) et extrait (legal.meta) dans la langue de la page —
 * la metadata était française en dur sous les quatre langues — plus
 * canonical/hreflang, comme toute page publique.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const tPages = await getTranslations({ locale, namespace: 'legal.pages' })
  const tMeta = await getTranslations({ locale, namespace: 'legal.meta.mentionsLegales' })
  const title = tPages('mentionsLegales')
  const description = tMeta('description')
  return {
    title,
    description,
    alternates: buildAlternates('/legal/mentions-legales', locale),
    openGraph: pageOpenGraph(locale, { title, description, url: `/${locale}/legal/mentions-legales` }),
    twitter: pageTwitter(locale, { title, description }),
  }
}

export default async function MentionsLegalesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Rendue au build : la langue vient des params, jamais des en-têtes de la
  // requête (les <Link> serveur de LegalPage la lisent d'ici).
  setRequestLocale(locale)
  return <LegalPage docId="mentions-legales" locale={locale} />
}
