"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from '@/i18n/navigation'
// Pas depuis soiree-ui : ce module lit les textes « soiree », absents du socle des autres pages.
import { scrollPageTop } from '@/lib/scroll-page-top'

/**
 * Pourquoi la feuille de connexion s'ouvre : « online » = le joueur a choisi de
 * jouer en ligne sans compte (accueil, bascule du hub). La feuille l'explique,
 * propose le compte invité et, une fois la session ouverte, pose le mode en
 * ligne avant d'envoyer vers `redirectTo`.
 */
export type AuthSheetReason = 'online'

export type AuthSheetOptions = {
  reason?: AuthSheetReason
  /** Chemin interne (sans langue) où aller une fois connecté ; par défaut, la page courante. */
  redirectTo?: string
  tab?: 'login' | 'register'
}

export type AuthSheetProps = { open: boolean; onOpenChange: (open: boolean) => void; options: AuthSheetOptions }
export type AccountSheetProps = { open: boolean; onOpenChange: (open: boolean) => void }

type AccountSheetsContext = {
  openAuth: (options?: AuthSheetOptions) => void
  openAccount: () => void
  close: () => void
}

const Ctx = createContext<AccountSheetsContext | null>(null)

/**
 * Feuilles chargées à leur première ouverture seulement, comme les panneaux de
 * la barre (Navbar.tsx) : le fournisseur est sur toutes les pages, leur code
 * n'a pas à voyager avec chaque visite. `ssr: false` : fermées au premier rendu.
 */
const AuthSheet = dynamic<AuthSheetProps>(() => import('./AuthSheet').then((m) => m.AuthSheet), { ssr: false })
const AccountSheet = dynamic<AccountSheetProps>(() => import('./AccountSheet').then((m) => m.AccountSheet), { ssr: false })

/**
 * Ouvre la connexion ou « Mon compte » depuis n'importe quelle page (barre,
 * accueil, hub) : une seule feuille à la fois, dont le code n'est téléchargé
 * qu'à sa première ouverture.
 *
 * Sur /compte, la page EST déjà le formulaire de connexion ou le compte : la
 * feuille monterait une seconde fois la carte invité, la suppression et
 * Google Identity Services (initialisation globale : le bouton Google de la
 * page viserait ensuite la feuille démontée). On ramène en haut de la page.
 */
export function AccountSheetsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const onAccountPage = pathname === '/compte'
  const [open, setOpen] = useState<'auth' | 'account' | null>(null)
  const [authOptions, setAuthOptions] = useState<AuthSheetOptions>({})
  const [authMounted, setAuthMounted] = useState(false)
  const [accountMounted, setAccountMounted] = useState(false)

  const openAuth = useCallback((options: AuthSheetOptions = {}) => {
    if (onAccountPage) return scrollPageTop()
    setAuthOptions(options)
    setAuthMounted(true)
    setOpen('auth')
  }, [onAccountPage])
  const openAccount = useCallback(() => {
    if (onAccountPage) return scrollPageTop()
    setAccountMounted(true)
    setOpen('account')
  }, [onAccountPage])
  const close = useCallback(() => setOpen(null), [])

  const value = useMemo(() => ({ openAuth, openAccount, close }), [openAuth, openAccount, close])

  return (
    <Ctx.Provider value={value}>
      {children}
      {authMounted && (
        <AuthSheet open={open === 'auth'} onOpenChange={(next) => setOpen(next ? 'auth' : null)} options={authOptions} />
      )}
      {accountMounted && (
        <AccountSheet open={open === 'account'} onOpenChange={(next) => setOpen(next ? 'account' : null)} />
      )}
    </Ctx.Provider>
  )
}

export function useAccountSheets(): AccountSheetsContext {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAccountSheets doit être appelé sous AccountSheetsProvider')
  return ctx
}
