import { getTranslations } from 'next-intl/server'
import { Home, LayoutGrid } from 'lucide-react'
import { Link } from '@/i18n/navigation'

/**
 * 404 « Cartes sur Table » — rendue SOUS le layout de langue : elle a donc
 * next-intl, la navbar et le feutre. Sans elle, un lien mort ou une table
 * expirée tombait sur l'écran par défaut de Next (blanc, en anglais, sans
 * aucun moyen de repartir).
 * Pas d'export `metadata` ici : Next ne l'appelle pas sur une page not-found,
 * et le statut 404 suffit à écarter la page des moteurs.
 */
export default async function LocaleNotFound() {
  const t = await getTranslations('errors.notFound')

  return (
    <main className="relative flex min-h-[70vh] flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      {/* Lueur d'or sur le feutre, comme les autres pages publiques. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-gold/10 blur-[110px]" />
      </div>

      <div className="relative">
        {/* Le code HTTP reste en chiffres : rien à traduire. */}
        <p className="font-display text-6xl font-bold text-gold/80 sm:text-7xl">404</p>

        <h1 className="mt-4 font-display text-2xl font-bold text-cream sm:text-3xl">{t('title')}</h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-cream/60">
          {t('description')}
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-gold px-6 text-base font-bold text-felt-deep transition-colors hover:bg-gold-strong"
          >
            <Home className="h-4 w-4" />
            {t('home')}
          </Link>
          <Link
            href="/jeux"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-gold/30 px-6 text-base font-semibold text-cream transition-colors hover:border-gold/60 hover:text-gold"
          >
            <LayoutGrid className="h-4 w-4" />
            {t('games')}
          </Link>
        </div>
      </div>
    </main>
  )
}
