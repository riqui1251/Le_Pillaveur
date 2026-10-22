import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { SFClientView } from '@/lib/sans-filtre/engine'
import { SF_WHITES_FR } from '@/lib/sans-filtre/data'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/sans-filtre'
import { TvSansFiltre } from './TvSansFiltre'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
}

function render(step: (typeof steps)[number]): { html: string; view: SFClientView } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as SFClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvSansFiltre, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvSansFiltre — écran TV de Sans Filtre', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['countdown', 'finished', 'judging', 'reveal', 'submit'])
  })

  it("ne reçoit ni ne montre aucune carte réponse avant le jugement", () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'submit' && view.phase !== 'countdown') continue
      expect(view.myHand).toEqual([])
      expect(view.myPlayed).toBeNull()
      expect(view.submissions).toBeNull()
      expect(view.crowned).toBeNull()
      for (const card of SF_WHITES_FR) expect(html).not.toContain(escape(card.text))
    }
  })

  it('montre toutes les réponses au jugement, sans leurs auteurs', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'judging') continue
      expect(JSON.stringify(view.submissions)).not.toMatch(/playerId/)
      expect(view.crowned).toBeNull()
      for (const s of view.submissions ?? []) expect(html).toContain(escape(s.text))
      expect(html).not.toContain('Signée')
    }
  })

  it('montre la carte couronnée et son auteur au couronnement', () => {
    const reveals = steps.map(render).filter((r) => r.view.phase === 'reveal')
    expect(reveals.some((r) => r.view.crowned)).toBe(true)
    for (const { html, view } of reveals) {
      if (!view.crowned) {
        expect(html).toContain('Personne n’a joué')
        continue
      }
      expect(html).toContain(escape(view.crowned.text))
      expect(html).toContain(escape(`Signée ${view.crowned.playerName}`))
    }
  })

  it('annonce le vainqueur ou l’égalité en fin de partie', () => {
    const ends = steps.map(render).filter((r) => r.view.phase === 'finished')
    expect(ends.some((r) => r.view.winnerId)).toBe(true)
    expect(ends.some((r) => !r.view.winnerId)).toBe(true)
    for (const { html, view } of ends) {
      const winner = view.players.find((p) => p.id === view.winnerId)
      expect(html).toContain(winner ? escape(`${winner.name} gagne la soirée`) : 'Égalité')
    }
  })

  it('signale le joueur parti sans opacité multipliée, y compris au jugement', () => {
    const leaving = steps.map(render).filter((r) => r.view.players.some((p) => p.leftAt))
    expect(leaving.some((r) => r.view.phase === 'judging')).toBe(true)
    for (const { html } of leaving) {
      expect(html).toContain('En attente du retour')
      expect(html).not.toMatch(/\bopacity-\d+/)
    }
  })

  it('les paroles des bots au pied de la colonne de jeu, effacées tant qu’aucune bulle n’est dite', () => {
    const talk = steps.filter((s) => s.fixture === 'paroles').map(render)
    expect(talk.map((r) => r.view.phase)).toEqual(['submit', 'judging', 'reveal'])
    for (const r of talk) {
      expect(r.html).toContain('max-h-[7rem]')
      expect(r.html).toMatch(/Gépéto<\/span> /)
    }
    // Au couronnement, au moins une réaction s'ajoute à la promesse de Gépéto.
    expect((talk[2].html.match(/rounded-tl-sm/g) ?? []).length).toBeGreaterThan(1)
    const silent = render(steps.find((s) => s.fixture === 'abattage-16')!)
    expect(silent.html).not.toContain('max-h-[7rem]')
    expect(silent.html).toContain('aria-live="polite"')
  })

  it("n'emploie aucune taille de texte trop petite pour la TV", () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]/)
    }
  })
})
