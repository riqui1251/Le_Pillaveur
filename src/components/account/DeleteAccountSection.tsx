"use client"

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { AlertTriangle, ChevronDown, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { NativeGoogleButton } from '@/components/auth/NativeGoogleButton'
import { OAuthButtons } from '@/components/auth/OAuthButtons'
import { useAuth } from '@/hooks/useAuth'
import { apiErrorMessage } from '@/lib/api-response'
import { GOOGLE_CLIENT_ID, getGoogleAccountsId } from '@/lib/google-auth'
import { isNativeGoogleAvailable } from '@/lib/native-google-login'
import { takeOAuthErrorFromUrl, type OAuthProvider } from '@/lib/oauth'
import { cn } from '@/lib/utils'
import { ACCOUNT_ROW_CLASS } from './account-row'
import { deleteErrorKey, parseDeleteProbe, type DeleteMethod } from './delete-account'

/**
 * Zone de danger : suppression du compte (droit à l'effacement), repliée
 * derrière sa ligne. Bouton en deux temps ; preuve exigée selon le compte
 * (mot de passe, Google ou Discord / Facebook, ou la seule session d'un
 * invité).
 */
export function DeleteAccountSection() {
  const t = useTranslations('account')
  const tCommon = useTranslations('common')
  const tApiErrors = useTranslations('onlineLobby.errors')
  const locale = useLocale()
  const { user } = useAuth()
  // Les effets réseau ne dépendent que de l'identité du compte, pas de
  // l'objet `user` (nouvelle référence à chaque rafraîchissement de session).
  const userId = user?.id

  const [open, setOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteArmed, setDeleteArmed] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletingAccount, setDeletingAccount] = useState(false)
  // Le profil /api/auth/me ne dit pas si le compte a un mot de passe : c'est
  // la route elle-même qui répond (sonde GET), déclenchée à l'ouverture de
  // la zone de danger.
  const [deleteMethod, setDeleteMethod] = useState<DeleteMethod | null>(null)
  const [deleteProviders, setDeleteProviders] = useState<OAuthProvider[]>([])

  // Refus renvoyé par le retour Discord / Facebook d'une suppression.
  useEffect(() => {
    const code = takeOAuthErrorFromUrl('delete')
    if (!code) return
    setOpen(true)
    setDeleteError(
      code === 'founder_protected'
        ? t('deleteAccount.founderProtected')
        : apiErrorMessage(code, tApiErrors, t('deleteAccount.genericError'))
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lu une fois, au montage
  }, [])

  useEffect(() => {
    if (!open || !userId || deleteMethod) return
    let cancelled = false
    fetch('/api/auth/delete-account', { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        const probe = parseDeleteProbe(data)
        setDeleteMethod(probe.method)
        setDeleteProviders(probe.providers)
      })
      .catch(() => {
        if (!cancelled) setDeleteMethod('password')
      })
    return () => {
      cancelled = true
    }
  }, [open, userId, deleteMethod])

  const handleDeleteAccount = async (credential?: string) => {
    setDeletingAccount(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credential ? { credential } : { password: deletePassword }),
      })
      if (res.ok) {
        // Compte supprimé, session invalidée côté serveur : repartir de zéro.
        window.location.href = '/'
        return
      }
      const data = await res.json().catch(() => ({}))
      setDeleteError(t(`deleteAccount.${deleteErrorKey(data?.code)}`))
      setDeleteArmed(false)
    } finally {
      setDeletingAccount(false)
    }
  }

  // ── Confirmation Google (GIS, flux ID token) — même montage que AuthForm
  // et la carte de pérennisation. Dans l'app mobile (webview), GIS est
  // bloqué : fenêtre Google native. Le bouton n'est monté qu'une fois la
  // suppression armée, donc jamais en même temps que celui de
  // GuestUpgradeCard (réservé aux invités, qui n'ont pas de compte Google).
  const [nativeGoogle, setNativeGoogle] = useState(false)
  useEffect(() => {
    setNativeGoogle(isNativeGoogleAvailable())
  }, [])
  const googleButtonRef = useRef<HTMLDivElement>(null)
  const googleCallbackRef = useRef<(credential: string) => void>(() => {})
  useEffect(() => {
    googleCallbackRef.current = (credential: string) => {
      void handleDeleteAccount(credential)
    }
  })

  const googleConfirmVisible = deleteMethod === 'google' && deleteArmed
  useEffect(() => {
    if (!googleConfirmVisible || nativeGoogle) return
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
        // Même largeur que les boutons Discord / Facebook juste dessous.
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
      document.head.appendChild(script)
    }
    script.addEventListener('load', render)
    return () => {
      cancelled = true
      script?.removeEventListener('load', render)
    }
  }, [locale, googleConfirmVisible, nativeGoogle])

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(ACCOUNT_ROW_CLASS, 'border-red-500/20 text-red-200/80 hover:bg-red-500/10')}
      >
        <Trash2 className="h-4 w-4 shrink-0 text-red-400" />
        {t('deleteAccount.title')}
        <ChevronDown
          className={cn('ml-auto h-4 w-4 shrink-0 text-red-300/40 transition-transform', open && 'rotate-180')}
        />
      </button>
      <div className={cn('mt-3 space-y-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4', !open && 'hidden')}>
        <p className="text-sm text-red-100/70">{t('deleteAccount.warning')}</p>
        {/* Champ mot de passe UNIQUEMENT pour un compte qui en a un : sur un
            compte Google (ou invité) il resterait vide et bloquerait tout. */}
        {deleteMethod === 'password' && (
          <Input
            type="password"
            value={deletePassword}
            onChange={(e) => {
              setDeletePassword(e.target.value)
              setDeleteArmed(false)
              setDeleteError(null)
            }}
            placeholder={t('deleteAccount.passwordPlaceholder')}
            autoComplete="current-password"
            className="border-red-500/20 bg-black/20 text-white placeholder:text-white/30"
          />
        )}
        {deleteError && (
          <p className="flex items-center gap-2 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {deleteError}
          </p>
        )}
        {googleConfirmVisible ? (
          /* Compte Google armé : la confirmation EST la connexion Google
             (le jeton obtenu est posté à la place du mot de passe). */
          <div className="space-y-2">
            <p className="text-sm text-red-100/70">
              {deleteProviders.length > 0
                ? t('deleteAccount.externalConfirmHint')
                : t('deleteAccount.googleConfirmHint')}
            </p>
            {nativeGoogle ? (
              <NativeGoogleButton
                disabled={deletingAccount}
                onCredential={(credential) => googleCallbackRef.current(credential)}
              />
            ) : (
              <div ref={googleButtonRef} className="flex min-h-[44px] justify-center" />
            )}
            {deleteProviders.length > 0 && (
              <OAuthButtons
                intent="delete"
                providers={deleteProviders}
                disabled={deletingAccount}
                onError={setDeleteError}
              />
            )}
            <button
              type="button"
              onClick={() => setDeleteArmed(false)}
              className="min-h-[44px] w-full rounded-2xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-white/60 transition-colors hover:bg-white/[0.06]"
            >
              {tCommon('cancel')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!deleteArmed) {
                setDeleteArmed(true)
                return
              }
              void handleDeleteAccount()
            }}
            disabled={!deleteMethod || deletingAccount || (deleteMethod === 'password' && !deletePassword)}
            className={cn(
              'flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-40',
              deleteArmed
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'border border-red-500/40 bg-transparent text-red-300 hover:bg-red-500/10'
            )}
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            {deletingAccount
              ? t('deleteAccount.deleting')
              : deleteArmed
                ? t('deleteAccount.confirm')
                : t('deleteAccount.button')}
          </button>
        )}
      </div>
    </section>
  )
}
