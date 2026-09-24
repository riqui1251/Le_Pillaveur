import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ArrowLeft, Play } from 'lucide-react'
import { renderMarkdown } from '@/lib/legal/render-markdown'
import {
  RULES_GAME_IDS,
  RULES_META,
  isRulesGameId,
  loadRulesDoc,
} from '@/lib/rules/rules-content'
import { GAMES } from '@/lib/games'
import { TryBotsGate } from '@/components/online/TryBotsGate'
import { OG_LOCALES, SITE_NAME } from '@/lib/seo/alternates'
import { SITE_URL } from '@/lib/site'

/**
 * Pages « règles » SEO — un article par jeu en ligne (contenu français,
 * voir docs/rules/fr/). Rendues UNE fois au build (un HTML par jeu et par
 * langue, croisement avec les langues du layout), liées depuis la landing,
 * l'index /regles et le sitemap : c'est le maillage long-tail (« règles loup
 * garou en ligne »…).
 */

/** Langue de TOUT le contenu de la page : celle des articles (docs/rules/fr/). */
const CONTENT_LOCALE = 'fr'

/**
 * Carte de partage peinte pour CE jeu (même route que les pages de jeu,
 * src/lib/seo/game-seo.tsx) : un lien de règles partagé sur WhatsApp ou
 * Discord montrait la carte générique du site — ou rien. Chemin relatif
 * (metadata, résolue contre metadataBase) ; le JSON-LD la veut absolue.
 */
function rulesOgImage(gameId: string): string {
  return `/api/og?type=game&game=${encodeURIComponent(gameId)}&locale=${CONTENT_LOCALE}`
}

export function generateStaticParams() {
  return RULES_GAME_IDS.map((gameId) => ({ gameId }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ gameId: string }>
}): Promise<Metadata> {
  const { gameId } = await params
  if (!isRulesGameId(gameId)) return {}
  const meta = RULES_META[gameId]
  const canonical = `/${CONTENT_LOCALE}/regles/${gameId}`
  const ogImage = rulesOgImage(gameId)
  const images = [{ url: ogImage, width: 1200, height: 630, alt: meta.title }]
  return {
    // Titre SANS le suffixe « — Le Pillaveur » du layout : les titres RULES_META
    // dépassaient 60 caractères et étaient tronqués dans Google.
    title: { absolute: meta.title },
    description: meta.description,
    // Contenu 100 % français servi sous les 4 locales : une seule version
    // canonique (/fr) pour consolider le signal (ex. /it/regles/purple :
    // 106 impressions avec un extrait français, 0 clic).
    alternates: { canonical },
    // L'openGraph de la page remplace celui du layout en entier : type, nom
    // du site et locale (française seule, sans alternates) reposés ici.
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
  const content = loadRulesDoc(gameId)
  if (!content) notFound()
  const game = GAMES.find((g) => g.id === gameId)
  const meta = RULES_META[gameId]
  // Textes de l'enveloppe en FRANÇAIS quelle que soit l'URL, comme l'article
  // qu'ils encadrent (voir le `lang="fr"` plus bas).
  const t = await getTranslations({ locale: CONTENT_LOCALE, namespace: 'rules' })
  const rulesIndexUrl = `${SITE_URL}/${CONTENT_LOCALE}/regles`
  const canonicalUrl = `${rulesIndexUrl}/${gameId}`

  // Données structurées de l'article de règles : le canonical est /fr, la
  // langue déclarée doit l'être aussi (voir le `lang="fr"` plus bas). `about`
  // rattache l'article au jeu décrit, ce qui manquait complètement ; `image`
  // (la carte du jeu) et le logo de l'éditeur sont ce que Google recommande
  // pour un Article — même logo que l'Organization du layout de langue.
  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    inLanguage: CONTENT_LOCALE,
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    image: [`${SITE_URL}${rulesOgImage(gameId)}`],
    publisher: {
      '@type': 'Organization',
      name: 'Le Pillaveur',
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512x512.png`,
    },
    about: game
      ? {
          '@type': 'Game',
          name: game.title,
          url: `${SITE_URL}/${CONTENT_LOCALE}${game.path}`,
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
      { '@type': 'ListItem', position: 1, name: t('breadcrumb.home'), item: `${SITE_URL}/${CONTENT_LOCALE}` },
      { '@type': 'ListItem', position: 2, name: t('breadcrumb.rules'), item: rulesIndexUrl },
      { '@type': 'ListItem', position: 3, name: game?.title ?? meta.title, item: canonicalUrl },
    ],
  }

  return (
    // Contenu 100 % FRANÇAIS servi aussi sous /en, /es et /it : sans ce
    // `lang`, le document annonçait de l'anglais (ou de l'espagnol…) sur du
    // texte français — faute pour un moteur comme pour un lecteur d'écran.
    // Le middleware et le préfixe d'URL, eux, ne bougent pas.
    <div lang={CONTENT_LOCALE} className="mx-auto min-h-screen max-w-3xl px-4 py-8 pb-24 sm:px-6">
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
                {GAMES.find((g) => g.id === id)?.title ?? id}
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
