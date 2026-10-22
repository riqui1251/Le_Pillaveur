import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { BluffClientView } from '@/lib/bluff/engine'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/bluff'
import { TvBluff } from './TvBluff'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; view: BluffClientView } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as BluffClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvBluff, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvBluff — écran TV du Grand Bluff', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['countdown', 'finished', 'reveal', 'submit', 'vote'])
  })

  it('ne reçoit ni ne montre aucun bluff pendant la soumission', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'submit') continue
      expect(view.myFake).toBeNull()
      expect(view.voteOptions).toBeNull()
      expect(html).not.toContain('Svetlana Khorkina')
      expect(html).not.toContain('Ivanovna')
    }
  })

  it('montre les propositions anonymes au vote, sans auteur, vraie réponse ni points', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'vote') continue
      expect(view.myVote).toBeNull()
      expect(view.lastReveal).toBeNull()
      expect(JSON.stringify(view)).not.toMatch(/"isReal"|"authorId"|"pendingVotes"|"candidates"/)
      for (const opt of view.voteOptions ?? []) expect(html).toContain(opt.text)
      expect(html).not.toContain('border-emerald-400/70')
      expect(html).not.toMatch(/\+\d{3,}/)
    }
  })

  it('montre la vraie réponse, les auteurs et les points à la révélation', () => {
    const reveal = steps.map(render).find((r) => r.view.phase === 'reveal')!
    const lr = reveal.view.lastReveal!
    expect(reveal.html).toContain(lr.realAnswer)
    expect(reveal.html).toContain('border-emerald-400/70')
    expect(reveal.html).toMatch(/\+\d{3,}/)
  })

  it('garde le bandeau de retour au vote et à la révélation à 16 joueurs, 17 propositions', () => {
    const left = steps.filter((s) => s.fixture === 'depart-seize').map(render)
    expect(left.map((r) => r.view.phase)).toEqual(['vote', 'reveal'])
    for (const r of left) {
      expect(r.html).toContain('En attente du retour de')
      expect(r.html).toContain('leading-[1.1]')
    }
    expect(left[0].view.voteOptions).toHaveLength(17)
    expect(left[1].view.lastReveal?.candidates.length).toBeGreaterThanOrEqual(16)
  })

  it('les paroles des bots dans une colonne à droite, effacée tant qu’aucune bulle n’est dite', () => {
    const talk = steps.filter((s) => s.fixture === 'paroles').map(render)
    expect(talk.map((r) => r.view.phase)).toEqual(['submit', 'vote', 'reveal'])
    for (const r of talk) {
      expect(r.html).toContain('w-[22rem]')
      expect(r.html).toContain('aria-live="polite"')
      expect(r.html).toMatch(/Barnabé<\/span> /)
    }
    expect(talk[1].html).toMatch(/Gépéto<\/span> /)
    const silent = render(steps.find((s) => s.fixture === 'huit' && s.label === 'vote 5/8')!)
    expect(silent.view.speech ?? []).toEqual([])
    expect(silent.html).not.toContain('w-[22rem]')
    // Monté quand même : la région live existe avant la première parole.
    expect(silent.html).toContain('aria-live="polite"')
  })

  it('compte la revanche comme les téléphones : membres présents seulement, bots exclus', () => {
    const end = steps.find((s) => s.fixture === 'seize' && s.label === 'fin de partie')!
    const room = end.room!
    const view = JSON.parse(room.gameStateJson!) as BluffClientView
    const withVotes = { ...end, room: { ...room, gameStateJson: JSON.stringify({ ...view, rematchVotes: ['u1', 'u2', 'u3', 'bot-1'] }) } }
    const { html } = render(withVotes)
    expect(html).toContain('(3/12)')
  })

  it('aucune taille de texte illisible à 3 m ni opacité inexistante en Tailwind 3.3', () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html, `${step.fixture} / ${step.label}`).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]/)
      expect(html, `${step.fixture} / ${step.label}`).not.toMatch(/style="[^"]*\d+px/)
      expect(html, `${step.fixture} / ${step.label}`).not.toMatch(/\/(15|35|45|55|65|85)\b/)
    }
  })
})
