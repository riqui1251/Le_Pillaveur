"use client"

import { useEffect, useRef } from 'react'
import { PassPhoneOverlay, type PassPhoneOverlayProps } from '@/components/game/PassPhoneOverlay'

type WatchedPassPhoneOverlayProps = PassPhoneOverlayProps & {
  /** Vrai dès que le flash s'affiche, faux une fois qu'il a quitté l'écran (fondu compris). */
  onOpenChange: (open: boolean) => void
}

/**
 * Le flash « Passe le téléphone », tel quel, plus un signal d'ouverture.
 *
 * PassPhoneOverlay ne dit pas quand il se ferme (minuteur ou toucher). Pile
 * Poil en a besoin : « Démarrer » ne s'arme qu'une fois le flash parti, sinon
 * le toucher qui le ferme — ou celui qui arrive pile quand il s'efface —
 * lançait le chrono du joueur suivant. On lit donc sa présence dans le DOM :
 * sa racine (région vivante, montée en permanence) n'a d'enfant que pendant
 * le flash.
 */
export function WatchedPassPhoneOverlay({ onOpenChange, ...overlay }: WatchedPassPhoneOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onOpenChangeRef = useRef(onOpenChange)

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
  }, [onOpenChange])

  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof MutationObserver === 'undefined') return
    let open = false
    const sync = () => {
      const next = (root.firstElementChild?.childElementCount ?? 0) > 0
      if (next === open) return
      open = next
      onOpenChangeRef.current(next)
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(root, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (open) onOpenChangeRef.current(false)
    }
  }, [])

  return (
    <div ref={rootRef} className="contents">
      <PassPhoneOverlay {...overlay} />
    </div>
  )
}
