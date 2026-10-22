import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { QuizClientView } from '@/lib/quiz/engine'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/quiz'
import { TvQuiz } from './TvQuiz'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; view: QuizClientView } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as QuizClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvQuiz, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvQuiz — écran TV du Grand Pillaveur', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['countdown', 'finished', 'question', 'reveal'])
  })

  it('ne connaît ni ne montre la bonne réponse avant la révélation', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'question') continue
      expect(JSON.stringify(view.currentQuestion)).not.toContain('"answer"')
      expect(view.lastResult).toBeNull()
      expect(html).not.toContain('ring-white')
    }
  })

  it('montre la bonne réponse à la révélation', () => {
    const reveal = steps.map(render).find((r) => r.view.phase === 'reveal')!
    expect(reveal.html).toContain('ring-white')
  })

  it('aucune taille de texte illisible à 3 m', () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html, `${step.fixture} / ${step.label}`).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]/)
      // Le décalage d'entrée des bulles du fil (framer-motion, translateY) n'est pas une taille.
      expect(html, `${step.fixture} / ${step.label}`).not.toMatch(
        /style="[^"]*(width|height|font-size|padding|border-radius):[^;"]*\dpx/
      )
    }
  })
})

describe('TvQuiz — cas limites', () => {
  it('le compteur de réponses ne compte que les joueurs présents', () => {
    const step = steps.find((s) => {
      const view = JSON.parse(s.room!.gameStateJson!) as QuizClientView
      return view.phase === 'question' && view.players.some((p) => p.leftAt)
    })!
    const { html, view } = render(step)
    const present = view.players.filter((p) => !p.leftAt)
    expect(present.length).toBe(view.players.length - 1)
    expect(html).toMatch(new RegExp(`/(<!-- -->)?${present.length}</span>`))
  })

  it('montre la revanche en cours au podium', () => {
    const finished = steps.map(render).filter((r) => r.view.phase === 'finished')
    expect(finished.some((r) => r.view.rematchVotes.length > 0 && r.html.includes('Revanche en cours'))).toBe(true)
  })

  it('revanche : même quorum que les téléphones (membres de la table), pas les votes de ceux qui sont partis', () => {
    const step = steps.find((s) => {
      const view = JSON.parse(s.room!.gameStateJson!) as QuizClientView
      return view.phase === 'finished' && view.rematchVotes.length >= 2
    })!
    const view = JSON.parse(step.room!.gameStateJson!) as QuizClientView
    const [gone, ...stay] = view.rematchVotes
    const members = step.room!.members.filter((m) => m.userId !== gone)
    const html = renderToStaticMarkup(
      createElement(
        NextIntlClientProvider,
        { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
        createElement(TvQuiz, { room: { ...step.room!, members }, state: view })
      )
    )
    expect(html).toMatch(new RegExp(`>${stay.length}(<!-- -->)?/(<!-- -->)?${members.length}<`))
  })

  it('n’éteint jamais le texte des choix ni les joueurs partis par une opacité globale', () => {
    for (const step of steps) {
      expect(render(step).html).not.toMatch(/\bopacity-(30|60)\b/)
    }
  })
})
