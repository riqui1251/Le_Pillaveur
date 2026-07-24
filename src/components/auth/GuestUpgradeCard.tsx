"use client"

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Check, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/components/providers/AuthProvider'
import { GOOGLE_CLIENT_ID, getGoogleAccountsId } from '@/lib/google-auth'
import { isNativeGoogleAvailable } from '@/lib/native-google-login'
import { NativeGoogleButton } from '@/components/auth/NativeGoogleButton'

/**
 * Pérennisation d'un compte INVITÉ depuis la page Compte : le joueur garde
 * son compte (pseudo, XP, cosmétiques, amis) et lui attache un email + mot
 * de passe OU une connexion Google — il sort ainsi de la purge automatique
 * des invités inactifs.
 */
export function GuestUpgradeCard() {
  const t = useTranslations('account.guestUpgrade')
  const locale = useLocale()
  const { user, refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const upgrade = async (body: Record<string, unknown>) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/guest/upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setError((data as { error?: string } | null)?.error ?? t('genericError'))
        return
      }
      setSaved(true)
      await refresh()
    } catch {
      setError(t('genericError'))
    } finally {
      setBusy(false)
    }
  }

  // ── Bouton Google (GIS, flux ID token) — même montage que AuthForm. ──
  // Dans l'app mobile (webview), GIS est bloqué : fenêtre Google native.
  const [nativeGoogle, setNativeGoogle] = useState(false)
  useEffect(() => {
    setNativeGoogle(isNativeGoogleAvailable())
  }, [])
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const googleCallbackRef = useRef<(credential: string) => void>(() => {})
  useEffect(() => {
    googleCallbackRef.current = (credential: string) => {
      void upgrade({ credential })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
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
      document.head.appendChild(script)
    }
    script.addEventListener('load', render)
    return () => {
      cancelled = true
      script?.removeEventListener('load', render)
    }
  }, [locale, nativeGoogle])

  // La carte se gère seule : visible pour les invités, bannière de succès
  // conservée après le refresh (qui fait passer isGuest à false), invisible
  // pour les comptes déjà enregistrés.
  if (saved) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        <Check className="h-5 w-5 shrink-0 text-emerald-300" />
        <p>{t('success')}</p>
      </div>
    )
  }
  if (!user?.isGuest) return null

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-amber-100">{t('title')}</p>
          <p className="mt-0.5 text-xs text-amber-100/70">{t('intro')}</p>
        </div>
      </div>

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy && email.trim() && password) void upgrade({ email, password, locale })
        }}
      >
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          disabled={busy}
          className="rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
        />
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('passwordPlaceholder')}
          disabled={busy}
          className="rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/30"
        />
        {error && <p className="text-xs font-semibold text-red-300">{error}</p>}
        <Button
          type="submit"
          disabled={busy || !email.trim() || !password}
          className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 py-4 text-sm font-bold"
        >
          {t('submit')}
        </Button>
      </form>

      <div className="my-3 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-white/10" />
        <span className="text-xs uppercase tracking-wide text-white/35">{t('orDivider')}</span>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      {nativeGoogle ? (
        <NativeGoogleButton
          disabled={busy}
          onCredential={(credential) => googleCallbackRef.current(credential)}
        />
      ) : (
        <div ref={googleButtonRef} className="flex min-h-[44px] justify-center" />
      )}
    </div>
  )
}
