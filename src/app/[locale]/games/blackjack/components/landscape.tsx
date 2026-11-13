"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { RotateCw, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Le Black Jack en paysage sur téléphone : la demi-lune tient bien mieux dans
 * un écran large. La mise en page bascule dès que le téléphone est tenu en
 * paysage (rotation libre, ou bouton « Paysage » qui passe en plein écran et
 * verrouille l'orientation — Android ; iPhone n'a pas d'API, on l'invite à
 * tourner le téléphone).
 */

const LANDSCAPE_PHONE = '(orientation: landscape) and (max-height: 500px)'
const COARSE = '(pointer: coarse)'

function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])
  return matches
}

/** Téléphone tenu en paysage (écran bas et large). */
export function usePhoneLandscape(): boolean {
  return useMedia(LANDSCAPE_PHONE)
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape' | 'portrait') => Promise<void>
  unlock?: () => void
}

function orientation(): LockableOrientation | null {
  return typeof screen !== 'undefined' && screen.orientation ? (screen.orientation as LockableOrientation) : null
}

/** Bascule : plein écran puis verrou paysage ; à défaut, un message « tourne ton téléphone ». */
export function useLandscapeSwitch() {
  const [hint, setHint] = useState(false)

  useEffect(() => {
    if (!hint) return
    const timer = setTimeout(() => setHint(false), 5000)
    return () => clearTimeout(timer)
  }, [hint])

  const enter = useCallback(async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen()
      }
      const o = orientation()
      if (!o?.lock) throw new Error('no-lock')
      await o.lock('landscape')
    } catch {
      setHint(true)
    }
  }, [])

  const exit = useCallback(async () => {
    try {
      orientation()?.unlock?.()
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
    } catch {
      // Rien à défaire : le joueur tourne simplement son téléphone.
    }
  }, [])

  return { enter, exit, hint }
}

/** Bouton d'en-tête « passer en paysage » — seulement sur écran tactile, en portrait. */
export function BjLandscapeButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useTranslations('games.blackjack')
  const touch = useMedia(COARSE)
  const landscape = usePhoneLandscape()
  if (!touch || landscape) return null
  return (
    <Button
      variant="ghost"
      size="gameIcon"
      onClick={onClick}
      aria-label={t('landscape.enter')}
      title={t('landscape.enter')}
      className={cn('border border-gold/20 bg-black/20 text-cream/80 hover:bg-gold/10 hover:text-gold', className)}
    >
      <RotateCw aria-hidden className="h-5 w-5" />
    </Button>
  )
}

/** Message éphémère quand le verrou d'orientation n'existe pas (iPhone, navigateur intégré). */
export function BjLandscapeHint({ show }: { show: boolean }) {
  const t = useTranslations('games.blackjack')
  if (!show) return null
  return (
    <p
      role="status"
      className="fixed inset-x-4 top-20 z-50 mx-auto flex max-w-sm items-center gap-2 rounded-2xl border border-gold/40 bg-felt-deep px-4 py-3 text-sm font-semibold text-cream shadow-2xl"
    >
      <Smartphone aria-hidden className="h-5 w-5 shrink-0 rotate-90 text-gold" />
      {t('landscape.hint')}
    </p>
  )
}

/** Taille de dessin de la table TV : elle est réduite à l'échelle de l'écran. */
const DESIGN_W = 1000
const DESIGN_H = 560

/**
 * La table dessinée à la taille TV puis réduite pour tenir dans la place
 * restante : mêmes proportions que sur grand écran, quel que soit le téléphone.
 */
function ScaledTable({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(Math.min(el.clientWidth / DESIGN_W, el.clientHeight / DESIGN_H))
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return (
    <div ref={ref} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
      {scale > 0 && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{ width: DESIGN_W, height: DESIGN_H, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * Écran paysage : la table à gauche, aussi haute que l'écran, et une colonne
 * d'actions à droite, sous le pouce. Rendu dans un portail sur <body> : un
 * ancêtre transformé de la scène de jeu piégeait le `fixed`. z-[45] : par-dessus
 * le bandeau du site (z-40), sous les dialogues (z-50).
 */
export function BjLandscapeShell({
  table,
  status,
  actions,
  onExit,
  extra,
}: {
  table: ReactNode
  status?: ReactNode
  actions?: ReactNode
  onExit: () => void
  /** Boutons secondaires de la colonne (terminer, tutoriel…). */
  extra?: ReactNode
}) {
  const t = useTranslations('games.blackjack')
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(
    <div
      className="fixed inset-0 z-[45] flex gap-2 bg-felt-deep text-cream"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      <ScaledTable>{table}</ScaledTable>
      <aside className="flex w-44 shrink-0 flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <Button
            variant="quiet"
            size="game"
            onClick={onExit}
            className="h-11 min-w-0 flex-1 px-2 text-xs"
            aria-label={t('landscape.exit')}
          >
            <Smartphone aria-hidden className="mr-1.5 h-4 w-4 shrink-0" />
            {t('landscape.exit')}
          </Button>
          {extra}
        </div>
        {status && <div className="text-center text-xs font-semibold leading-snug text-cream/80">{status}</div>}
        <div className="min-h-0 flex-1" />
        {actions && <div className="flex flex-col gap-2">{actions}</div>}
      </aside>
    </div>,
    document.body
  )
}
