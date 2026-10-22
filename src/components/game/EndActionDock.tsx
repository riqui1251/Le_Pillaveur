"use client"

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useGameBottomBarInset } from '@/components/game/GameFixedActionBar'
import { cn } from '@/lib/utils'

/**
 * DOCK D'ACTIONS DE FIN DE PARTIE — partagé par l'écran de fin en ligne
 * (OnlineEndScreen) et par les écrans de fin des jeux locaux.
 *
 * Dans le flux, « Rejouer » suivait le classement, l'XP et l'avis : à 375 px
 * il tombait à un écran et demi de défilement, et glissait encore sous le pli
 * quand l'XP et les succès arrivaient après lui. Ici, les actions restent en
 * zone pouce quoi que le contenu fasse.
 *
 * - `fixed` : collé au bas de l'écran (zone sûre comprise). Le dock réserve
 *   LUI-MÊME sa hauteur dans le flux par un espaceur mesuré : rien ne passe
 *   dessous, y compris quand le bandeau d'avis s'ouvre ou qu'une erreur s'y
 *   ajoute. Ancré par le bas, il grandit vers le HAUT : « Rejouer » ne bouge
 *   pas d'un pixel quand le bandeau apparaît.
 * - `sticky` : collé au bas d'une carte de modale qui défile (le `fixed` y
 *   serait rapporté à la carte : Dialog Radix et cartes animées portent un
 *   `transform`). Son parent doit être un bloc ou une colonne flex qui porte
 *   tout le contenu, jamais une grille : un élément de grille ne colle que
 *   dans sa propre case, et DialogContent est en `grid` (y ajouter
 *   `flex flex-col`).
 */

// Le rendu serveur ne mesure rien ; côté client, la mesure passe AVANT la
// première peinture, sans image où le contenu glisserait sous le dock.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Conteneur qui défile sous le dock : la scène en ligne (OnlineGameStage),
 * le body sur téléphone (`.is-mobile-device` lui donne overflow et hauteur),
 * sinon le document.
 */
function scrollContainerOf(el: HTMLElement): HTMLElement {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = window.getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return document.documentElement
}

export type EndActionDockMode = 'fixed' | 'sticky'

export type EndActionDockProps = {
  /**
   * Bandeau d'avis (FirstGameFeedbackCard variant="banner"), rendu AU-DESSUS
   * des actions. Un nœud qui ne rend rien ne laisse ni marge ni écart.
   */
  feedback?: ReactNode
  /** Les actions, « Rejouer » en tête. */
  children: ReactNode
  /** 'fixed' (défaut) : bas de l'écran ; 'sticky' : bas d'une carte de modale qui défile. */
  mode?: EndActionDockMode
  /**
   * Réserve à droite la place de la pastille du vocal (`game-bottom-bar`),
   * qui flotte au-dessus des barres du bas sur téléphone — seulement quand
   * elle est réellement à l'écran (`useGameBottomBarInset`) : sinon, sous
   * 720 px, « Rejouer » restait décentré pour rien. Mode `fixed` seulement ;
   * les jeux locaux, sans vocal, passent `false`.
   */
  voiceGutter?: boolean
  className?: string
}

const SURFACE =
  'border-t border-gold/30 bg-felt-deep/95 backdrop-blur-md shadow-[0_-14px_30px_-20px_rgba(0,0,0,0.9)]'

// Focus clavier de TOUT bouton ou lien du dock, quel que soit l'écran qui
// le remplit : l'anneau par défaut du Button (1 px d'or, sans décalage) se
// fondait dans le fond or de « Rejouer » — focus invisible.
const DOCK_FOCUS =
  '[&_:is(button,a):focus-visible]:outline-none [&_:is(button,a):focus-visible]:ring-2 [&_:is(button,a):focus-visible]:ring-cream [&_:is(button,a):focus-visible]:ring-offset-2 [&_:is(button,a):focus-visible]:ring-offset-felt-deep'

export function EndActionDock({
  feedback,
  children,
  mode = 'fixed',
  voiceGutter = true,
  className,
}: EndActionDockProps) {
  const dockRef = useRef<HTMLDivElement>(null)
  const [reserved, setReserved] = useState(0)
  const fixed = mode === 'fixed'
  const voiceInset = useGameBottomBarInset()

  // Hauteur réelle du dock (zone sûre, libellés sur deux lignes, bandeau
  // d'avis, ligne d'erreur) : une réserve calculée en rem se trompait dès
  // qu'un de ces éléments changeait. Le bandeau change d'état SANS rendre le
  // dock (état interne de la carte) : seul un observateur de taille le voit.
  //
  // L'espaceur ne suffit pas au défilement du focus clavier : un bouton
  // atteint au Tab (« Détails » de l'XP, revanche, lien d'invitation)
  // s'arrêtait sous le dock — la scène en ligne ne réserve que 9 rem
  // (`scroll-pb-36`, taillé pour OnlineActionBar), le document rien. La
  // hauteur mesurée devient donc aussi la marge de défilement du conteneur ;
  // le style en ligne l'emporte sur la classe le temps de l'écran de fin.
  useIsoLayoutEffect(() => {
    if (!fixed) return
    const el = dockRef.current
    if (!el) return
    const scroller = scrollContainerOf(el)
    const prevPad = scroller.style.scrollPaddingBottom
    const measure = () => {
      const h = Math.ceil(el.getBoundingClientRect().height)
      setReserved(h)
      scroller.style.scrollPaddingBottom = `${h + 16}px`
    }
    const restore = () => {
      scroller.style.scrollPaddingBottom = prevPad
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => {
        window.removeEventListener('resize', measure)
        restore()
      }
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => {
      observer.disconnect()
      restore()
    }
  }, [fixed])

  const inner = (
    <div className={cn('mx-auto flex w-full max-w-sm flex-col gap-2', DOCK_FOCUS)}>
      {feedback ? <div className="empty:hidden">{feedback}</div> : null}
      {children}
    </div>
  )

  if (!fixed) {
    return (
      <div ref={dockRef} className={cn('sticky bottom-0 z-10 w-full py-3', SURFACE, className)}>
        {inner}
      </div>
    )
  }

  return (
    <>
      <div aria-hidden className="w-full shrink-0" style={{ height: reserved }} />
      <div
        ref={dockRef}
        className={cn(
          // z-30 comme les autres barres d'action fixes : sous la Navbar et
          // les modales, au-dessus des confettis et du contenu qui défile.
          'fixed inset-x-0 bottom-0 z-30 pl-4 pt-3',
          voiceGutter ? voiceInset : 'pr-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
          SURFACE,
          className
        )}
      >
        {inner}
      </div>
    </>
  )
}
