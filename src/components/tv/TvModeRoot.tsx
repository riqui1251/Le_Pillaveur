"use client"

import { useEffect } from 'react'

/** Classe posée sur <html> tant que le composant est monté, retirée en le quittant (voir src/styles/tv.css). */
export function useHtmlClass(name: string) {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add(name)
    return () => root.classList.remove(name)
  }, [name])
}

/**
 * Échelle TV (src/styles/tv.css) active tant qu'une page TV est montée,
 * retirée en la quittant. Le layout TV pose déjà la classe avant tout bundle ;
 * ce composant la maintient après une navigation côté client, où ce script
 * inline ne se rejoue pas.
 */
export function TvModeRoot() {
  useHtmlClass('tv-mode')
  return null
}
