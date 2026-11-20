import React, { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import fr from '../../../messages/fr.json'
import { TABOU_ROUND_MS, type TabouClientView } from '@/lib/tabou/engine'
import { getTabouWords } from '@/lib/tabou/data'
import { build } from '@/app/[locale]/tv/apercu-dev/fixtures/tabou'
import { TvTabou } from './TvTabou'

;(globalThis as { React?: typeof React }).React = React

const steps = build().flatMap((f) => f.steps.map((s) => ({ ...s, fixture: f.id })))
const WORDS = getTabouWords('fr')

function render(step: (typeof steps)[number]): { html: string; view: TabouClientView } {
  const room = step.room!
  const view = JSON.parse(room.gameStateJson!) as TabouClientView
  const html = renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      createElement(TvTabou, { room, state: view })
    )
  )
  return { html, view }
}

describe('TvTabou — écran TV du Tabou Vocal', () => {
  it('couvre chaque phase rendue', () => {
    const phases = new Set(steps.map((s) => render(s).view.phase))
    expect([...phases].sort()).toEqual(['countdown', 'describing', 'finished', 'roundEnd'])
  })

  it('ne reçoit ni ne montre le mot en cours ou ses tabous pendant la manche', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      expect(view.currentWord).toBeNull()
      expect(JSON.stringify(view)).not.toMatch(/"allWords"|"remainingWords"|"rngState"/)
      if (view.phase !== 'describing' && view.phase !== 'countdown') continue
      const shown = WORDS.filter((w) => html.includes(`>${w.word}<`) || html.includes(` ${w.word} `))
      expect(shown).toEqual([])
      expect(html).not.toContain('Mots interdits')
    }
  })

  it('montre au bilan le dernier mot, sans ses mots tabous (le téléphone ne les montre pas)', () => {
    const roundEnds = steps.map(render).filter(({ view }) => view.phase === 'roundEnd')
    expect(roundEnds.length).toBeGreaterThan(0)
    for (const { html, view } of roundEnds) {
      expect(html).toContain(view.lastRoundWord!.word)
      for (const banned of view.lastRoundWord!.taboo) expect(html).not.toContain(`>${banned}<`)
    }
  })

  it('pendant la manche : décrivant, scores des deux équipes et tous les joueurs', () => {
    for (const step of steps) {
      const { html, view } = render(step)
      if (view.phase !== 'describing') continue
      const describer = view.players.find((p) => p.id === view.describerId)!
      expect(html).toContain(`${describer.name} décrit…`)
      for (const p of view.players) expect(html).toContain(p.name)
      expect(html).toContain(`>${view.scores.A}<`)
      expect(html).toContain(`>${view.scores.B}<`)
    }
  })

  it('décrivant parti en pleine manche de 60 s : le chrono reste le vrai, pas figé sur 5', () => {
    const step = steps.find((s) => (JSON.parse(s.room!.gameStateJson!) as TabouClientView).phase === 'describing')!
    const view = JSON.parse(step.room!.gameStateJson!) as TabouClientView
    // État relu d'avant le relais : parti, toujours décrivant, 40 s au compteur.
    const legacy: TabouClientView = {
      ...view,
      phaseEndsAt: Date.now() + 40_000,
      players: view.players.map((p) => (p.id === view.describerId ? { ...p, isBot: false, leftAt: Date.now() } : p)),
    }
    const { html } = render({ ...step, room: { ...step.room!, gameStateJson: JSON.stringify(legacy) } })

    expect(html).toMatch(/tabular-nums[^>]*>(40|39)</)
  })

  it('montre à la fin le compteur de revanche, comme les téléphones', () => {
    const finished = steps.map(render).filter(({ view }) => view.phase === 'finished')
    for (const { html, view } of finished) {
      const votes = view.rematchVotes ?? []
      if (votes.length === 0) expect(html).not.toContain('Revanche en cours')
      else expect(html).toContain(`Revanche en cours… <span class="tabular-nums">${votes.length}/`)
    }
    expect(finished.some(({ view }) => (view.rematchVotes ?? []).length > 0)).toBe(true)
  })

  /** Manche ouverte écourtée (5 s) : personne pour décrire ou pour deviner. */
  const isShort = (view: TabouClientView) => view.phase === 'describing' && (view.roundMs ?? TABOU_ROUND_MS) < TABOU_ROUND_MS

  it('le bandeau du joueur parti tient sur deux lignes sans couper le décompte', () => {
    const left = steps
      .map(render)
      .filter(({ view }) => view.phase === 'describing' && !isShort(view) && view.players.some((p) => !p.isBot && p.leftAt))
    expect(left.length).toBeGreaterThan(0)
    for (const { html } of left) {
      expect(html).toMatch(/En attente du retour de Marie-Charlotte — bot dans \d+s/)
      expect(html).not.toMatch(/truncate[^"]*amber-100|amber-100[^"]*truncate/)
    }
  })

  it('manche écourtée : l’écran dit pourquoi, et garde l’avis de retour s’il y a un absent', () => {
    const rendered = steps.map((s) => ({ ...render(s), fixture: s.fixture }))
    const short = rendered.filter(({ view }) => isShort(view))
    // Décrivant bot, et décrivant humain sans coéquipier présent pour deviner.
    expect(new Set(short.map((s) => s.fixture))).toEqual(new Set(['decrivant-bot', 'partie-arretee', 'partie-arretee-egalite']))
    for (const { html, view } of short) {
      expect(html).toContain(fr.games.tabou.game.shortRound)
      expect(html).not.toMatch(/truncate[^"]*amber-100|amber-100[^"]*truncate/)
      // À 2 contre 2 avec un départ de chaque côté, TOUTES les manches sont
      // écourtées : sans cette ligne, la TV ne disait jamais qui est attendu
      // ni combien de temps il reste avant que la partie soit perdue.
      const someoneAway = view.players.some((p) => !p.isBot && p.leftAt)
      if (someoneAway) expect(html).toMatch(/En attente du retour de .+ — bot dans \d+s/)
      else expect(html).not.toContain('En attente du retour')
    }
    expect(short.some(({ view }) => view.players.some((p) => !p.isBot && p.leftAt))).toBe(true)
    for (const { html, view } of rendered) {
      if (!isShort(view)) expect(html).not.toContain(fr.games.tabou.game.shortRound)
    }
  })

  it('partie arrêtée faute de joueurs : le score, la raison, et l’égalité quand il y en a une', () => {
    const ends = steps
      .map((s) => ({ ...render(s), fixture: s.fixture }))
      .filter(({ view }) => view.phase === 'finished')
    const stopped = ends.filter(({ view }) => view.scores.A < view.targetScore && view.scores.B < view.targetScore)
    expect(new Set(stopped.map((s) => s.fixture))).toEqual(new Set(['partie-arretee', 'partie-arretee-egalite']))
    for (const { html, view, fixture } of stopped) {
      expect(html).toContain(fr.games.tabou.game.victory.stopped)
      expect(html).toContain(`Équipe A ${view.scores.A} · Équipe B ${view.scores.B}`)
      if (fixture === 'partie-arretee-egalite') {
        expect(view.winnerTeam).toBeNull()
        expect(html).toContain(fr.games.tabou.game.victory.draw)
        expect(html).not.toContain(fr.games.tabou.game.victory.teamBWin)
      } else {
        expect(view.winnerTeam).toBe('A')
        // Le rendu échappe l'apostrophe droite de « L'équipe ».
        expect(html).toContain(fr.games.tabou.game.victory.teamAWin.replace(/'/g, '&#x27;'))
      }
    }
    // Une victoire au score cible ne parle pas d'arrêt.
    for (const { html } of ends.filter((e) => !stopped.includes(e))) {
      expect(html).not.toContain(fr.games.tabou.game.victory.stopped)
    }
  })

  it('aucune taille interdite à 3 mètres', () => {
    for (const step of steps) {
      const { html } = render(step)
      expect(html).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]/)
    }
  })
})
