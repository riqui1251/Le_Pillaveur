"use client"

import { Link, usePathname } from '@/i18n/navigation'
import { Menu, X, Home, User, Users, Gamepad2, ChevronRight, Shield, MessageCircle, Trophy } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { useAuth } from '@/hooks/useAuth'
import { useFriends } from '@/hooks/useFriends'
import { useChatUnread } from '@/hooks/useChatUnread'
import { canAccessSupervision } from '@/lib/roles'
import { usePageMeta } from '@/lib/nav-meta'
import { FullscreenButton } from '@/components/ui/fullscreen-button'
import { FeedbackDialog, FeedbackMenuButton } from '@/components/feedback/FeedbackDialog'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { FriendsPanel } from '@/components/layout/FriendsPanel'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { BrandMark } from '@/components/brand/BrandLogo'
import { cn } from '@/lib/utils'

const NAV_LINK_KEYS = [
  { href: '/joueurs', key: 'joueurs', icon: User },
  { href: '/jeux', key: 'jeux', icon: Gamepad2 },
  { href: '/classement', key: 'classement', icon: Trophy },
  { href: '/compte', key: 'compte', icon: Home },
] as const

type NavLinkKey = (typeof NAV_LINK_KEYS)[number]['key'] | 'supervision'

type NavLinkItem = {
  href: string
  key: NavLinkKey
  icon: typeof User
  label: string
  description: string
}

