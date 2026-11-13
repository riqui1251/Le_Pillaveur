import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { VdnRuler, type RulerMarker } from '@/app/[locale]/games/vue-de-nez/components/ruler'
import { scaleFor } from './engine'

const MARKERS: RulerMarker[] = [
  { id: 'lea', value: 212, label: '212', player: { name: 'Léa' }, tone: 'win' },
  { id: 'sam', value: 300, label: '300', player: { name: 'Sam' }, tone: 'lose' },
]

function render(shownCount: number, answer: { value: number; label: string } | null): string {
  return renderToStaticMarkup(
    createElement(VdnRuler, {
      scale: scaleFor(206, MARKERS.map((m) => m.value)),
      markers: MARKERS,
      shownCount,
      answer,
      startLabel: '100',
      endLabel: '350',
      reduceMotion: true,
    })
  )
}

describe('règle graduée de la révélation', () => {
  it('pose les estimations une à une ; la réponse n’est pas dans la page avant de tomber', () => {
    const first = render(1, null)
    expect(first).toContain('>212<')
    expect(first).not.toContain('>300<')
    expect(first).not.toContain('206')
    // Avant la réponse, personne n'est encore désigné : ni or ni rouge sur les jetons.
    expect(first).not.toContain('text-red-300')

    const done = render(Number.MAX_SAFE_INTEGER, { value: 206, label: '206' })
    expect(done).toContain('>300<')
    expect(done).toContain('>206<')
    expect(done).toContain('text-red-300')
  })

  it('reste décorative pour un lecteur d’écran (la liste des résultats dit la même chose)', () => {
    expect(render(2, null)).toMatch(/^<div aria-hidden="true"/)
  })

  it('près d’un bord, la réponse remplace la borne que sa hampe barrerait', () => {
    const edge = (answer: { value: number; label: string } | null) =>
      renderToStaticMarkup(
        createElement(VdnRuler, {
          scale: scaleFor(15, [20, 5_000_000]),
          markers: [],
          shownCount: 0,
          answer,
          startLabel: 'BORNE-GAUCHE',
          endLabel: 'BORNE-DROITE',
          reduceMotion: true,
        })
      )
    expect(edge(null)).toContain('BORNE-GAUCHE')
    const revealed = edge({ value: 15, label: '15' })
    expect(revealed).not.toContain('BORNE-GAUCHE')
    expect(revealed).toContain('BORNE-DROITE')
    expect(revealed).toContain('>15<')
  })
})
