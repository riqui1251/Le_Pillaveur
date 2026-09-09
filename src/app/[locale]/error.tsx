'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Home, LayoutGrid, RotateCcw } from 'lucide-react'
import { Link } from '@/i18n/navigation'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('errors.page')

  useEffect(() => {
    console.error(t('logPrefix'), error)
  }, [error, t])

  // Chunk périmé après un redéploiement : le navigateur avait l'ancienne
  // version ouverte et demande des fichiers JS/CSS qui n'existent plus sur
  // le serveur. Un rechargement suffit — on le fait automatiquement, avec
  // une garde sessionStorage pour ne jamais boucler si l'erreur persiste.
  useEffect(() => {
    const msg = `${error?.name ?? ''} ${error?.message ?? ''}`
    const isStaleChunk =
      /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i.test(
        msg
      )
    if (!isStaleChunk) return
    try {
      const KEY = 'lp-chunk-reload-at'
      const last = Number(window.sessionStorage.getItem(KEY) ?? 0)
      if (Date.now() - last < 30_000) return // déjà tenté : on laisse l'écran s'afficher
      window.sessionStorage.setItem(KEY, String(Date.now()))
    } catch {
      return
    }
    window.location.reload()
  }, [error])

  // Écran rendu sous le layout de langue : feutre, or et Playfair comme
  // partout ailleurs (l'ancienne version était en styles en ligne gris/indigo,
  // hors identité, et n'offrait aucune sortie vers le hub des jeux).
  return (
    <main className="relative flex min-h-[70vh] flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-suit-red/10 blur-[110px]" />
      </div>

      <div className="relative w-full max-w-md">
        <h1 className="font-display text-2xl font-bold text-cream sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-cream/60">{t('description')}</p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gold px-6 text-base font-bold text-felt-deep transition-colors hover:bg-gold-strong sm:w-auto"
          >
            <RotateCcw className="h-4 w-4" />
            {t('retry')}
          </button>
          <Link
            href="/"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gold/30 px-6 text-base font-semibold text-cream transition-colors hover:border-gold/60 hover:text-gold sm:w-auto"
          >
            <Home className="h-4 w-4" />
            {t('home')}
          </Link>
          <Link
            href="/jeux"
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-gold/30 px-6 text-base font-semibold text-cream transition-colors hover:border-gold/60 hover:text-gold sm:w-auto"
          >
            <LayoutGrid className="h-4 w-4" />
            {t('games')}
          </Link>
        </div>

        <div className="mt-10 rounded-2xl border border-gold/10 bg-felt-deep/60 p-5 text-left text-xs text-cream/50">
          <p className="font-semibold uppercase tracking-wide text-gold/70">{t('tipsTitle')}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
            <li>{t('tipRefresh')}</li>
            <li>{t('tipCache')}</li>
            <li>{t('tipConnection')}</li>
          </ul>
        </div>

        {error?.digest ? (
          <p className="mt-4 text-[11px] text-cream/30">{t('digest', { digest: error.digest })}</p>
        ) : null}
      </div>
    </main>
  )
}
