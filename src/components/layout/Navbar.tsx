"use client"

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, X, Home, Trophy, User } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useBrowserCapabilities } from '@/components/providers/BrowserCapabilitiesProvider'
import { FullscreenButton } from '@/components/ui/fullscreen-button'

export default function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { capabilities } = useBrowserCapabilities()

  // Éviter les erreurs d'hydratation en rendant les icônes uniquement côté client
  useEffect(() => {
    setMounted(true)
  }, [])

  // Pour fermer le menu mobile au changement de page
  useEffect(() => {
    if (mobileMenuOpen) {
      // Fermer le menu en cas de clic à l'extérieur
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (!target.closest('.mobile-menu') && !target.closest('.menu-button')) {
          setMobileMenuOpen(false)
        }
      }
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [mobileMenuOpen])

  // Fallback navigation pour les appareils mobiles problématiques
  if (capabilities?.isMobile && !capabilities.advancedAnimations) {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 w-full bg-gray-900 text-white border-b border-gray-800 navbar-container">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <Link href="/" className="text-xl font-bold">Jeux à Boire</Link>
            <div className="flex space-x-2">
              <Link href="/classement" className="px-2 py-1">🏆 Classement</Link>
              <Link href="/compte" className="px-2 py-1">👤 Compte</Link>
              {mounted && <FullscreenButton />}
            </div>
          </div>
        </div>
      </nav>
    )
  }

  // Si le composant n'est pas monté, on affiche une version simplifiée sans contenu dynamique
  if (!mounted) {
    return (
      <nav className="fixed top-0 left-0 right-0 z-50 w-full py-4 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 navbar-container">
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <Link href="/" className="text-xl font-bold text-white">
              Jeux à Boire
            </Link>
            <div className="hidden sm:flex space-x-2">
              <Link 
                href="/classement" 
                className="px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 transition-colors bg-amber-500/20 text-amber-300"
              >
                <span className="h-4 w-4"></span>
                Classement
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden menu-button"
            >
              <span className="h-5 w-5"></span>
            </Button>
          </div>
        </div>
      </nav>
    )
  }

  const navLinks = [
    { href: '/', label: 'Accueil', icon: <Home className="h-4 w-4" /> },
    { href: '/classement', label: 'Classement', icon: <Trophy className="h-4 w-4" /> },
    { href: '/compte', label: 'Compte', icon: <User className="h-4 w-4" /> },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 w-full py-4 bg-gray-900/80 backdrop-blur-sm border-b border-gray-800 navbar-container">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <Link href="/" className="text-xl font-bold text-white">
            Jeux à Boire
          </Link>
          
          {/* Navigation Desktop - visible uniquement sur desktop */}
          <div className="hidden sm:flex space-x-2">
            <Link 
              href="/classement" 
              className="px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 transition-colors bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200"
            >
              <Trophy className="h-4 w-4" />
              Classement
            </Link>
            <Link 
              href="/compte" 
              className="px-3 py-2 rounded-md text-sm font-medium flex items-center gap-1 transition-colors bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:text-amber-200"
            >
              <User className="h-4 w-4" />
              <span>Compte</span>
            </Link>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Bouton plein écran */}
          <FullscreenButton className="text-amber-300 hover:bg-amber-500/30 hover:text-amber-200" />
          
          {/* Bouton menu mobile - visible uniquement sur mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="menu-button sm:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      
      {/* Menu mobile - visible uniquement lorsque mobileMenuOpen est true et sur mobile */}
      {mobileMenuOpen && (
        <div className="mobile-menu sm:hidden fixed inset-x-0 top-[73px] z-50 overflow-hidden transition-all duration-300 ease-in-out">
          <div className="p-4 space-y-2 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
            {navLinks.map(link => (
              <Link 
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="w-full px-4 py-3 rounded-md text-base font-medium flex items-center gap-3 transition-colors bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
              >
                {link.icon}
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
} 