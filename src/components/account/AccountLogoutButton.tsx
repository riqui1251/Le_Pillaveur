"use client"

import { useRef, useState, type ReactNode, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, LogOut, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { revealElement } from '@/components/online/FirstStepsCard'
import { useAuth } from '@/hooks/useAuth'
import { ORPHAN_GUEST_INACTIVITY_DAYS } from './guest-retention'

/**
 * Bouton de déconnexion (son allure vient de l'appelant). Déconnexion d'un
 * INVITÉ : son cookie de session est sa seule clé (ni email, ni mot de
 * passe, ni Google). Se déconnecter le rend inaccessible pour toujours — on
 * le dit avant, avec la sortie « sauvegarder » en premier, qui mène à
 * `saveTargetRef` (l'enveloppe de la carte GuestUpgradeCard).
 */
export function AccountLogoutButton({
  className,
  children,
  ariaLabel,
  saveTargetRef,
}: {
  className?: string
  children: ReactNode
  ariaLabel?: string
  saveTargetRef: RefObject<HTMLElement | null>
}) {
  const t = useTranslations('account')
  const tCommon = useTranslations('common')
  const tAuthErrors = useTranslations('auth.errors')
  const { user, logout } = useAuth()

  const [confirmGuestLogout, setConfirmGuestLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  // Posé par « Sauvegarder mon compte » : à la fermeture de la confirmation,
  // le focus va à la carte de pérennisation au lieu de revenir au bouton.
  const goToUpgradeOnCloseRef = useRef(false)

  const logoutGuestAnyway = async () => {
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await logout()
      setConfirmGuestLogout(false)
    } catch {
      setLogoutError(tAuthErrors('network'))
    } finally {
      setLoggingOut(false)
    }
  }

  const onGuestLogoutCloseAutoFocus = (event: Event) => {
    if (!goToUpgradeOnCloseRef.current) return
    goToUpgradeOnCloseRef.current = false
    event.preventDefault()
    // Image suivante : le verrou de défilement de la modale est levé.
    window.requestAnimationFrame(() => revealElement(saveTargetRef.current))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (user?.isGuest) {
            setLogoutError(null)
            setConfirmGuestLogout(true)
            return
          }
          void logout()
        }}
        aria-label={ariaLabel}
        className={className}
      >
        {children}
      </button>

      <Dialog
        open={confirmGuestLogout}
        onOpenChange={(open) => {
          if (loggingOut) return
          setConfirmGuestLogout(open)
        }}
      >
        {/* Sans la croix (cible de 16 px sur téléphone, libellé non traduit) :
            un vrai bouton Annuler la remplace. Échap reste actif hors envoi —
            le composant le bloque dès que la croix est retirée, d'où ce
            gestionnaire explicite. */}
        <DialogContent
          showCloseButton={false}
          onEscapeKeyDown={(event) => {
            if (loggingOut) event.preventDefault()
          }}
          className="border-gold/25 bg-felt-deep text-white"
          onCloseAutoFocus={onGuestLogoutCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle className="font-display text-cream">{t('guestLogout.title')}</DialogTitle>
            <DialogDescription className="text-white/70">
              {t('guestLogout.body', { days: ORPHAN_GUEST_INACTIVITY_DAYS })}
            </DialogDescription>
          </DialogHeader>
          {logoutError && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {logoutError}
            </p>
          )}
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              onClick={() => {
                goToUpgradeOnCloseRef.current = true
                setConfirmGuestLogout(false)
              }}
              disabled={loggingOut}
              className="h-auto min-h-[44px] w-full whitespace-normal rounded-2xl bg-amber-500 font-bold text-black hover:bg-amber-400"
            >
              <ShieldCheck className="mr-2 h-4 w-4 shrink-0" />
              {/* Même libellé que le bouton de la carte vers laquelle il mène. */}
              {t('guestUpgrade.submit')}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void logoutGuestAnyway()
              }}
              disabled={loggingOut}
              className="h-auto min-h-[44px] w-full whitespace-normal rounded-2xl border-red-500/40 bg-transparent text-red-300 hover:bg-red-500/10 hover:text-red-200"
            >
              <LogOut className="mr-2 h-4 w-4 shrink-0" />
              {loggingOut ? tCommon('loading') : t('guestLogout.logoutAnyway')}
            </Button>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={loggingOut}
                className="h-auto min-h-[44px] w-full whitespace-normal rounded-2xl text-white/70 hover:bg-white/10 hover:text-white"
              >
                {tCommon('cancel')}
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
