"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X, Home, Trophy, User, Gamepad2, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useBrowserCapabilities } from '@/components/providers/BrowserCapabilitiesProvider'
import { FullscreenButton } from '@/components/ui/fullscreen-button'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/joueurs', label: 'Joueurs', icon: User, description: 'Gérer les joueurs' },
  { href: '/jeux', label: 'Jeux', icon: Gamepad2, description: 'Choisir un jeu' },
  { href: '/classement', label: 'Classement', icon: Trophy, description: 'Voir les scores' },
  { href: '/compte', label: 'Compte', icon: Home, description: 'Paramètres' },
]

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { capabilities } = useBrowserCapabilities()
  const pathname = usePathname()

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!drawerOpen) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [drawerOpen])

  // Ferme le drawer à la navigation
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  const MenuButton = (
    <button
      aria-label="Ouvrir le menu"
      onClick={() => setDrawerOpen(true)}
      className={cn(
        'fixed left-3 top-3 z-[60] flex h-9 w-9 items-center justify-center rounded-xl',
        'border border-white/10 bg-black/60 text-amber-300 backdrop-blur-md',
        'shadow-[0_2px_12px_rgba(0,0,0,0.4)]',
        'transition-all duration-200 hover:border-amber-400/40 hover:bg-amber-500/15 hover:shadow-[0_0_16px_rgba(245,158,11,0.2)]',
        'active:scale-95'
      )}
    >
      <Menu className="h-4 w-4" />
    </button>
  )

  const Drawer = (
    <>
      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Panneau */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        className={cn(
          'fixed left-0 top-0 z-[55] flex h-full w-72 max-w-[85vw] flex-col',
          'border-r border-white/[0.07] bg-[#0c0b12]/95 backdrop-blur-xl',
          'shadow-[4px_0_40px_rgba(0,0,0,0.6)]',
          'transform transition-transform duration-300 ease-out',
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Halos déco */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-8 -top-8 h-40 w-40 rounded-full bg-amber-500/10 blur-[60px]" />
          <div className="absolute bottom-16 right-0 h-32 w-32 rounded-full bg-violet-500/10 blur-[50px]" />
        </div>

        {/* Header */}
        <div className="relative flex items-center justify-between border-b border-white/[0.07] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-sm shadow-lg">
              🍺
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">Le Pillaveur</p>
              <p className="mt-0.5 text-[10px] text-white/40">Jeux à boire</p>
            </div>
          </div>
          <button
            aria-label="Fermer le menu"
            onClick={() => setDrawerOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/30">
            Navigation
          </p>
          <ul className="space-y-1">
            {navLinks.map(({ href, label, icon: Icon, description }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <li key={href}>
                  <Link
                    href={href}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-150',
                      isActive
                        ? 'bg-amber-500/15 text-amber-100 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.25)]'
                        : 'text-white/70 hover:bg-white/[0.06] hover:text-white'
                    )}
                  >
                    <span className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                      isActive
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-white/[0.06] text-white/50 group-hover:bg-white/10 group-hover:text-white/80'
                    )}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-none">{label}</p>
                      <p className="mt-0.5 truncate text-[11px] opacity-50">{description}</p>
                    </div>
                    <ChevronRight className={cn(
                      'h-3.5 w-3.5 shrink-0 transition-all',
                      isActive ? 'text-amber-400/60' : 'text-white/20 group-hover:text-white/40'
                    )} />
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="relative border-t border-white/[0.07] p-3">
          <FullscreenButton className="w-full justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-sm text-white/60 hover:bg-white/[0.08] hover:text-white" />
        </div>
      </aside>
    </>
  )

  if (!mounted) return <>{MenuButton}</>

  return (
    <>
      {MenuButton}
      {Drawer}
    </>
  )
}