export default function Navbar() {
  const t = useTranslations('nav')
  const [mounted, setMounted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const { user } = useAuth()
  const { friends, refresh: refreshFriendsBadge } = useFriends()
  const { unread, refresh: refreshUnread } = useChatUnread()
  const onlineFriendsCount = friends.filter((f) => f.isOnline).length
  const pathname = usePathname()
  const pageMeta = usePageMeta(pathname)

  const links = useMemo((): NavLinkItem[] => {
    const base: NavLinkItem[] = NAV_LINK_KEYS.map(({ href, key, icon }) => ({
      href,
      key,
      icon,
      label: t(`links.${key}.label`),
      description: t(`links.${key}.description`),
    }))
    if (user && canAccessSupervision(user.role)) {
      base.push({
        href: '/supervision',
        key: 'supervision',
        icon: Shield,
        label: t('links.supervision.label'),
        description: t('links.supervision.description'),
      })
    }
    return base
  }, [user, t])

  const activeHref =
    links.find((l) => pathname === l.href || pathname.startsWith(`${l.href}/`))?.href ?? null

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onEsc)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onEsc)
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  useEffect(() => {
    setDrawerOpen(false)
    setFriendsOpen(false)
    setChatOpen(false)
  }, [pathname])

  const toggleDrawer = () => setDrawerOpen((open) => !open)

  // Écran TV : plein écran sans chrome (la barre de nav n'a pas de sens sur une télé).
  if (pathname === '/tv' || pathname.startsWith('/tv/')) {
    return null
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gold/15 bg-felt-deep/85 backdrop-blur-xl supports-[backdrop-filter]:bg-felt-deep/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:h-[3.75rem] sm:gap-4 sm:px-4">
          <button
            type="button"
            aria-label={drawerOpen ? t('closeMenu') : t('openMenu')}
            aria-expanded={drawerOpen}
            onClick={toggleDrawer}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 sm:h-11 sm:w-11',
              drawerOpen
                ? 'border-amber-400/40 bg-amber-500/20 text-amber-200 shadow-[0_0_16px_rgba(245,158,11,0.15)]'
                : 'border-white/10 bg-white/[0.04] text-amber-300 hover:border-amber-400/35 hover:bg-amber-500/10'
            )}
          >
            {drawerOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {user && (
            <button
              type="button"
              aria-label={t('manageFriends')}
              onClick={() => {
                setFriendsOpen((v) => {
                  if (v) void refreshFriendsBadge()
                  return !v
                })
              }}
              className={cn(
                'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 sm:h-11 sm:w-11',
                friendsOpen
                  ? 'border-violet-400/40 bg-violet-500/20 text-violet-200 shadow-[0_0_16px_rgba(139,92,246,0.15)]'
                  : 'border-white/10 bg-white/[0.04] text-violet-300 hover:border-violet-400/35 hover:bg-violet-500/10'
              )}
            >
              <Users className="h-5 w-5" />
              {onlineFriendsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold text-black">
                  {onlineFriendsCount}
                </span>
              )}
            </button>
          )}

          {user && (
            <button
              type="button"
              aria-label={t('chat')}
              onClick={() => setChatOpen((v) => !v)}
              className={cn(
                'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 active:scale-95 sm:h-11 sm:w-11',
                chatOpen
                  ? 'border-sky-400/40 bg-sky-500/20 text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.15)]'
                  : 'border-white/10 bg-white/[0.04] text-sky-300 hover:border-sky-400/35 hover:bg-sky-500/10'
              )}
            >
              <MessageCircle className="h-5 w-5" />
              {unread.total > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {unread.total > 9 ? '9+' : unread.total}
                </span>
              )}
            </button>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold/40 bg-felt-deep p-1 shadow-md sm:h-10 sm:w-10">
              <BrandMark />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-white sm:text-base">
                {mounted ? pageMeta.title : t('brand')}
              </p>
              <p className="truncate text-[10px] text-white/45 sm:text-xs">
                {mounted ? pageMeta.subtitle : t('loading')}
              </p>
            </div>
          </div>

          <LanguageSwitcher className="hidden h-9 w-[7.5rem] shrink-0 border-white/10 bg-white/[0.04] text-white sm:flex" />

          {activeHref && (
            <span className="hidden rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-200/90 sm:inline-block">
              {links.find((l) => l.href === activeHref)?.label}
            </span>
          )}
        </div>
      </header>

      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('menuLabel')}
        className={cn(
          'fixed left-0 top-0 z-[55] flex h-full w-72 max-w-[85vw] flex-col',
          'border-r border-gold/15 bg-felt-deep/[0.98] backdrop-blur-xl',
          'shadow-[4px_0_40px_rgba(0,0,0,0.6)]',
          'transform transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-amber-500/10 blur-[60px]" />
          <div className="absolute bottom-16 right-0 h-32 w-32 rounded-full bg-violet-500/10 blur-[50px]" />
        </div>

        <div className="relative flex items-center justify-between border-b border-white/[0.07] px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/40 bg-felt-deep p-1 shadow-lg">
              <BrandMark />
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">{t('brand')}</p>
              <p className="mt-0.5 text-[10px] text-white/40">{t('menuLabel')}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label={t('closeMenu')}
            onClick={() => setDrawerOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            {t('navigation')}
          </p>
          <ul className="space-y-1">
            {links.map(({ href, label, icon: Icon, description }) => {
              const isActive = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setDrawerOpen(false)}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150',
                      isActive
                        ? 'bg-amber-500/15 text-amber-100 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)]'
                        : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        isActive
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-white/[0.06] text-white/50 group-hover:bg-white/10 group-hover:text-white/80'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-none">{label}</p>
                      <p className="mt-0.5 truncate text-[11px] opacity-50">{description}</p>
                    </div>
                    <ChevronRight
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-all',
                        isActive ? 'text-amber-400/60' : 'text-white/20 group-hover:text-white/40'
                      )}
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="relative space-y-2 border-t border-white/[0.07] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <FeedbackMenuButton
            onClick={() => {
              setDrawerOpen(false)
              setFeedbackOpen(true)
            }}
          />
          <FullscreenButton className="w-full justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/60 hover:bg-white/[0.08] hover:text-white" />
          <LanguageSwitcher className="h-10 w-full border-white/10 bg-white/[0.04] text-white" />
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-white/30">
            <Link href="/legal/cgu" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              {t('legal.cgu')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/confidentialite" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              {t('legal.confidentialite')}
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/mentions-legales" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              {t('legal.mentionsLegales')}
            </Link>
          </div>
        </div>
      </aside>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />

      {user && (
        <FriendsPanel
          open={friendsOpen}
          onClose={() => {
            setFriendsOpen(false)
            void refreshFriendsBadge()
          }}
        />
      )}

      {user && (
        <ChatPanel
          open={chatOpen}
          onClose={() => {
            setChatOpen(false)
            void refreshUnread()
          }}
          unread={unread}
          onRead={refreshUnread}
        />
      )}
    </>
  )
}
