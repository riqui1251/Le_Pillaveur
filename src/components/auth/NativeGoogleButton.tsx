"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { nativeGoogleSignIn } from '@/lib/native-google-login'

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

/**
 * Remplaçant du bouton GIS DANS l'app mobile : ouvre la fenêtre Google
 * native (plugin de la coquille Capacitor) puis remonte l'ID token au
 * parent, qui le poste à la même route que le flux web.
 */
export function NativeGoogleButton({
  onCredential,
  disabled,
}: {
  onCredential: (credential: string) => void
  disabled?: boolean
}) {
  const t = useTranslations('auth.googleNative')
  const [busy, setBusy] = useState(false)
  // Message technique remonté par la couche native : indispensable pour
  // diagnostiquer à distance (pas de console accessible dans la webview).
  const [failure, setFailure] = useState<string | null>(null)

  const handleClick = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const credential = await nativeGoogleSignIn()
      if (credential) onCredential(credential)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setFailure(detail.slice(0, 180))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || busy}
        className="flex h-11 w-full max-w-[300px] items-center justify-center gap-3 rounded-full border border-black/10 bg-white px-6 text-sm font-medium text-[#3c4043] shadow-sm transition hover:bg-[#f8f9fa] disabled:opacity-60"
      >
        <GoogleG />
        {t('button')}
      </button>
      {failure && (
        <div className="max-w-[300px] text-center">
          <p className="text-xs font-semibold text-red-300">{t('error')}</p>
          <p className="mt-0.5 break-words font-mono text-[10px] text-red-300/70">{failure}</p>
        </div>
      )}
    </div>
  )
}
