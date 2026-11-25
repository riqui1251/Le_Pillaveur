"use client"

// Pseudo animé, cadre et Collection : ces styles ne sont servis qu'aux
// segments qui en ont besoin (compte, jeux, TV) — la feuille s'ouvre depuis
// n'importe quelle page, ils arrivent donc avec elle.
import '@/styles/online-cosmetics.css'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import {
  ChevronRight,
  LogOut,
  Mail,
  Shield,
  SlidersHorizontal,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { AmbianceModeToggle } from '@/components/auth/AmbianceModeToggle'
import { GuestUpgradeCard } from '@/components/auth/GuestUpgradeCard'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { OnlinePlayerIcon } from '@/components/online/OnlinePlayerTag'
import { FridayReminderSetting } from '@/components/ui/FridayReminderSetting'
import { PlayingCard } from '@/components/ui/PlayingCard'
import { useAuth } from '@/hooks/useAuth'
import { canAccessSupervision } from '@/lib/roles'
import { cn } from '@/lib/utils'
import { ACCOUNT_ROW_CLASS } from './account-row'
import { AccountCodeButton } from './AccountCodeButton'
import { AccountLogoutButton } from './AccountLogoutButton'
import type { AccountSheetProps } from './AccountSheets'
import { BottomSheet } from './BottomSheet'
import { DeleteAccountSection } from './DeleteAccountSection'
import { GuestExpiryNotice } from './GuestExpiryNotice'
import { AccountOnlineCollection, OnlineProfileEditor, useOnlineIdentity } from './OnlineProfileEditor'

/**
 * « Mon compte » en feuille du bas, ouverte depuis la barre ou l'accueil :
 * l'essentiel du compte sans quitter la page. Chaque réglage s'enregistre
 * seul, comme sur /compte ; tables, amis et joueurs locaux restent sur la
 * page complète, à une ligne d'ici.
 */
export function AccountSheet({ open, onOpenChange }: AccountSheetProps) {
  const t = useTranslations('account')
  const { user, loading } = useAuth()

  // Déconnexion (ici ou dans un autre onglet) : plus rien à montrer.
  useEffect(() => {
    if (open && !loading && !user) onOpenChange(false)
  }, [open, loading, user, onOpenChange])

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={t('sheet.eyebrow')}
      title={t('title')}
      description={t('sheet.description')}
    >
      {user && <AccountSheetContent onNavigate={() => onOpenChange(false)} />}
    </BottomSheet>
  )
}

/** Contenu de la feuille, monté à chaque ouverture (Radix démonte le contenu fermé). */
export function AccountSheetContent({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations('account')
  const tNav = useTranslations('nav')
  const tAmbiance = useTranslations('hub.ambianceMode')
  const { user } = useAuth()
  const [customizing, setCustomizing] = useState(false)
  const upgradeCardRef = useRef<HTMLDivElement>(null)

  if (!user) return null

  return (
    <>
      <AccountIdentityCard />

      <div className="space-y-3.5">
        {/* Invité : la sauvegarde du compte passe avant tout le reste, comme
            sur /compte — c'est sa seule protection contre la purge. */}
        {user.isGuest && <GuestExpiryNotice />}
        {/* Cible de « Sauvegarder mon compte » (confirmation de déconnexion
            d'un invité). `empty:hidden` : la carte ne rend rien pour un
            compte déjà enregistré, l'enveloppe vide ne doit pas creuser
            d'espace. */}
        <div ref={upgradeCardRef} tabIndex={-1} className="scroll-mt-4 outline-none empty:hidden">
          <GuestUpgradeCard />
        </div>

        <SheetGroup icon={UserRound} title={t('sheet.profileTitle')}>
          <OnlineProfileEditor variant="sheet" onCustomize={() => setCustomizing(true)} />
        </SheetGroup>

        <SheetGroup icon={SlidersHorizontal} title={t('sheet.preferencesTitle')}>
          <div className="space-y-1.5">
            <p className="text-[13px] font-bold text-white/75">{tAmbiance('label')}</p>
            <AmbianceModeToggle />
          </div>
          <div className="space-y-1.5">
            <p className="text-[13px] font-bold text-white/75">{t('sheet.language')}</p>
            <LanguageSwitcher className="h-12 w-full rounded-xl border-white/40 bg-white/5 text-base text-white" />
          </div>
          {/* Un invité n'a nulle part où recevoir le rappel. */}
          {user.email && !user.isGuest && <FridayReminderSetting />}
        </SheetGroup>

        <Link href="/achievements" onClick={onNavigate} className={ACCOUNT_ROW_CLASS}>
          <Trophy className="h-4 w-4 shrink-0 text-amber-300" />
          {tNav('pages.achievements.title')}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/40" />
        </Link>
        <Link href="/compte" onClick={onNavigate} className={ACCOUNT_ROW_CLASS}>
          <Users className="h-4 w-4 shrink-0 text-amber-300" />
          {t('sheet.fullAccount')}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/40" />
        </Link>
        {canAccessSupervision(user.role) && (
          <Link href="/supervision" onClick={onNavigate} className={ACCOUNT_ROW_CLASS}>
            <Shield className="h-4 w-4 shrink-0 text-amber-300" />
            {t('supervision')}
            <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-white/40" />
          </Link>
        )}

        <AccountLogoutButton className={ACCOUNT_ROW_CLASS} saveTargetRef={upgradeCardRef}>
          <LogOut className="h-4 w-4 shrink-0 text-amber-300" />
          {t('logout')}
        </AccountLogoutButton>

        <DeleteAccountSection />
      </div>

      <AccountOnlineCollection open={customizing} onOpenChange={setCustomizing} />
    </>
  )
}

/** Carte d'identité du compte : une carte à jouer, as de pique, encre sur crème. */
function AccountIdentityCard() {
  const t = useTranslations('account')
  const { user } = useAuth()
  const { cosmetics, progression } = useOnlineIdentity()
  if (!user) return null

  const caption = user.isGuest
    ? t('sheet.cardGuest')
    : progression
      ? t('sheet.cardLevel', { level: progression.level })
      : t('brand')

  return (
    <PlayingCard suit="spade" rank="A">
      <div className="flex items-center gap-3.5 px-7 py-4">
        <OnlinePlayerIcon
          cosmetics={cosmetics}
          className={cn(
            'h-14 w-14 bg-felt text-3xl',
            // Un cadre équipé porte déjà son anneau (box-shadow) : on ne le recouvre pas.
            !cosmetics.preferences.iconFrame && 'shadow-md ring-[3px] ring-inset ring-gold'
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-semibold uppercase tracking-widest text-[#6B6455]">{caption}</p>
          <p className="mt-0.5 truncate font-display text-2xl font-bold text-[#24201A]" title={user.displayName}>
            {user.displayName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-[#6B6455]">
            {user.accountCode && (
              <AccountCodeButton
                code={user.accountCode}
                className="relative before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
              />
            )}
            {user.email ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="min-w-0 break-all">{user.email}</span>
              </span>
            ) : (
              user.isGuest && <span>{t('sheet.noEmail')}</span>
            )}
          </div>
        </div>
      </div>
    </PlayingCard>
  )
}

function SheetGroup({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-[18px] border border-white/10 bg-white/[0.03] p-3.5"
    >
      <h3 id={titleId} className="flex items-center gap-2 text-[15px] font-extrabold text-cream">
        <Icon className="h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  )
}
