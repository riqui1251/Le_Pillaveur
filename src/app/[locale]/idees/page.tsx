import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ArrowLeft, ArrowRight, Gamepad2 } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { GameIconById } from '@/components/hub/GameIconById'
import { getGameById } from '@/lib/games'
import { IDEAS_META, IDEAS_SLUGS } from '@/lib/ideas/ideas-content'
import { OG_LOCALES, SITE_NAME, siteOgImage } from '@/lib/seo/alternates'
import { SITE_URL } from '@/lib/site'
import { cn } from '@/lib/utils'

/**
 * Index des listes de questions — /idees. Une carte par liste (docs/ideas/fr/),
 * même gabarit que l'index des règles : contenu français sous les quatre
 * locales, canonical /fr/idees, textes lus dans le catalogue français.
 */

const CONTENT_LOCALE = 'fr'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: CONTENT_LOCALE, namespace: 'ideas' })
  const title = t('meta.title')
  const description = t('meta.description')
  const canonical = `/${CONTENT_LOCALE}/idees`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: OG_LOCALES[CONTENT_LOCALE],
      title,
      description,
      url: canonical,
      images: [{ url: siteOgImage(CONTENT_LOCALE), width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [siteOgImage(CONTENT_LOCALE)] },
  }
}

export default async function IdeasIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations({ locale: CONTENT_LOCALE, namespace: 'ideas' })
  const url = `${SITE_URL}/${CONTENT_LOCALE}/idees`

  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: t('title'),
    description: t('meta.description'),
    url,
    inLanguage: CONTENT_LOCALE,
    isPartOf: { '@type': 'WebSite', name: 'Le Pillaveur', url: SITE_URL },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: IDEAS_SLUGS.length,
      itemListElement: IDEAS_SLUGS.map((slug, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: IDEAS_META[slug].title,
        url: `${url}/${slug}`,
      })),
    },
  }
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumb.home'), item: `${SITE_URL}/${CONTENT_LOCALE}` },
      { '@type': 'ListItem', position: 2, name: t('breadcrumb.ideas'), item: url },
    ],
  }

  return (
    <main lang={CONTENT_LOCALE} className="relative min-h-screen overflow-x-clip text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([collection, breadcrumbs]) }}
      />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-72 w-72 rounded-full bg-gold/10 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-gold/[0.07] blur-[110px]" />
      </div>

      <div className="container relative mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t('breadcrumb.home')}
        </Link>

        <header className="mt-4 max-w-3xl">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.3em] text-gold/80">
            {t('kicker')}
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent">
              {t('title')}
            </span>
          </h1>
          <p className="mt-3 text-pretty text-sm leading-relaxed text-white/70 sm:text-base">{t('intro')}</p>
        </header>

        <section aria-label={t('title')} className="mt-6">
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {IDEAS_SLUGS.map((slug) => {
              const game = getGameById(IDEAS_META[slug].gameId)
              return (
                <li key={slug}>
                  <Link href={`/idees/${slug}`} prefetch={false} className="group block h-full touch-manipulation">
                    <PlayingCard
                      suit={game?.suit ?? 'heart'}
                      rank={game?.rank ?? 'A'}
                      className={cn(
                        'h-full transition-all duration-200',
                        'group-hover:-translate-y-0.5 group-hover:shadow-[0_16px_30px_-12px_rgba(0,0,0,0.7)]',
                        'group-active:scale-[0.98]'
                      )}
                    >
                      <article className="flex h-full flex-col px-5 pb-4 pt-5">
                        <div className="flex items-center gap-3">
                          {game && <GameIconById id={game.id} surface="card" className="h-8 w-8 shrink-0" />}
                          <h2 className="font-display text-lg font-bold leading-tight text-[#24201A]">
                            {t(`lists.${slug}.name`)}
                          </h2>
                        </div>
                        <p className="mt-2 text-sm leading-snug text-[#4A443A]">{t(`lists.${slug}.blurb`)}</p>
                        <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm font-semibold text-[#24201A] transition-colors group-hover:text-suit-red">
                          {t('readList')}
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                        </span>
                      </article>
                    </PlayingCard>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="mt-10 text-center">
          <Link
            href="/jeux"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
          >
            <Gamepad2 className="h-4 w-4" aria-hidden />
            {t('allGames')}
          </Link>
        </div>
      </div>
    </main>
  )
}
