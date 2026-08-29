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

export default function JeuxLayout({ children }: { children: React.ReactNode }) {
  return children
}
