import { useEffect, useRef, useState } from "react"

export interface Viewport {
  width: number
  height: number
}

/**
 * Mesure en continu la taille disponible d'un conteneur (via ResizeObserver).
 * Permet de dimensionner une surface de jeu de façon proportionnelle, sans
 * valeurs en dur, pour rester lisible aussi bien sur desktop que sur mobile.
 *
 * Exemple :
 *   const { ref, width, height } = useGameViewport()
 *   <div ref={ref} className="w-full h-[60vh]"> ... </div>
 */
export function useGameViewport<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T | null>(null)
  const [size, setSize] = useState<Viewport>({ width: 0, height: 0 })

  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return

    const update = (w: number, h: number) => {
      setSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      )
    }

    update(el.clientWidth, el.clientHeight)

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        update(Math.round(width), Math.round(height))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, width: size.width, height: size.height }
}

export default useGameViewport
