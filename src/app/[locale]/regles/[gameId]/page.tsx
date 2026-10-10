import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, Play } from 'lucide-react'
import { renderMarkdown } from '@/lib/legal/render-markdown'
import { RULES_GAME_IDS, isRulesGameId, loadRulesDoc } from '@/lib/rules/rules-content'
import { GAMES } from '@/lib/games'
import { TryBotsGate } from '@/components/online/TryBotsGate'
import { SITE_NAME, buildAlternates, buildOpenGraphLocale } from '@/lib/seo/alternates'
import { SITE_URL } from '@/lib/site'

/**
 * Pages « règles » SEO — un article par jeu en ligne et par langue (voir
 * docs/rules/<langue>/, le français faisant référence). Rendues UNE fois au
 * build (un HTML par jeu et par langue, croisement avec les langues du
 * layout), liées depuis la landing, l'index /regles et le sitemap : c'est le
 * maillage long-tail (« règles loup garou en ligne », « werewolf rules
 * online »…).
 */

/**
 * Carte de partage peinte pour CE jeu (même route que les pages de jeu,
 * src/lib/seo/game-seo.tsx) : un lien de règles partagé sur WhatsApp ou
 * Discord montrait la carte générique du site — ou rien. Chemin relatif
 * (metadata, résolue contre metadataBase) ; le JSON-LD la veut absolue.
 */
function rulesOgImage(gameId: string, locale: string): string {
  return `/api/og?type=game&game=${encodeURIComponent(gameId)}&locale=${locale}`
}

export function generateStaticParams() {
  return RULES_GAME_IDS.map((gameId) => ({ gameId }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; gameId: string }>
}): Promise<Metadata> {
  const { locale, gameId } = await params
  if (!isRulesGameId(gameId)) return {}
  const t = await getTranslations({ locale, namespace: `rules.articles.${gameId}` })
  const title = t('title')
  const description = t('description')
  const alternates = buildAlternates(`/regles/${gameId}`, locale)
  const ogImage = rulesOgImage(gameId, locale)
  const images = [{ url: ogImage, width: 1200, height: 630, alt: title }]
  return {
    // Titre SANS le suffixe « — Le Pillaveur » du layout : les titres
    // d'articles dépassaient 60 caractères et étaient tronqués dans Google.
    title: { absolute: title },
    description,
    // Un article traduit par langue : canonical auto-référent + hreflang,
    // comme toute page publique (le sitemap porte les mêmes).
    alternates,
    // L'openGraph de la page remplace celui du layout en entier : type, nom
    // du site, locale et alternates reposés ici.
    openGraph: {
      type: 'article',
      siteName: SITE_NAME,
      ...buildOpenGraphLocale(locale),
      title,
      description,
      url: alternates.canonical,
      images,
    },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  }
}

export default async function RulesPage({
  params,
}: {
  params: Promise<{ locale: string; gameId: string }>
}) {
  const { locale, gameId } = await params
  // AVANT toute sortie : les <Link> serveur ci-dessous (et la 404 localisée,
  // si notFound() part d'ici) lisent la langue posée là, pas les en-têtes de
  // la requête — condition du rendu au build.
  setRequestLocale(locale)
  if (!isRulesGameId(gameId)) notFound()
  const content = loadRulesDoc(gameId, locale)
  if (!content) notFound()
  const game = GAMES.find((g) => g.id === gameId)
  const t = await getTranslations({ locale, namespace: 'rules' })
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  const meta = { title: t(`articles.${gameId}.title`), description: t(`articles.${gameId}.description`) }
  const gameTitle = (id: string) => (GAMES.some((g) => g.id === id) ? tCatalog(`${id}.title`) : id)
  const rulesIndexUrl = `${SITE_URL}/${locale}/regles`
  const canonicalUrl = `${rulesIndexUrl}/${gameId}`

  // Données structurées de l'article de règles, dans la langue de l'URL
  // (canonical auto-référent, article traduit). `about`
  // rattache l'article au jeu décrit, ce qui manquait complètement ; `image`
  // (la carte du jeu) et le logo de l'éditeur sont ce que Google recommande
  // pour un Article — même logo que l'Organization du layout de langue.
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    inLanguage: locale,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    image: [`${SITE_URL}${rulesOgImage(gameId, locale)}`],
    publisher: {
      '@type': 'Organization',
      name: 'Le Pillaveur',
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512x512.png`,
    },
    about: game
      ? {
          '@type': 'Game',
          name: gameTitle(game.id),
          url: `${SITE_URL}/${locale}${game.path}`,
          ...(game.minPlayers && game.maxPlayers
            ? {
                numberOfPlayers: {
                  '@type': 'QuantitativeValue',
                  minValue: game.minPlayers,
                  maxValue: game.maxPlayers,
                },
              }
            : {}),
        }
      : undefined,
  }
  // Fil d'Ariane Accueil › Règles › <jeu> : le même chemin que l'index
  // /regles déclare, pour que Google relie les dix-sept articles à leur mère.
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('breadcrumb.home'), item: `${SITE_URL}/${locale}` },
      { '@type': 'ListItem', position: 2, name: t('breadcrumb.rules'), item: rulesIndexUrl },
      { '@type': 'ListItem', position: 3, name: game ? gameTitle(game.id) : meta.title, item: canonicalUrl },
    ],
  }

  return (
    // `lang` de l'URL : chaque article existe dans les quatre langues (le
    // test rules-consistency l'exige), le repli français n'est qu'un filet.
    <div lang={locale} className="mx-auto min-h-screen max-w-3xl px-4 py-8 pb-24 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([article, breadcrumbs]) }}
      />
      {/* Retour vers l'index des règles, pas vers la racine : c'est de là
          qu'un lecteur passe d'un jeu à l'autre. */}
      <Link
        href="/regles"
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('backToRules')}
      </Link>

      {/* Le jeu se vend AVANT l'article : faits + « Essayer avec des bots »
          (le CTA n'apparaissait qu'après ~50 lignes de règles). L'effectif
          vient du registre (src/lib/games.ts), jamais de l'article : c'est la
          borne que le lobby applique, et un test tient l'article aligné. */}
      {game && (
        <div className="mb-6 rounded-2xl border border-gold/20 bg-felt-deep/80 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold/70">
            {game.minPlayers && game.maxPlayers
              ? `${t('players', { min: game.minPlayers, max: game.maxPlayers })} · `
              : ''}
            {t('showcaseFacts')}
            {game.onlineReady ? ` · ${t('voiceChat')}` : ''}
          </p>
          <div className="mx-auto mt-3 max-w-sm">
            <TryBotsGate gameId={game.id} />
          </div>
        </div>
      )}

      <article className="rounded-2xl border border-gold/10 bg-felt-deep/60 p-6 sm:p-10">
        {renderMarkdown(content)}
      </article>

      {game && (
        <div className="mt-6 text-center">
          <Link
            href={game.path}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-600 px-8 text-base font-bold text-white shadow-lg shadow-amber-500/25 transition-all hover:from-amber-400 hover:to-orange-500"
          >
            <Play className="h-4 w-4" aria-hidden />
            {t('playNow')}
          </Link>
        </div>
      )}

      <nav aria-label={t('otherRules')} className="mt-8 border-t border-white/10 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
          {t('otherRules')}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {RULES_GAME_IDS.filter((id) => id !== gameId).map((id) => (
            <li key={id}>
              <Link href={`/regles/${id}`} className="text-white/50 hover:text-amber-300">
                {gameTitle(id)}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/regles" className="font-semibold text-gold/80 hover:text-amber-300">
              {t('backToRules')}
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  )
}
