"use client"

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, X, Home, Trophy, User } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useBrowserCapabilities } from '@/components/providers/BrowserCapabilitiesProvider'
import { FullscreenButton } from '@/components/ui/fullscreen-button'

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { capabilities } = useBrowserCapabilities()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Fermer le drawer au clic extérieur ou navigation
  useEffect(() => {
    if (drawerOpen) {
      const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false) }
      document.addEventListener('keydown', onEsc)
      return () => document.removeEventListener('keydown', onEsc)
    }
  }, [drawerOpen])

  const navLinks = [
    { href: '/', label: 'Accueil', icon: <Home className="h-4 w-4" /> },
    { href: '/joueurs', label: 'Joueurs', icon: <User className="h-4 w-4" /> },
    { href: '/jeux', label: 'Jeux', icon: <Home className="h-4 w-4" /> },
    { href: '/classement', label: 'Classement', icon: <Trophy className="h-4 w-4" /> },
    { href: '/compte', label: 'Compte', icon: <User className="h-4 w-4" /> },
  ]

  // Bouton flottant en haut-gauche pour ouvrir le drawer
  const LauncherButton = (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Ouvrir le menu"
      className="fixed top-3 left-3 z-[60] menu-button bg-gray-900/80 border border-gray-800 text-amber-300 hover:bg-amber-500/20"
      onClick={() => setDrawerOpen(true)}
    >
      <Menu className="h-5 w-5" />
    </Button>
  )

  // Drawer latéral + overlay
  const Drawer = (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 backdrop-blur-[1px] transition-opacity duration-300 ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setDrawerOpen(false)}
      />
      {/* Panneau */}
      <aside
        className={`fixed top-0 left-0 z-[55] h-full w-72 max-w-[85%] bg-gray-900 border-r border-gray-800 shadow-xl transform transition-transform duration-300 ease-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <span>👥</span>
            <span>Menu</span>
          </div>
          <Button variant="ghost" size="icon" aria-label="Fermer" onClick={() => setDrawerOpen(false)} className="text-amber-300 hover:bg-amber-500/20">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <nav className="p-3 space-y-2">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className="w-full px-4 py-3 rounded-md text-base font-medium flex items-center gap-3 transition-colors bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
            >
              {link.icon}
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-3 border-t border-gray-800">
          <FullscreenButton className="w-full justify-center text-amber-300 hover:bg-amber-500/20" />
        </div>
      </aside>
    </>
  )

  // Fallback: mêmes éléments (bouton + drawer), compatible devices limités
  if (capabilities?.isMobile && !capabilities.advancedAnimations) {
    return (
      <>
        {LauncherButton}
        {Drawer}
      </>
    )
  }

  // État non monté: afficher seulement le bouton (pas d’animation SSR)
  if (!mounted) {
    return (
      <>
        {LauncherButton}
      </>
    )
  }

  // Par défaut: bouton + drawer animé
  return (
    <>
      {LauncherButton}
      {Drawer}
    </>
  )
}