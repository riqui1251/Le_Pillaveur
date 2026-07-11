"use client"

import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import { useFriends } from '@/hooks/useFriends'
import { cn } from '@/lib/utils'

/**
 * Barre d'onglets mobile « Cartes sur Table » : Tables · Amis · Palmarès ·
 * Compte, fixée en bas d'écran (mobile uniquement — le header suffit en
 * desktop). L'onglet actif est en or, marqué d'un filet. Elle s'efface dès
 * qu'on est à une table (lobby/partie), sur la TV et en supervision : là,
 * tout l'écran appartient au jeu.
 *
 * « Amis » n'est pas une page : l'onglet ouvre le panneau des amis de la
 * Navbar via l'évènement `lp:open-friends` (état local à la Navbar).
 */

/** Routes où la barre disparaît (préfixes, pathname sans locale). */
const HIDDEN_PREFIXES = ['/tv', '/games', '/supervision']

const TABS = [
  { key: 'tables', href: '/jeux', activePrefixes: ['/jeux', '/joueurs'] },
  { key: 'ranking', href: '/classement', activePrefixes: ['/classement'] },
  { key: 'account', href: '/compte', activePrefixes: ['/compte'] },
] as const

function TabLabel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'relative pt-1 text-[11px] font-bold tracking-wide transition-colors',
        active ? 'text-gold' : 'text-cream/50'
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -top-[9px] left-1/2 h-0.5 w-6 -translate-x-1/2 rounded-full bg-gold"
        />
      )}
      {children}
    </span>
  )
}

export function MobileTabBar() {
  const t = useTranslations('nav.tabs')
  const pathname = usePathname()
  const { user } = useAuth()
  const { friends } = useFriends()
  const onlineFriendsCount = friends.filter((f) => f.isOnline).length

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null
  }

  const isActive = (prefixes: readonly string[]) =>
    prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  return (
    <>
      {/* Réserve la hauteur de la barre en bas de page (la barre est fixed). */}
      <div aria-hidden className="h-[calc(3.25rem+env(safe-area-inset-bottom))] sm:hidden" />
      <nav
        aria-label={t('label')}
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t border-gold/20 bg-felt-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        <Link href={TABS[0].href} className="flex flex-1 items-center justify-center py-3.5">
          <TabLabel active={isActive(TABS[0].activePrefixes)}>{t('tables')}</TabLabel>
        </Link>
        {user && (
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('lp:open-friends'))}
            className="relative flex flex-1 items-center justify-center py-3.5"
          >
            <TabLabel active={false}>{t('friends')}</TabLabel>
            {onlineFriendsCount > 0 && (
              <span className="absolute right-[18%] top-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-black">
                {onlineFriendsCount}
              </span>
            )}
          </button>
        )}
        <Link href={TABS[1].href} className="flex flex-1 items-center justify-center py-3.5">
          <TabLabel active={isActive(TABS[1].activePrefixes)}>{t('ranking')}</TabLabel>
        </Link>
        <Link href={TABS[2].href} className="flex flex-1 items-center justify-center py-3.5">
          <TabLabel active={isActive(TABS[2].activePrefixes)}>{t('account')}</TabLabel>
        </Link>
      </nav>
    </>
  )
}
