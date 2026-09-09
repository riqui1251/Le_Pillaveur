import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
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
import { SITE_URL } from '@/lib/site'

/**
 * Pages « règles » SEO — un article par jeu en ligne (contenu français,
 * voir docs/rules/fr/). Rendu 100 % serveur, liées depuis la landing et le
 * sitemap : c'est le maillage long-tail (« règles loup garou en ligne »…).
 */

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
  const canonical = `/fr/regles/${gameId}`
  return {
    // Titre SANS le suffixe « — Le Pillaveur » du layout : les titres RULES_META
    // dépassaient 60 caractères et étaient tronqués dans Google.
    title: { absolute: meta.title },
    description: meta.description,
    // Contenu 100 % français servi sous les 4 locales : une seule version
    // canonique (/fr) pour consolider le signal (ex. /it/regles/purple :
    // 106 impressions avec un extrait français, 0 clic).
    alternates: { canonical },
    openGraph: {
      title: meta.title,
      description: meta.description,
      url: canonical,
    },
  }
}

export default async function RulesPage({
  params,
}: {
  params: Promise<{ gameId: string }>
}) {
  const { gameId } = await params
  if (!isRulesGameId(gameId)) notFound()
  const content = loadRulesDoc(gameId)
  if (!content) notFound()
  const game = GAMES.find((g) => g.id === gameId)
  const meta = RULES_META[gameId]
  const canonicalUrl = `${SITE_URL}/fr/regles/${gameId}`

  // Données structurées de l'article de règles : le canonical est /fr, la
  // langue déclarée doit l'être aussi (voir le `lang="fr"` plus bas). `about`
  // rattache l'article au jeu décrit, ce qui manquait complètement.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.description,
    inLanguage: 'fr',
    url: canonicalUrl,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    publisher: { '@type': 'Organization', name: 'Le Pillaveur', url: SITE_URL },
    about: game
      ? {
          '@type': 'Game',
          name: game.title,
          url: `${SITE_URL}/fr${game.path}`,
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

  return (
    // Contenu 100 % FRANÇAIS servi aussi sous /en, /es et /it : sans ce
    // `lang`, le document annonçait de l'anglais (ou de l'espagnol…) sur du
    // texte français — faute pour un moteur comme pour un lecteur d'écran.
    // Le middleware et le préfixe d'URL, eux, ne bougent pas.
    <div lang="fr" className="mx-auto min-h-screen max-w-3xl px-4 py-8 pb-24 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80"
      >
        <ArrowLeft className="h-4 w-4" />
        Le Pillaveur
      </Link>

      {/* Le jeu se vend AVANT l'article : faits + « Essayer avec des bots »
          (le CTA n'apparaissait qu'après ~50 lignes de règles). Textes FR
          assumés : ces pages sont canoniques /fr. */}
      {game && (
        <div className="mb-6 rounded-2xl border border-gold/20 bg-felt-deep/80 p-5 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gold/70">
            {game.minPlayers && game.maxPlayers
              ? `${game.minPlayers}–${game.maxPlayers} joueurs · `
              : ''}
            gratuit · sans installation
            {game.onlineReady ? ' · chat vocal' : ''}
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
            <Play className="h-4 w-4" />
            Jouer maintenant — c&apos;est gratuit
          </Link>
        </div>
      )}

      <nav className="mt-8 border-t border-white/10 pt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/40">
          Les règles des autres jeux
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {RULES_GAME_IDS.filter((id) => id !== gameId).map((id) => (
            <li key={id}>
              <Link href={`/regles/${id}`} className="text-white/50 hover:text-amber-300">
                {GAMES.find((g) => g.id === id)?.title ?? id}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
