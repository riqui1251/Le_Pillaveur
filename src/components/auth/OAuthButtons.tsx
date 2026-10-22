"use client"

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { apiErrorMessage } from '@/lib/api-response'
import { readLocalAmbianceMode } from '@/lib/ambiance-mode'
import { isCapacitorApp } from '@/lib/native-app'
import { isOAuthProvider, type OAuthIntent, type OAuthProvider } from '@/lib/oauth'

const PROVIDER_LABEL: Record<OAuthProvider, string> = { discord: 'Discord', facebook: 'Facebook', apple: 'Apple' }

// Couleurs et logos officiels des marques (chartes Discord, Meta et Apple).
const PROVIDER_STYLE: Record<OAuthProvider, string> = {
  discord: 'bg-[#5865F2] hover:bg-[#4752C4]',
  facebook: 'bg-[#1877F2] hover:bg-[#166FE5]',
  apple: 'border border-white/25 bg-black hover:bg-neutral-900',
}

function ProviderLogo({ provider }: { provider: OAuthProvider }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 shrink-0" fill="currentColor">
      {provider === 'apple' ? (
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
      ) : provider === 'discord' ? (
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      ) : (
        <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
      )}
    </svg>
  )
}

// Une seule question au serveur par chargement de page, partagée par tous les boutons.
let enabledProvidersPromise: Promise<OAuthProvider[]> | null = null

function fetchEnabledProviders(): Promise<OAuthProvider[]> {
  if (!enabledProvidersPromise) {
    enabledProvidersPromise = fetch('/api/auth/oauth', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { providers?: unknown } | null) =>
        Array.isArray(data?.providers) ? data.providers.filter(isOAuthProvider) : []
      )
      .catch(() => {
        enabledProvidersPromise = null
        return []
      })
  }
  return enabledProvidersPromise
}

/**
 * Boutons « Continuer avec Discord / Facebook / Apple », sous le bouton Google.
 *
 * Absents de l'app mobile : la webview de la coquille ouvre les sites tiers
 * dans le navigateur du téléphone, d'où le retour ne reviendrait pas dans
 * l'app (et Facebook refuse toute connexion dans une webview embarquée).
 *
 * `providers` restreint la liste (suppression : seuls les services liés au
 * compte peuvent la confirmer) ; sinon, les fournisseurs configurés.
 */
export function OAuthButtons({
  intent,
  redirect,
  providers,
  disabled,
  onError,
}: {
  intent: OAuthIntent
  redirect?: string
  providers?: OAuthProvider[]
  disabled?: boolean
  onError: (message: string) => void
}) {
  const t = useTranslations('auth.oauth')
  const tApiErrors = useTranslations('onlineLobby.errors')
  const tAuthErrors = useTranslations('auth.errors')
  const locale = useLocale()
  const [enabled, setEnabled] = useState<OAuthProvider[]>([])
  const [busy, setBusy] = useState<OAuthProvider | null>(null)

  useEffect(() => {
    if (isCapacitorApp()) return
    let cancelled = false
    void fetchEnabledProviders().then((list) => {
      if (!cancelled) setEnabled(list)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Retour arrière depuis le fournisseur : la page revient du cache tel
  // qu'elle était partie, bouton occupé compris.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(null)
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  const shown = providers ? enabled.filter((provider) => providers.includes(provider)) : enabled
  if (shown.length === 0) return null

  const start = async (provider: OAuthProvider) => {
    setBusy(provider)
    try {
      const res = await fetch(`/api/auth/oauth/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ intent, redirect, locale, ambianceMode: readLocalAmbianceMode() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || typeof data?.url !== 'string') {
        onError(apiErrorMessage(data?.code ?? data?.error, tApiErrors, tAuthErrors('generic')))
        setBusy(null)
        return
      }
      // Le bouton reste occupé : la page s'en va chez le fournisseur.
      window.location.assign(data.url)
    } catch {
      onError(tAuthErrors('network'))
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {shown.map((provider) => (
        <button
          key={provider}
          type="button"
          onClick={() => void start(provider)}
          disabled={disabled || busy !== null}
          className={`flex min-h-[44px] w-full max-w-[300px] items-center justify-center gap-2.5 rounded-full px-5 text-sm font-semibold text-white transition-colors disabled:opacity-60 ${PROVIDER_STYLE[provider]}`}
        >
          <ProviderLogo provider={provider} />
          {busy === provider
            ? t('redirecting')
            : t(intent === 'delete' ? 'confirmWith' : 'continueWith', { provider: PROVIDER_LABEL[provider] })}
        </button>
      ))}
    </div>
  )
}
