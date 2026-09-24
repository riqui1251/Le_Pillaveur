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
  const tMeta = await getTranslations({ locale, namespace: 'legal.meta.cgu' })
  const title = tPages('cgu')
  const description = tMeta('description')
  return {
    title,
    description,
    alternates: buildAlternates('/legal/cgu', locale),
    openGraph: pageOpenGraph(locale, { title, description, url: `/${locale}/legal/cgu` }),
    twitter: pageTwitter(locale, { title, description }),
  }
}

export default async function CguPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Rendue au build : la langue vient des params, jamais des en-têtes de la
  // requête (les <Link> serveur de LegalPage la lisent d'ici).
  setRequestLocale(locale)
  return <LegalPage docId="cgu" locale={locale} />
}
