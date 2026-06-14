"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, User, Gamepad2, ChevronRight, Shield } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canAccessSupervision } from '@/lib/roles'
import { getPageMeta } from '@/lib/nav-meta'
import { FullscreenButton } from '@/components/ui/fullscreen-button'
import { FeedbackDialog, FeedbackMenuButton } from '@/components/feedback/FeedbackDialog'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/joueurs', label: 'Joueurs', icon: User, description: 'Gérer les joueurs' },
  { href: '/jeux', label: 'Jeux', icon: Gamepad2, description: 'Choisir un jeu' },
  { href: '/compte', label: 'Compte', icon: Home, description: 'Paramètres' },
]

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const { user } = useAuth()
  const pathname = usePathname()
  const pageMeta = getPageMeta(pathname)

  const links = useMemo(() => {
    const base = [...navLinks]
    if (user && canAccessSupervision(user.role)) {
      base.push({
        href: '/supervision',
        label: 'Supervision',
        icon: Shield,
        description: 'Dashboard admin',
      })
    }
    return base
  }, [user])

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
  }, [pathname])

  const toggleDrawer = () => setDrawerOpen((open) => !open)

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-[#0c0b12]/85 backdrop-blur-xl supports-[backdrop-filter]:bg-[#0c0b12]/70">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-3 sm:h-[3.75rem] sm:gap-4 sm:px-4">
          <button
            type="button"
            aria-label={drawerOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
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

          <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-sm shadow-md sm:h-10 sm:w-10">
              🍺
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-white sm:text-base">
                {mounted ? pageMeta.title : 'Le Pillaveur'}
              </p>
              <p className="truncate text-[10px] text-white/45 sm:text-xs">
                {mounted ? pageMeta.subtitle : 'Chargement…'}
              </p>
            </div>
          </div>

          {activeHref && (
            <span className="hidden rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-200/90 sm:inline-block">
              {links.find((l) => l.href === activeHref)?.label}
            </span>
          )}
        </div>
      </header>

      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden={!drawerOpen}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        className={cn(
          'fixed left-0 top-0 z-[55] flex h-full w-72 max-w-[85vw] flex-col',
          'border-r border-white/[0.07] bg-[#0c0b12]/98 backdrop-blur-xl',
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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-sm shadow-lg">
              🍺
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">Le Pillaveur</p>
              <p className="mt-0.5 text-[10px] text-white/40">Menu de navigation</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setDrawerOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="relative flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Navigation
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

        <div className="relative border-t border-white/[0.07] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
          <FeedbackMenuButton
            onClick={() => {
              setDrawerOpen(false)
              setFeedbackOpen(true)
            }}
          />
          <FullscreenButton className="w-full justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/60 hover:bg-white/[0.08] hover:text-white" />
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-white/30">
            <Link href="/legal/cgu" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              CGU
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/confidentialite" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              Confidentialité
            </Link>
            <span aria-hidden>·</span>
            <Link href="/legal/mentions-legales" onClick={() => setDrawerOpen(false)} className="hover:text-amber-400/80">
              Mentions légales
            </Link>
          </div>
        </div>
      </aside>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </>
  )
}
