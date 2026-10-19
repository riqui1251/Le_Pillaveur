import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import type { PmuCastFrame, PmuCastState } from '@/lib/cast-types'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/pmu'
import { fitRiders, TvPmu } from './TvPmu'

;(globalThis as { React?: typeof React }).React = React

const fixtures = build()
const steps = fixtures.flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; state: PmuCastState } {
  const state = JSON.parse(step.room!.gameStateJson!) as PmuCastState
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvPmu, { state, frame: (step.frame ?? null) as PmuCastFrame | null })
    )
  )
  return { html, state }
}

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('TvPmu — écran TV de la Course PMU', () => {
  it('couvre attente, paris, course, distribution et résultats', () => {
    const seen = new Set(steps.map((s) => {
      const st = JSON.parse(s.room!.gameStateJson!) as PmuCastState
      return `${st.phase}:${st.stage ?? '-'}`
    }))
    expect([...seen].sort()).toEqual(['finished:-', 'finished:payout', 'finished:results', 'racing:-', 'waiting:betting', 'waiting:setup'])
  })

  it('aucune classe illisible ni taille en px', () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html).not.toMatch(/text-(xs|sm)\b|text-\[\d+px\]|\d+px/)
    }
  })

  it('n’annonce pas de vainqueur pendant l’attente ni la course', () => {
    for (const step of steps) {
      const { html, state } = render(step)
      if (state.phase === 'finished') continue
      expect(text(html)).not.toContain('a gagné')
      expect(text(html)).not.toContain('Classement')
    }
  })

  it('montre les mises en mode paris, comme le téléphone', () => {
    const betting = steps.find((s) => s.fixture === 'paris-12' && s.label === 'paris')!
    const { html, state } = render(betting)
    expect(text(html)).toContain(fr.games.pmu.titleBetting)
    expect(text(html)).toContain(`${state.horses[0].bets![0]}🍺`)
    const setup = render(steps.find((s) => s.fixture === 'paris-12' && s.label.startsWith('attente'))!)
    expect(setup.state.horses.every((h) => h.bets === undefined)).toBe(true)
    expect(text(setup.html)).not.toContain('🍺')
  })

  it('suit les cibles choisies sur le téléphone pendant la distribution', () => {
    const payout = steps.find((s) => s.fixture === 'paris-12' && s.label === 'distribution (cibles pas encore choisies)')!
    const partial = steps.find((s) => s.fixture === 'paris-12' && s.label === 'distribution (une cible choisie)')!
    const results = steps.find((s) => s.fixture === 'paris-12' && s.label === 'résultats')!
    const p = render(payout)
    expect(p.state.payouts!.every((x) => x.target === null)).toBe(true)
    expect(text(p.html).split(fr.games.pmu.results.toWhom).length - 1).toBe(p.state.payouts!.length)
    const q = render(partial)
    const chosen = q.state.payouts!.filter((x) => x.target)
    expect(chosen).toHaveLength(1)
    expect(text(q.html)).toContain(`${fr.games.pmu.results.giveTo} ${chosen[0].target}`)
    expect(text(q.html).split(fr.games.pmu.results.toWhom).length - 1).toBe(q.state.payouts!.length - 1)
    const r = render(results)
    expect(r.state.payouts!.every((x) => x.target)).toBe(true)
    expect(text(r.html)).not.toContain(fr.games.pmu.results.toWhom)
    expect(text(r.html)).toContain(r.state.payouts![0].target!)
  })

  it('annonce « Tous les joueurs sont gagnants » au lieu des « À qui ? »', () => {
    const payout = steps.find((s) => s.fixture === 'paris-tous-gagnants' && s.label.startsWith('distribution'))!
    const { html, state } = render(payout)
    expect(state.noTargets).toBe(true)
    expect(text(html)).toContain(fr.games.pmu.results.allWinners)
    expect(text(html)).not.toContain(fr.games.pmu.results.toWhom)
  })

  it('montre « Aucun joueur sur ce cheval » quand le gagnant n’a pas de parieur (paris)', () => {
    for (const label of ['distribution (cibles pas encore choisies)', 'résultats']) {
      const step = steps.find((s) => s.fixture === 'paris-gagnant-sans-parieur' && s.label === label)!
      expect(text(render(step).html)).toContain(fr.games.pmu.results.noRider)
    }
  })

  it('donne le nom du cheval en mode libre quand le gagnant n’a pas de parieur', () => {
    const step = steps.find((s) => s.fixture === 'libre-gagnant-sans-parieur' && s.label === 'résultats')!
    expect(text(render(step).html)).toContain(`${fr.games.pmu.horses.eclair} gagne ! Distribuez 4 gorgées`)
  })

  it('résume en « +N » les gains au-delà de 16 gagnants', () => {
    for (const s of steps.filter((x) => x.fixture === 'paris-22-gagnants' && JSON.parse(x.room!.gameStateJson!).phase === 'finished')) {
      const { html, state } = render(s)
      expect(state.payouts).toHaveLength(20)
      expect(text(html)).toContain('+5')
      expect(html.split('🍺').length - 1).toBe(15)
    }
  })

  it('les étapes d’attente suivent une revanche (course déjà jouée, trame ignorée)', () => {
    for (const s of steps.filter((x) => JSON.parse(x.room!.gameStateJson!).phase === 'waiting')) {
      const { html, state } = render(s)
      expect(state.race).toBeGreaterThanOrEqual(1)
      expect(text(html).match(/\b0%/g)?.length).toBe(4)
    }
  })

  it('affiche les gorgées du mode libre aux résultats', () => {
    const results = steps.find((s) => s.fixture === 'libre-3' && s.label === 'résultats')!
    expect(text(render(results).html)).toContain('Distribuez 6 gorgées')
  })

  it('ignore une trame d’une course précédente', () => {
    const step = steps.find((s) => s.fixture === 'rejouer-trame-perimee')!
    const html = text(render(step).html)
    expect(html).not.toMatch(/\b(9\d|100)%/)
    expect(html.match(/\b0%/g)?.length).toBe(4)
  })

  it('résume en « +N » les parieurs d’un cheval trop chargé', () => {
    const step = steps.find((s) => s.fixture === 'paris-16-foule')!
    expect(text(render(step).html)).toMatch(/\+\d+/)
    const names = Array.from({ length: 10 }, () => 'Marie-Charlotte')
    const { visible, hidden } = fitRiders(names, names.map(() => 2))
    expect(visible).toBeGreaterThan(0)
    expect(visible + hidden).toBe(10)
    expect(fitRiders(['Léa'], [undefined])).toEqual({ visible: 1, hidden: 0 })
  })

  it('reste compatible avec un payload sans champs optionnels', () => {
    const step = steps.find((s) => s.fixture === 'ancien-payload')!
    const html = text(render(step).html)
    expect(html).toContain('Tonnerre a gagné')
    expect(html).toContain('Classement')
  })
})
