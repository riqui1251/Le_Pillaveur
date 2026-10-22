import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EndActionDock } from './EndActionDock'

/**
 * Gouttière droite du dock de fin (`game-bottom-bar`, 3 rem sous 720 px) :
 * réservée à la bulle vocale flottante, et seulement quand elle est à
 * l'écran — sinon « Rejouer » est décentré pour rien.
 */

const voice = vi.hoisted(() => ({ available: false, anchored: false }))
vi.mock('@/components/voice/voice-dock-store', () => ({
  useVoiceDockStatus: () => ({ available: voice.available }),
  useVoiceDockAnchored: () => voice.anchored,
}))

/** Les classes du calque fixe du dock. */
function dockClasses(state: { available: boolean; anchored: boolean }, props: { voiceGutter?: boolean } = {}) {
  Object.assign(voice, state)
  const html = renderToStaticMarkup(createElement(EndActionDock, props, createElement('button', null, 'Rejouer')))
  const match = html.match(/<div class="(fixed inset-x-0 bottom-0[^"]*)"/)
  if (!match) throw new Error('dock fixe introuvable')
  return match[1].split(' ')
}

describe('EndActionDock : gouttière de la bulle vocale', () => {
  it('bulle flottante à l’écran : la gouttière est réservée', () => {
    expect(dockClasses({ available: true, anchored: false })).toContain('game-bottom-bar')
  })

  it('pas de vocal sur la page : aucune gouttière, « Rejouer » centré', () => {
    const classes = dockClasses({ available: false, anchored: false })
    expect(classes).not.toContain('game-bottom-bar')
    expect(classes).toContain('pr-4')
  })

  it('bulle rangée par un bouton micro d’en-tête : aucune gouttière', () => {
    const classes = dockClasses({ available: true, anchored: true })
    expect(classes).not.toContain('game-bottom-bar')
    expect(classes).toContain('pr-4')
  })

  it('jeu local (voiceGutter={false}) : jamais de gouttière', () => {
    expect(dockClasses({ available: true, anchored: false }, { voiceGutter: false })).not.toContain('game-bottom-bar')
  })
})
