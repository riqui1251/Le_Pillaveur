"use client"

import { useEffect, useId, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { usePathname } from '@/i18n/navigation'
import { AuthForm, type AuthFormMode } from '@/components/auth/AuthForm'
import { requestAgeVerification } from '@/components/legal/AgeGate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { apiErrorMessage } from '@/lib/api-response'
import { safeAuthRedirect } from '@/lib/auth-redirect'
import { createGuestSession, rejectGuestName } from '@/lib/guest-session-client'
import { BottomSheet } from './BottomSheet'
import type { AuthSheetProps } from './AccountSheets'

/**
 * Connexion / inscription en feuille, depuis n'importe quelle page. Ouverte
 * pour jouer en ligne (`reason: 'online'`), elle dit pourquoi un compte est
 * demandé et propose le compte invité, un pseudo suffit.
 */
export function AuthSheet({ open, onOpenChange, options }: AuthSheetProps) {
  const t = useTranslations('auth')
  const tCommon = useTranslations('common')
  const tPlayMode = useTranslations('hub.playMode')
  const tJoin = useTranslations('joinGate')
  const tApiErrors = useTranslations('onlineLobby.errors')
  const locale = useLocale()
  const { setPlayMode } = useAuth()
  const pathname = usePathname()
  const search = useSearchParams()?.toString() ?? ''

  const online = options.reason === 'online'
  const destination = options.redirectTo ?? `${pathname}${search ? `?${search}` : ''}`
  const [mode, setMode] = useState<AuthFormMode>(options.tab ?? 'login')

  // Hors du contenu de la feuille, que Radix démonte à la fermeture : le
  // pseudo survit au détour par la porte 18+ (voir handleGuest).
  const [guestName, setGuestName] = useState('')
  const [guestError, setGuestError] = useState<string | null>(null)
  const [guestLoading, setGuestLoading] = useState(false)
  const guestInputRef = useRef<HTMLInputElement>(null)
  const guestId = useId()

  // Un lien suivi depuis la feuille (CGU, confidentialité) la referme, comme
  // les panneaux de la barre : elle ne reste pas posée sur la page lue.
  const shownPath = useRef(pathname)
  useEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    if (open) onOpenChange(false)
  }, [pathname, open, onOpenChange])

  const scrollToGuest = () => {
    const input = guestInputRef.current
    if (!input) return
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    input.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    input.focus({ preventScroll: true })
  }

  const handleGuest = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuestError(null)
    const rejection = rejectGuestName(guestName)
    if (rejection) {
      setGuestError(tCommon(`nameValidation.${rejection}`))
      return
    }
    setGuestLoading(true)
    // Le bouton reste en « chargement » seulement si l'on quitte la page.
    let leaving = false
    try {
      const result = await createGuestSession(guestName, locale)
      if (result.kind === 'age-gate') {
        // La porte 18+ ne s'affiche pas d'elle-même sur les pages de lecture
        // (accueil, règles) : on l'ouvre ici, feuille fermée — ouverte, la
        // modale rendrait le portail inerte. L'âge certifié, la feuille
        // revient avec le pseudo ; rien ne se crée sans un nouveau clic.
        onOpenChange(false)
        if (await requestAgeVerification()) onOpenChange(true)
        else setGuestError(tJoin('ageGateRequired'))
        return
      }
      if (result.kind === 'rate-limited') {
        setGuestError(tJoin('rateLimited', { seconds: result.retryAfterSec }))
        return
      }
      if (result.kind === 'refused') {
        setGuestError(apiErrorMessage(result.error, tApiErrors, t('errors.generic')))
        return
      }
      if (result.kind === 'network') {
        setGuestError(t('errors.network'))
        return
      }
      // Échec sans gravité : l'invité naît déjà en ligne côté serveur.
      await setPlayMode('online').catch(() => null)
      leaving = true
      // Navigation DOCUMENT, comme après une connexion (AuthForm, goToApp) :
      // la page repart avec la session fraîche.
      window.location.assign(`/${locale}${safeAuthRedirect(destination)}`)
    } catch {
      setGuestError(t('errors.generic'))
    } finally {
      if (!leaving) setGuestLoading(false)
    }
  }

  const guestErrorId = `${guestId}-error`
  const guestNoteId = `${guestId}-note`

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={t('brand')}
      title={mode === 'register' ? t('register.title') : t('login.title')}
      description={mode === 'register' ? t('register.subtitle') : t('login.subtitle')}
    >
      {online && (
        <div className="flex gap-2.5 rounded-2xl border border-gold/[0.35] bg-gold/10 px-3.5 py-3 text-sm leading-snug text-amber-200">
          <Globe className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-bold">{tPlayMode('onlineNeedsAccount')}</p>
            <p className="mt-0.5">{t('sheet.onlineWhy')}</p>
            <button
              type="button"
              onClick={scrollToGuest}
              className="-mb-2 inline-flex min-h-[44px] items-center rounded text-left font-bold underline underline-offset-4 transition-colors hover:text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              {t('sheet.toGuest')}
            </button>
          </div>
        </div>
      )}

      <AuthForm
        compact
        redirectTo={destination}
        intent={online ? 'online' : undefined}
        initialMode={options.tab}
        onModeChange={setMode}
      />

      {online && (
        <section
          aria-labelledby={`${guestId}-title`}
          className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-gold/40 bg-black/[0.14] p-3.5"
        >
          <h3 id={`${guestId}-title`} className="font-display text-lg font-bold text-cream">
            {t('sheet.guestTitle')}
          </h3>
          <form onSubmit={handleGuest} noValidate className="flex flex-wrap gap-2">
            <label htmlFor={`${guestId}-name`} className="sr-only">
              {tJoin('pseudoPlaceholder')}
            </label>
            <Input
              ref={guestInputRef}
              id={`${guestId}-name`}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder={tJoin('pseudoPlaceholder')}
              maxLength={30}
              autoComplete="nickname"
              aria-invalid={guestError ? true : undefined}
              aria-describedby={guestError ? `${guestErrorId} ${guestNoteId}` : guestNoteId}
              className="h-12 min-w-0 flex-[1_1_12rem] rounded-2xl border-gold/50 bg-black/25 px-3.5 font-semibold text-cream placeholder:font-normal placeholder:text-cream/60 focus-visible:ring-gold focus-visible:ring-offset-felt-deep"
            />
            <Button
              type="submit"
              variant="quiet"
              size="game"
              disabled={guestLoading || guestName.trim().length === 0}
              className="flex-[1_0_auto]"
            >
              {guestLoading ? tCommon('loading') : tJoin('guestCta')}
            </Button>
          </form>
          {guestError && (
            <p id={guestErrorId} role="alert" className="rounded-lg bg-red-500/[0.15] px-3 py-2 text-sm text-red-300">
              {guestError}
            </p>
          )}
          <p id={guestNoteId} className="text-xs leading-snug text-cream/70">
            {tJoin('guestHintDevice')}
          </p>
        </section>
      )}

      <p className="text-center text-xs text-cream/60">{t('localPlay.hint')}</p>
    </BottomSheet>
  )
}
