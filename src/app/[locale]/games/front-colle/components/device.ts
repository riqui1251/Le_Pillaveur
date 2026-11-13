import { useEffect, useState } from 'react'
import { isSoundMuted } from '@/lib/sound/game-sounds'

/** Réponse à la demande d'accès au capteur d'orientation. */
export type TiltPermission = 'granted' | 'denied' | 'unsupported'

type OrientationEventWithPermission = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>
}

/**
 * iOS 13+ : l'accès à `deviceorientation` se demande DANS un geste (clic
 * « Prêt ») ; à appeler avant tout `await`. Ailleurs, rien à demander : si
 * l'appareil n'a pas de capteur, aucun événement n'arrive et le jeu passe
 * au toucher.
 */
export function requestTiltPermission(): Promise<TiltPermission> {
  if (typeof window === 'undefined' || typeof window.DeviceOrientationEvent === 'undefined') {
    return Promise.resolve('unsupported')
  }
  const event = window.DeviceOrientationEvent as unknown as OrientationEventWithPermission
  if (typeof event.requestPermission !== 'function') return Promise.resolve('granted')
  try {
    return event.requestPermission().then(
      (answer): TiltPermission => (answer === 'granted' ? 'granted' : 'denied'),
      (): TiltPermission => 'denied'
    )
  } catch {
    return Promise.resolve('denied')
  }
}

/** Vibration courte, coupée avec le son (un seul réglage pour tout le retour) ; absente sur iPhone. */
export function vibrate(pattern: number | number[]): void {
  if (isSoundMuted()) return
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // vibration refusée ou absente : le son et le flash suffisent
  }
}

export type Viewport = { width: number; height: number; portrait: boolean; upsideDown: boolean }

function readViewport(): Viewport {
  const width = window.innerWidth
  const height = window.innerHeight
  let portrait = height >= width
  try {
    portrait = window.matchMedia('(orientation: portrait)').matches
  } catch {
    // matchMedia absent : on s'en tient aux dimensions
  }
  const angle = typeof window.screen?.orientation?.angle === 'number' ? window.screen.orientation.angle : 0
  return { width, height, portrait, upsideDown: portrait && angle === 180 }
}

/** Taille et orientation de la fenêtre, suivies (rotation, barre d'adresse qui se replie). */
export function useViewport(): Viewport | null {
  const [viewport, setViewport] = useState<Viewport | null>(null)

  useEffect(() => {
    const update = () => setViewport(readViewport())
    update()
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    let query: MediaQueryList | null = null
    try {
      query = window.matchMedia('(orientation: portrait)')
    } catch {
      query = null
    }
    // Safari < 14 ne connaît que addListener sur MediaQueryList.
    if (query?.addEventListener) query.addEventListener('change', update)
    else query?.addListener?.(update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      if (query?.removeEventListener) query.removeEventListener('change', update)
      else query?.removeListener?.(update)
    }
  }, [])

  return viewport
}
