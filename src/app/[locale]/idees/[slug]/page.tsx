import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, BookOpen, Play } from 'lucide-react'
import { renderMarkdown } from '@/lib/legal/render-markdown'
import { IDEAS_META, IDEAS_SLUGS, isIdeasSlug, loadIdeasDoc } from '@/lib/ideas/ideas-content'
import { rulesPlayerBounds } from '@/lib/rules/rules-content'
import { GAMES } from '@/lib/games'
import { isGameListed } from '@/lib/game-catalog'
import { getStaffHiddenGameIds } from '@/lib/game-catalog-server'
import { OG_LOCALES, SITE_NAME } from '@/lib/seo/alternates'
import { SITE_URL } from '@/lib/site'

/**
 * Listes de questions SEO (/idees/<slug>) : un article français par liste
 * (docs/ideas/fr/), cartes recopiées du jeu qui les contient. Même gabarit
 * que les pages règles (src/app/[locale]/regles/[gameId]/page.tsx) : contenu
 * français sous les quatre locales, canonical /fr, `lang="fr"`, rendu au build.
 */

const CONTENT_LOCALE = 'fr'

/** Comme les règles : un jeu caché depuis la Supervision retire le bouton sans redéploiement. */
export const revalidate = 300

const PLAY_LINK_CLASS =
  'inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl py-2 text-center bg-gradient-to-r from-amber-500 to-orange-600 px-8 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500'

/** Carte de partage du jeu dont viennent les cartes (même route que les règles). */
function ideasOgImage(gameId: string): string {
  return `/api/og?type=game&game=${encodeURIComponent(gameId)}&locale=${CONTENT_LOCALE}`
}

export function generateStaticParams() {
  return IDEAS_SLUGS.map((slug) => ({ slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  if (!isIdeasSlug(slug)) return {}
  const meta = IDEAS_META[slug]
  const canonical = `/${CONTENT_LOCALE}/idees/${slug}`
  const ogImage = ideasOgImage(meta.gameId)
  const images = [{ url: ogImage, width: 1200, height: 630, alt: meta.title }]
  return {
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      siteName: SITE_NAME,
      locale: OG_LOCALES[CONTENT_LOCALE],
      title: meta.title,
      description: meta.description,
      url: canonical,
      images,
    },
    twitter: { card: 'summary_large_image', title: meta.title, description: meta.description, images: [ogImage] },
  }
}

export default async function IdeasPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  if (!isIdeasSlug(slug)) notFound()
  const content = loadIdeasDoc(slug)
  if (!content) notFound()
  const meta = IDEAS_META[slug]
  const game = GAMES.find((g) => g.id === meta.gameId)
  const hiddenIds = await getStaffHiddenGameIds()
  const playable = game ? isGameListed(game, hiddenIds) : false
  const bounds = game ? rulesPlayerBounds(game) : null
  const t = await getTranslations({ locale: CONTENT_LOCALE, namespace: 'ideas' })
  const tCommon = await getTranslations({ locale, namespace: 'common' })
  const indexUrl = `${SITE_URL}/${CONTENT_LOCALE}/idees`
  const canonicalUrl = `${indexUrl}/${slug}`
  const listName = t(`lists.${slug}.name`)

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    inLanguage: CONTENT_LOCALE,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    image: [`${SITE_URL}${ideasOgImage(meta.gameId)}`],
    publisher: {
      '@type': 'Organization',
      name: 'Le Pillaveur',
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512x512.png`,
    },
    about: game
      ? { '@type': 'Game', name: game.title, url: `${SITE_URL}/${CONTENT_LOCALE}${game.path}` }
      : undefined,
  }
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumb.home'), item: `${SITE_URL}/${CONTENT_LOCALE}` },
      { '@type': 'ListItem', position: 2, name: t('breadcrumb.ideas'), item: indexUrl },
      { '@type': 'ListItem', position: 3, name: listName, item: canonicalUrl },
    ],
  }

  return (
    // Contenu 100 % français servi aussi sous /en, /es et /it : la langue
    // déclarée est celle du texte, pas celle de l'URL.
    <div lang={CONTENT_LOCALE} className="mx-auto min-h-screen max-w-3xl px-4 py-8 pb-24 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([article, breadcrumbs]) }}
      />
      <Link
        href="/idees"
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('backToIdeas')}
      </Link>

      {/* Le jeu d'où viennent les cartes, avant la liste : un seul bouton
          vers la page du jeu. L'essai avec des bots des règles (TryBotsGate)
          repoussait la liste sous le pli sur téléphone, or c'est elle qu'on
          vient lire. */}
      {game && (
        <div className="mb-6 rounded-2xl border border-gold/20 bg-felt-deep/80 p-5 text-center">
          <p className="font-display text-base font-bold text-cream">{t('cardsFrom', { game: game.title })}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-gold/70">
            {bounds
              ? `${bounds.max ? t('players', { min: bounds.min, max: bounds.max }) : t('playersFrom', { min: bounds.min })} · `
              : ''}
            {t('showcaseFacts')}
            {` · ${game.onlineReady ? t('online') : t('oneDevice')}`}
          </p>
          <div className="mx-auto mt-3 max-w-sm">
            {playable ? (
              <Link href={game.path} className={PLAY_LINK_CLASS}>
                <Play className="h-4 w-4" aria-hidden />
                {t('playWithCards')}
              </Link>
            ) : (
              <p lang={locale} className="text-sm font-semibold text-cream/80">
                {tCommon('gameUnavailable.title')}
              </p>
            )}
          </div>
          <Link
            href={`/regles/${game.id}`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-amber-300"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
            {t('readRules', { game: game.title })}
          </Link>
        </div>
      )}

      <article className="rounded-2xl border border-gold/10 bg-felt-deep/60 p-6 sm:p-10">
        {renderMarkdown(content)}
      </article>

      {game && playable && (
        <div className="mt-6 text-center">
          <Link href={game.path} className={PLAY_LINK_CLASS}>
            <Play className="h-4 w-4" aria-hidden />
            {t('playWithCards')}
          </Link>
        </div>
      )}

      <nav aria-label={t('otherLists')} className="mt-8 border-t border-white/10 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">{t('otherLists')}</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {IDEAS_SLUGS.filter((other) => other !== slug).map((other) => (
            <li key={other}>
              <Link href={`/idees/${other}`} className="text-white/50 hover:text-amber-300">
                {t(`lists.${other}.name`)}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/idees" className="font-semibold text-gold/80 hover:text-amber-300">
              {t('backToIdeas')}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
