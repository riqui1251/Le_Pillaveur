"use client"

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/providers/AuthProvider'
import { GOOGLE_CLIENT_ID, getGoogleAccountsId } from '@/lib/google-auth'
import { isNativeGoogleAvailable } from '@/lib/native-google-login'
import { NativeGoogleButton } from '@/components/auth/NativeGoogleButton'
import { LogIn, UserPlus, Gamepad2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { validateAccountDisplayName, nameValidationI18nKey } from '@/lib/name-moderation'
import { reportProfanityIfNeeded } from '@/lib/name-moderation-attempt-client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function safeRedirect(path: string | null): string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return '/joueurs'
  if (path.startsWith('/compte')) return '/joueurs'
  return path
}

export function AuthForm() {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const tNav = useTranslations('nav.legal')
  const { login, register, refresh } = useAuth()
  const searchParams = useSearchParams()
  const redirectTo = safeRedirect(searchParams?.get('redirect') ?? null)

  // Navigation DOCUMENT (pas SPA) après établissement de session : le cache
  // de préchargement du routeur peut contenir la redirection « pas de
  // session » mémorisée AVANT l'auth (préchargée depuis /jeux, invisible en
  // dev où le prefetch est coupé) — un router.push consommerait cette entrée
  // et rebondirait sur /compte malgré le cookie. Le rechargement complet
  // repart d'un routeur vierge et le middleware voit la session fraîche.
  const goToApp = () => {
    window.location.assign(`/${locale}${redirectTo}`)
  }

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')

  // Premier passage sur cet appareil (flag « lp-has-logged-in » jamais posé) :
  // le visiteur du funnel est un NOUVEAU — on ouvre sur l'inscription plutôt
  // que la connexion (bascule toujours possible d'un clic). En useEffect pour
  // rester SSR-safe ; le flag est posé à chaque auth réussie ci-dessous.
  useEffect(() => {
    try {
      if (!window.localStorage.getItem('lp-has-logged-in')) setMode('register')
    } catch {
      // stockage indisponible — on garde la connexion par défaut
    }
  }, [])

  // Mémorise qu'une session a déjà existé sur cet appareil (voir ci-dessus).
  const rememberHasLoggedIn = () => {
    try {
      window.localStorage.setItem('lp-has-logged-in', '1')
    } catch {
      // stockage indisponible — au pire, le prochain passage rouvrira l'inscription
    }
  }
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [localLoading, setLocalLoading] = useState(false)

  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotMessage, setForgotMessage] = useState<string | null>(null)
  const [forgotError, setForgotError] = useState<string | null>(null)
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (mode === 'register' && !acceptedTerms) {
      setError(t('register.termsRequired'))
      return
    }
    if (mode === 'register') {
      const validation = validateAccountDisplayName(displayName)
      if (!validation.ok) {
        void reportProfanityIfNeeded(displayName, validation.reason, 'register')
        setError(tCommon(`nameValidation.${nameValidationI18nKey(validation.reason)}`))
        return
      }
    }
    setLoading(true)
    try {
      const err = mode === 'login'
        ? await login(email, password)
        : await register(email, password, displayName, locale)
      if (err) {
        setError(err)
      } else {
        rememberHasLoggedIn()
        goToApp()
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Connexion Google (Google Identity Services, flux ID token) ──
  // Le bouton officiel est rendu par le script GIS dans ce conteneur ; le
  // callback est stocké dans une ref pour éviter les fermetures périmées
  // (initialize n'est appelé qu'une fois par montage).
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const googleCallbackRef = useRef<(credential: string) => void>(() => {})

  // Dans l'app mobile, Google bloque le bouton GIS (webview) : on bascule
  // sur la fenêtre Google native. Détection après montage (SSR-safe).
  const [nativeGoogle, setNativeGoogle] = useState(false)
  useEffect(() => {
    setNativeGoogle(isNativeGoogleAvailable())
  }, [])

  useEffect(() => {
    googleCallbackRef.current = async (credential: string) => {
      setError(null)
      setLoading(true)
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ credential, locale }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          setError(data?.error ?? t('errors.generic'))
          return
        }
        await refresh()
        rememberHasLoggedIn()
        goToApp()
      } catch {
        setError(t('errors.generic'))
      } finally {
        setLoading(false)
      }
    }
  })

  useEffect(() => {
    if (nativeGoogle) return
    let cancelled = false
    const render = () => {
      if (cancelled) return
      const gis = getGoogleAccountsId()
      const parent = googleButtonRef.current
      if (!gis || !parent) return
      gis.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response.credential) googleCallbackRef.current(response.credential)
        },
      })
      parent.innerHTML = ''
      gis.renderButton(parent, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 300,
        locale,
      })
    }
    if (getGoogleAccountsId()) {
      render()
      return
    }
    const src = 'https://accounts.google.com/gsi/client'
    let script = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`)
    if (!script) {
      script = document.createElement('script')
      script.src = src
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', render)
    return () => {
      cancelled = true
      script?.removeEventListener('load', render)
    }
  }, [locale, nativeGoogle])

  const handleLocalPlay = async () => {
    setLocalLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/local-play', { method: 'POST', credentials: 'include' })
      if (!res.ok) throw new Error(t('localPlay.errorActivate'))
      goToApp()
    } catch {
      setError(t('localPlay.errorRetry'))
    } finally {
      setLocalLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotError(null)
    setForgotMessage(null)
    setForgotLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      })
      if (res.status >= 500) {
        setForgotError(t('errors.serviceUnavailable'))
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setForgotError(data?.error ?? t('errors.generic'))
        return
      }
      setForgotMessage(t('forgot.success'))
    } catch {
      setForgotError(t('errors.network'))
    } finally {
      setForgotLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-300/70">
          {t('brand')}
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          {mode === 'login' ? t('login.title') : t('register.title')}
        </h1>
        <p className="mt-2 text-sm text-white/50">
          {mode === 'login' ? t('login.subtitle') : t('register.subtitle')}
        </p>
      </div>

      <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(null) }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'login' ? 'bg-amber-500/20 text-amber-100' : 'text-white/50 hover:text-white/80'
          }`}
        >
          <LogIn className="h-4 w-4" />
          {t('login.tab')}
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(null) }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${
            mode === 'register' ? 'bg-amber-500/20 text-amber-100' : 'text-white/50 hover:text-white/80'
          }`}
        >
          <UserPlus className="h-4 w-4" />
          {t('register.tab')}
        </button>
      </div>

      {/* Google D'ABORD : c'est le chemin sans friction (zéro champ) — le
          formulaire email reste dessous pour qui n'a pas de compte Google. */}
      <div className="space-y-3">
        {nativeGoogle ? (
          <NativeGoogleButton
            disabled={loading}
            onCredential={(credential) => googleCallbackRef.current(credential)}
          />
        ) : (
          <div ref={googleButtonRef} className="flex min-h-[44px] justify-center" />
        )}
        <div className="flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-white/10" />
          <span className="text-xs uppercase tracking-wide text-white/35">{t('orDivider')}</span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-md">
        {mode === 'register' && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-white/60">{t('register.displayNameLabel')}</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('register.displayNamePlaceholder')}
              maxLength={30}
              required
              className="border-white/10 bg-white/[0.05] text-white"
            />
          </div>
        )}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/60">{t('emailLabel')}</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('emailPlaceholder')}
            required
            className="border-white/10 bg-white/[0.05] text-white"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-white/60">{t('passwordLabel')}</label>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email)
                  setForgotOpen(true)
                  setForgotMessage(null)
                  setForgotError(null)
                }}
                className="text-xs text-amber-300/70 hover:text-amber-200"
              >
                {t('login.forgotPassword')}
              </button>
            )}
          </div>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'register' ? t('register.passwordPlaceholder') : t('passwordPlaceholderLogin')}
            required
            minLength={mode === 'register' ? 8 : 1}
            className="border-white/10 bg-white/[0.05] text-white"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        {mode === 'register' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <Checkbox
              checked={acceptedTerms}
              onCheckedChange={(v) => setAcceptedTerms(v === true)}
              className="mt-0.5 border-white/30 data-[state=checked]:bg-amber-500 data-[state=checked]:text-black"
            />
            <span className="text-xs leading-relaxed text-white/60">
              {t('register.termsPrefix')}{' '}
              <Link href="/legal/cgu" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
                {tNav('cgu')}
              </Link>{' '}
              {t('register.termsAnd')}{' '}
              <Link href="/legal/confidentialite" className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
                {tNav('confidentialite')}
              </Link>
              {t('register.termsSuffix')}
            </span>
          </label>
        )}

        <Button
          type="submit"
          disabled={loading || (mode === 'register' && !acceptedTerms)}
          className="w-full bg-amber-500 text-black hover:bg-amber-400"
        >
          {loading
            ? tCommon('loading')
            : mode === 'login'
              ? t('login.submit')
              : t('register.submit')}
        </Button>
      </form>

      <div className="space-y-3 text-center">
        <p className="text-xs text-white/35">{t('localPlay.hint')}</p>
        <p className="text-xs text-white/30">
          {t('localPlay.termsPrefix')}{' '}
          <Link href="/legal/cgu" className="text-amber-400/80 underline underline-offset-2 hover:text-amber-300">
            {tNav('cgu')}
          </Link>{' '}
          {t('localPlay.termsAnd')}{' '}
          <Link href="/legal/confidentialite" className="text-amber-400/80 underline underline-offset-2 hover:text-amber-300">
            {tNav('confidentialite')}
          </Link>
          {t('localPlay.termsSuffix')}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={localLoading}
          onClick={handleLocalPlay}
          className="w-full border-white/15 bg-transparent text-white/70 hover:bg-white/[0.06] hover:text-white"
        >
          <Gamepad2 className="mr-2 h-4 w-4" />
          {localLoading ? tCommon('loading') : t('localPlay.button')}
        </Button>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="border-white/10 bg-felt-deep text-white">
          <DialogHeader>
            <DialogTitle>{t('forgot.title')}</DialogTitle>
            <DialogDescription className="text-white/50">
              {t('forgot.description')}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <Input
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              required
              className="border-white/10 bg-white/[0.05] text-white"
            />
            {forgotError && (
              <p className="rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">{forgotError}</p>
            )}
            {forgotMessage && (
              <p className="rounded-lg bg-emerald-500/15 px-3 py-2 text-sm text-emerald-300">{forgotMessage}</p>
            )}
            <DialogFooter>
              <Button
                type="submit"
                disabled={forgotLoading || Boolean(forgotMessage)}
                className="bg-amber-500 text-black hover:bg-amber-400"
              >
                {forgotLoading ? tCommon('sending') : t('forgot.submit')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
