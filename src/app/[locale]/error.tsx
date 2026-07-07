'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
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

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '600px',
        margin: '0 auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <h1 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>{t('title')}</h1>

      <p style={{ marginBottom: '1rem', lineHeight: '1.5' }}>{t('description')}</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 15px',
            backgroundColor: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          {t('retry')}
        </button>

        <Link
          href="/"
          style={{
            padding: '10px 15px',
            backgroundColor: '#333',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 'bold',
            textDecoration: 'none',
            textAlign: 'center',
          }}
        >
          {t('home')}
        </Link>
      </div>

      <div style={{ marginTop: '20px', fontSize: '0.875rem', color: '#666' }}>
        <p>{t('tipsTitle')}</p>
        <ul style={{ paddingLeft: '20px', lineHeight: '1.5' }}>
          <li>{t('tipRefresh')}</li>
          <li>{t('tipCache')}</li>
          <li>{t('tipConnection')}</li>
        </ul>
      </div>
    </div>
  )
}
