import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import { createPbcState, reducePbc, PBC_CATEGORY_COUNT, type PbcClientView } from '@/lib/petit-bac/engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/petit-bac'
import { onlineRoom, previewMembers } from '@/app/[locale]/tv/apercu-dev/fixture-kit'
import { TvPetitBac } from './TvPetitBac'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))

function render(step: (typeof steps)[number]): { html: string; view: PbcClientView; json: string } {
  const room = step.room!
  const json = room.gameStateJson!
  const view = JSON.parse(json) as PbcClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvPetitBac, { room, state: view })
    )
  )
  return { html, view, json }
}

describe('TvPetitBac — écran TV du Petit Bac', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['countdown', 'finished', 'flush', 'reveal', 'write'])
  })

  it('ne reçoit ni ne montre aucune réponse avant la révélation', () => {
    for (const step of steps) {
      const { html, view, json } = render(step)
      if (view.phase !== 'write' && view.phase !== 'flush') continue
      expect(json, step.label).not.toMatch(/Bordeaux|Batman|Maroc|Matrix|Pétanque/)
      expect(view.revealGrid).toBeNull()
      expect(html).not.toContain('line-through')
    }
  })

  it('à la révélation, chaque réponse est rangée sous le nom de son auteur', () => {
    const reveal = steps.map(render).find((r) => r.view.phase === 'reveal' && r.view.players.length === 16)!
    expect(reveal.html).toContain('Marie-Charlotte')
    expect(reveal.html).toContain('Bordeaux')
    expect(reveal.html).toContain('line-through')
    expect(reveal.html).toMatch(/3\/8/)
  })

  it('le seuil de contestation est celui des téléphones (propriétaire exclu)', () => {
    const small = steps.map(render).find((r) => r.view.phase === 'reveal' && r.view.players.length === 2)!
    expect(small.html).toContain(fr.games['petit-bac'].game.contestTooFewPlayers)
  })

  it('un joueur parti garde sa ligne de score à la révélation, comme sur les téléphones', () => {
    const reveal = steps.map(render).find((r) => r.view.phase === 'reveal' && r.view.players.some((p) => p.leftAt))!
    expect(reveal.view.revealGrid?.[0]?.some((c) => c.playerId === 'u16')).toBe(false)
    expect(reveal.html).toContain('Bastien')
    expect(reveal.html).toContain('border-dashed')
  })

  it('la revanche montre les votants sans total (la TV ignore qui est absent)', () => {
    const end = steps.map(render).find((r) => r.view.phase === 'finished' && r.view.players.length === 16 && (r.view.rematchVotes?.length ?? 0) > 0)!
    expect(end.html).toContain(fr.tv.rematchPending)
    expect(end.html).not.toMatch(/Revanche \d+\/\d+/)
  })

  it('les longues consignes peuvent passer à la ligne au lieu d’être coupées', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'write' && view.phase !== 'flush') continue
      expect(html, step.label).not.toMatch(/class="[^"]*truncate[^"]*text-(gold|amber-200)/)
    }
  })

  it('un joueur parti PENDANT la révélation garde ses réponses à l’écran (contestables)', () => {
    const members = previewMembers(4)
    const at = Date.now() - 60_000
    let state = createPbcState(members.map((m) => ({ id: m.userId, name: m.displayName })), 'tv-depart', at, 1)
    state = reducePbc(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: at + 5_000 })
    const letter = state.letters[0]
    const answers = (tag: string) => Array.from({ length: PBC_CATEGORY_COUNT }, (_, i) => `${letter}${tag}${i}`)
    state = reducePbc(state, { type: 'STOP', playerId: 'u1', answers: answers('triche'), now: at + 30_000 })
    for (const id of ['u2', 'u3', 'u4']) {
      state = reducePbc(state, { type: 'SUBMIT', playerId: id, answers: answers(id), now: at + 31_000 })
    }
    state = reducePbc(state, { type: 'CONTEST', playerId: 'u2', targetId: 'u1', category: 0, now: at + 32_000 })
    state = reducePbc(state, { type: 'LEAVE', playerId: 'u1', at: at + 33_000 })
    const room = onlineRoom('petit-bac', state, { members, stateVersion: state.version })
    const { html, view } = render({ label: 'départ au reveal', room, fixture: 'test' })
    expect(view.revealGrid?.[0]?.map((c) => c.playerId)).toContain('u1')
    expect(html).toContain(`${letter}triche0`)
    expect(html).toMatch(/1\/2/)
  })

  it('aucune taille de texte illisible ni opacité morte', () => {
    for (const step of steps) {
      const { html } = render(step)
      const where = `${step.fixture} / ${step.label}`
      expect(html, where).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]/)
      expect(html, where).not.toMatch(/style="[^"]*\d+px/)
      expect(html, where).not.toMatch(/class="[^"]*\/(15|35|45|55|65|85)\b/)
    }
  })
})
