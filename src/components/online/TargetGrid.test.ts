import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import { TargetGrid, targetCardState, type TargetGridPlayer, type TargetGridProps } from './TargetGrid'

const players: TargetGridPlayer[] = [
  { id: 'a', name: 'Alice', isBot: false },
  { id: 'b', name: 'Bruno', isBot: false },
  { id: 'c', name: 'Chloé', isBot: true },
]

/** Rendu statique ; les textes importent peu ici, seule la clé est rendue. */
function render(props: Record<string, unknown> = {}) {
  const full = {
    players,
    iconOf: () => '🙂',
    onPick: () => {},
    youLabel: '(toi)',
    selfId: 'a',
    ...props,
  } as TargetGridProps
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      {
        locale: 'fr',
        messages: {},
        onError: () => {},
        getMessageFallback: ({ namespace, key }: { namespace?: string; key: string }) => `${namespace}.${key}`,
      } as unknown as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TargetGrid, full)
    )
  )
}

/** Le bouton (sa balise ouvrante comprise) qui contient ce nom. */
function card(html: string, name: string): string {
  const cards = html.split('<button').slice(1)
  const found = cards.find((c) => c.includes(name))
  if (!found) throw new Error(`carte ${name} absente`)
  return found
}

describe('targetCardState', () => {
  it('rend une carte libre touchable, sans marque', () => {
    expect(targetCardState('a', {})).toEqual({
      marked: false,
      pending: false,
      excluded: false,
      dead: false,
      dimmed: false,
      pickable: true,
    })
  })

  it('rend une cible interdite ou morte non touchable, sans l’estomper deux fois', () => {
    const excluded = targetCardState('a', { excludeIds: ['a'], disabled: true })
    expect(excluded).toMatchObject({ excluded: true, pickable: false, dimmed: false })
    const dead = targetCardState('a', { deadIds: ['a'], excludeIds: ['a'] })
    expect(dead).toMatchObject({ dead: true, excluded: false, pickable: false })
  })

  it('garde en pleine lumière la carte choisie et celle en cours d’envoi quand la grille est inerte', () => {
    expect(targetCardState('a', { disabled: true, chosenId: 'a' })).toMatchObject({ marked: true, dimmed: false })
    expect(targetCardState('a', { disabled: true, pendingId: 'a' })).toMatchObject({ pending: true, dimmed: false })
    expect(targetCardState('b', { disabled: true, chosenId: 'a' })).toMatchObject({ dimmed: true, pickable: false })
  })

  it('ne renvoie pas une action déjà partie', () => {
    expect(targetCardState('a', { pendingId: 'a' }).pickable).toBe(false)
    expect(targetCardState('b', { pendingId: 'a' }).pickable).toBe(true)
  })

  it('fait primer la sélection locale sur le choix enregistré, qui revient si on désélectionne', () => {
    expect(targetCardState('b', { chosenId: 'a', selectedId: 'b' }).marked).toBe(true)
    expect(targetCardState('a', { chosenId: 'a', selectedId: 'b' }).marked).toBe(false)
    expect(targetCardState('a', { chosenId: 'a', selectedId: null }).marked).toBe(true)
  })
})

describe('TargetGrid — rendu', () => {
  it('marque une cible interdite par une opacité générée, une icône et aria-disabled', () => {
    const html = render({ excludeIds: ['b'] })
    const bruno = card(html, 'Bruno')
    expect(bruno).toContain('opacity-40')
    expect(bruno).toContain('aria-disabled="true"')
    expect(bruno).toContain('lucide-ban')
    expect(bruno).toContain('gameUi.targets.excluded')
    expect(html).not.toContain('opacity-35')
  })

  it('barre le nom d’un mort et l’orne d’un crâne', () => {
    const chloe = card(render({ deadIds: ['c'] }), 'Chloé')
    expect(chloe).toContain('line-through')
    expect(chloe).toContain('lucide-skull')
  })

  it('montre la roue sur la carte en cours d’envoi et estompe les autres', () => {
    const html = render({ pendingId: 'a', disabled: true })
    expect(card(html, 'Alice')).toContain('animate-spin')
    expect(card(html, 'Alice')).toContain('aria-busy="true"')
    expect(card(html, 'Alice')).not.toContain('opacity-60')
    expect(card(html, 'Bruno')).toContain('opacity-60')
  })

  it('en mode choisir-puis-valider, coche la sélection sans rien envoyer', () => {
    const html = render({ mode: 'select', selectedId: 'b', onSelect: () => {} })
    const bruno = card(html, 'Bruno')
    expect(bruno).toContain('aria-pressed="true"')
    expect(bruno).toContain('lucide-check')
    expect(card(html, 'Alice')).toContain('aria-pressed="false"')
  })

  it('écrit les noms en 14 px sur des cartes de 52 px, avec la ligne meta en 12 px', () => {
    const html = render({ meta: (p: TargetGridPlayer) => (p.id === 'b' ? 'accusé 3×' : null) })
    const bruno = card(html, 'Bruno')
    expect(bruno).toContain('text-sm font-bold')
    expect(bruno).toContain('min-h-[52px]')
    expect(bruno).toContain('text-xs')
    expect(bruno).toContain('accusé 3×')
    // Pas de ligne meta vide (et sa marge) quand `meta` ne rend rien.
    expect(card(html, 'Alice')).not.toContain('text-xs')
  })

  it('ne se dit bouton à bascule que si la grille porte un choix', () => {
    expect(render()).not.toContain('aria-pressed')
    const voted = render({ chosenId: 'b' })
    expect(card(voted, 'Bruno')).toContain('aria-pressed="true"')
    expect(card(voted, 'Alice')).toContain('aria-pressed="false"')
  })
})
