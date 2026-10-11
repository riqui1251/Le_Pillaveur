import type { Metadata } from 'next'
import { Suspense } from 'react'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ArrowLeft, Users, WifiOff } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { OfflineRetryButton } from '@/components/pwa/OfflineRetryButton'
import { offlinePlayableGames } from '@/lib/offline/offline-routes'

/**
 * Page de repli du service worker : servie depuis son cache quand une page
 * demandée SANS réseau n'y est pas (compte, tables en ligne, règles…). Elle
 * dit ce qui reste jouable — les jeux « un seul téléphone », avec les joueurs
 * de l'appareil — et propose de réessayer la page voulue (`?from=`, posé par
 * le worker : src/lib/offline/sw-script.ts).
 *
 * Composant SERVEUR rendu au build par langue, publique (middleware) : le
 * worker la précharge à son installation, avec le hub et les pages de jeu.
 * Hors sitemap et non indexée — elle n'a de sens que sans réseau.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'offline' })
  return {
    title: t('title'),
    robots: { index: false, follow: false },
  }
}

export default async function OfflinePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'offline' })
  const tCatalog = await getTranslations({ locale, namespace: 'games.catalog' })
  const games = offlinePlayableGames()

  return (
    <main className="relative flex min-h-[70vh] flex-1 flex-col items-center px-4 py-10 text-center text-cream sm:py-14">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]" />
      </div>

      <div className="relative w-full max-w-lg">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10">
          <WifiOff className="h-8 w-8 text-gold" aria-hidden />
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold text-cream sm:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-base text-white/75">{t('lead')}</p>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-white/60">{t('body')}</p>

        {/* useSearchParams (page voulue) réclame sa frontière Suspense : sans
            elle, le rendu statique de la page échouerait au build. */}
        <Suspense fallback={null}>
          <OfflineRetryButton label={t('retry')} />
        </Suspense>

        <section aria-labelledby="offline-games" className="mt-8 text-left">
          <h2
            id="offline-games"
            className="mb-2 flex items-center gap-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75"
          >
            <span className="shrink-0">{t('gamesTitle')}</span>
            <span aria-hidden className="h-px flex-1 bg-gold/15" />
          </h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {games.map((game) => (
              <li key={game.id}>
                <Link
                  href={game.path}
                  prefetch={false}
                  className="flex min-h-12 items-center gap-2 rounded-xl border border-gold/20 bg-felt-deep/60 px-3 py-2 text-sm font-semibold text-cream transition-colors hover:border-gold/50"
                >
                  <span aria-hidden className="text-lg leading-none">
                    {game.emoji}
                  </span>
                  <span className="min-w-0 truncate">{tCatalog(`${game.id}.title`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <nav className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm">
          <Link
            href="/joueurs"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-white/70 transition-colors hover:text-cream"
          >
            <Users className="h-4 w-4" aria-hidden />
            {t('players')}
          </Link>
          <Link
            href="/jeux"
            prefetch={false}
            className="inline-flex items-center gap-1.5 text-white/70 transition-colors hover:text-cream"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('backToGames')}
          </Link>
        </nav>
      </div>
    </main>
  )
}
