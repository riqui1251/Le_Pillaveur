import React, { createElement, type ComponentProps, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import fr from '../../../messages/fr.json'
import type { TvRoomDto } from '@/lib/online-room'
import type { PetitBuveurCastState } from '@/lib/cast-types'
import { autoAction, createInitialState, reduce, type EngineState } from '@/lib/petit-buveur/engine'
import { toClientView } from '@/lib/petit-buveur/server-adapter'
import { build as buildOnlineFixtures } from '@/app/[locale]/tv/apercu-dev/fixtures/petit-buveur'
import { build as buildLocalFixtures } from '@/app/[locale]/tv/apercu-dev/fixtures/petit-buveur-local'
import type { TvPreviewFixture } from '@/app/[locale]/tv/apercu-dev/fixture-kit'
import { TvPetitBuveur, TvPetitBuveurCast } from './TvPetitBuveur'
import { TvRoomScreen } from './TvRoomScreen'
import { TvPbVictory } from './petit-buveur/TvPbVictory'
import { usePbTexts } from './petit-buveur/use-pb-texts'
import { rankingDensity, SPEECH_BLOCK_REM } from './petit-buveur/model'

// La config Vitest (env node, sans plugin React) compile le JSX en React.createElement
// sans l'importer : le composant le cherche donc en global.
;(globalThis as { React?: typeof React }).React = React

// next-intl/navigation réclame le routeur de Next, absent d'un rendu statique.
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, ...rest }: { href: string }) => createElement('a', { href, ...rest }),
}))

const room = {
  code: 'ABCDEF',
  status: 'cast',
  gameId: null,
  hostUserId: 'h',
  members: [],
  settings: {},
  stateVersion: 1,
  currentTurnUserId: null,
  gameStateJson: null,
} as unknown as TvRoomDto

function html(node: ReactElement): string {
  return renderToStaticMarkup(
    createElement(
      NextIntlClientProvider,
      { locale: 'fr', messages: fr as unknown as AbstractIntlMessages, timeZone: 'Europe/Paris' } as ComponentProps<typeof NextIntlClientProvider>,
      node
    )
  )
}

const base: PetitBuveurCastState = {
  castKind: 'petit-buveur',
  players: [
    { id: 'a', name: 'Alice', position: 2, drinks: 3 },
    { id: 'b', name: 'Bob', position: 0, drinks: 0 },
  ],
  currentPlayer: 0,
  phase: 'playing',
  winner: null,
}

describe('TvPetitBuveurCast — ambiance diffusée', () => {
  it("en Soft, aucune bière ni gorgée sur l'écran TV", () => {
    const out = html(createElement(TvPetitBuveurCast, { room, state: { ...base, ambiance: 'soft' } }))
    expect(out).not.toContain('🍺')
    expect(out).not.toContain('lucide-beer')
    expect(out).not.toMatch(/gorgée/i)
    expect(out).toContain('3 gage(s)')
  })

  it('en ambiance alcool, le compteur reste en gorgées', () => {
    const out = html(createElement(TvPetitBuveurCast, { room, state: { ...base, ambiance: 'alcool' } }))
    expect(out).toContain('lucide-beer')
    expect(out).toContain('3 gorgée(s)')
  })

  it('la case poussée pendant le tour en cours est posée ; celle du tour précédent non', () => {
    const current = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: { ...base, dice: { value: 2, seq: 10 }, reveal: { caseType: 'protection', seq: 11 } },
      })
    )
    expect(current).toContain('🛡️')
    const stale = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: { ...base, dice: { value: 2, seq: 12 }, reveal: { caseType: 'protection', seq: 11 } },
      })
    )
    expect(stale).not.toContain('Protection')
  })
})

describe('TvPetitBuveurCast — ce que montre le téléphone, pas plus', () => {
  const long: PetitBuveurCastState = {
    ...base,
    players: ['Jean-Baptiste', 'Marie-Charlotte', 'Léa', 'Hugo'].map((name, i) => ({
      id: `p${i}`,
      name,
      position: [6, 2, 6, 9][i],
      drinks: [3, 1, 0, 4][i],
      ...(i === 0 ? { icon: '🦊' } : {}),
    })),
    dice: { value: 4, seq: 10, phase: 'result' },
    turnCount: 3,
  }

  it('choix de cible : « Qui cibler ? » et qui choisit, la case reste cachée', () => {
    const out = html(createElement(TvPetitBuveurCast, { room, state: { ...long, stage: { kind: 'target' } } }))
    expect(out).toContain('Qui cibler ?')
    expect(out).toContain('En attente de Jean-Baptiste…')
    for (const label of ['Gorgées', 'Défi', 'Malédiction', 'Protection', 'Bombe']) expect(out).not.toContain(label)
  })

  it('entre deux lancers : « En attente de X… » sur deux lignes au besoin, jamais tronqué', () => {
    const out = html(createElement(TvPetitBuveurCast, { room, state: { ...long, currentPlayer: 1 } }))
    expect(out).toMatch(/class="line-clamp-2 [^"]*text-4xl[^"]*">En attente de Marie-Charlotte…/)
  })

  it('numéros de case au-dessus des pions, même sur une case bondée', () => {
    const out = html(createElement(TvPetitBuveurCast, { room, state: long }))
    expect(out).toMatch(/absolute left-1\.5 top-1 z-\[1\][^"]*"[^>]*>7</)
  })

  it('fenêtre de la roue : le résultat seulement une fois la roue arrêtée', () => {
    const spinning = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: { ...long, stage: { kind: 'case', caseType: 'roue', rolling: true, result: null } },
      })
    )
    expect(spinning).toContain('Roue des gorgées')
    expect(spinning).toContain('La roue tourne…')
    const done = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: { ...long, stage: { kind: 'case', caseType: 'roue', result: 'Résultat : 5 gorgées' } },
      })
    )
    expect(done).toContain('Résultat : 5 gorgées')
  })

  it('effet de la case : texte du téléphone, pastilles, case et dé ; effets en cours listés', () => {
    const out = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: {
          ...long,
          reveal: {
            caseType: 'malediction',
            seq: 11,
            lines: ['👻 Hugo est maudit pendant 3 tours !'],
            caseNumber: 7,
            dice: 4,
            targetId: 'p3',
            changes: [],
          },
          effects: [
            { kind: 'curse', playerId: 'p3', remaining: 3 },
            { kind: 'chain', playerId: 'p0', partnerId: 'p1', remaining: 5 },
          ],
        },
      })
    )
    expect(out).toContain('Malédiction')
    expect(out).toContain('👻 Hugo est maudit pendant 3 tours !')
    expect(out).toContain('Case 7')
    expect(out).toContain('Effets en cours')
    // Le partenaire de la chaîne a sa propre ligne : les deux noms en entier, jamais « A ↔ B » tronqué d'un bloc.
    expect(out).not.toContain('Jean-Baptiste ↔ Marie-Charlotte')
    expect(out).toMatch(/>Jean-Baptiste<\/span>/)
    expect(out).toMatch(/↔<\/span>.*?>Marie-Charlotte<\/span>/)
    expect(out).toContain('Malédiction')
    expect(out).toContain('3 tour(s)')
    expect(out).toContain('Tour 3')
  })

  it('beaucoup d’effets : pastilles à pions (porteur et partenaire), noms pour les lecteurs d’écran', () => {
    const out = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: {
          ...long,
          effects: [
            { kind: 'curse', playerId: 'p3', remaining: 3 },
            { kind: 'chain', playerId: 'p0', partnerId: 'p1', remaining: 5 },
            { kind: 'protection', playerId: 'p1', remaining: 2 },
            { kind: 'mirror', playerId: 'p2', partnerId: 'p1', remaining: 2 },
            { kind: 'skip', playerId: 'p0', remaining: 1 },
          ],
        },
      })
    )
    expect(out).toContain('Jean-Baptiste ↔ Marie-Charlotte')
    expect(out).toContain('Léa → Marie-Charlotte')
    expect(out).toContain('grid-cols-2')
  })

  it('pile ou face visé sur un nom long : le titre garde sa ligne, la cible a la sienne', () => {
    const out = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: { ...long, stage: { kind: 'case', caseType: 'pile-face', targetId: 'p1', rolling: true, result: null } },
      })
    )
    const title = out.indexOf('>Pile ou face</p>')
    const target = out.indexOf('🎯')
    expect(title).toBeGreaterThan(-1)
    expect(target).toBeGreaterThan(title)
    expect(out.slice(title, target)).toContain('</div>')
    expect(out).toContain('La pièce tourne…')
  })

  it('verdict d’un défi : qui juge, sans effet appliqué', () => {
    const out = html(
      createElement(TvPetitBuveurCast, {
        room,
        state: {
          ...long,
          reveal: {
            caseType: 'defi',
            seq: 11,
            detail: 'Défi : Imite un chat ou bois 2 gorgée(s) !',
            lines: ['Joueur ciblé : Hugo'],
            targetId: 'p3',
            verdictPending: true,
          },
        },
      })
    )
    expect(out).toContain('Jean-Baptiste juge si Hugo a relevé le défi…')
    expect(out).toContain('Imite un chat')
  })

  it('aucune taille interdite (text-xs, text-sm, px) dans le rendu diffusé', () => {
    for (const extra of [
      { stage: { kind: 'duel' as const, caseNumber: 7, opponentId: 'p2', result: 'Léa gagne' } },
      { stage: { kind: 'case' as const, caseType: 'de-honte', die: 3, result: 'Résultat : 2 gorgées' } },
      {
        reveal: { caseType: 'gorgée', seq: 11, lines: ['Hugo boit 3 gorgée(s) !'], changes: [{ playerId: 'p3', drinks: 3, from: 9, to: 9 }] },
        effects: [{ kind: 'protection' as const, playerId: 'p1', remaining: 2 }],
      },
    ]) {
      const out = html(createElement(TvPetitBuveurCast, { room, state: { ...long, ...extra } }))
      expect(out).not.toMatch(/\btext-(xs|sm)\b/)
      expect(out).not.toMatch(/text-\[\d+px\]/)
      expect(out).not.toMatch(/\d+px/)
    }
  })
})

const settings = { difficulty: 'normal' as const, defiDrinks: Array.from({ length: 60 }, () => 2) }

function playUntil(pred: (s: EngineState) => boolean): EngineState {
  for (let seed = 1; seed <= 20; seed += 1) {
    let s = createInitialState(
      ['Léa', 'Jean-Baptiste', 'Marie-Charlotte', 'Hugo'].map((name, i) => ({ id: `u${i + 1}`, name })),
      settings,
      `tv-render-${seed}`
    )
    for (let i = 0; i < 400 && s.phase !== 'finished'; i += 1) {
      const n = autoAction(s)
      s = reduce(n.state, n.action)
      if (pred(s)) return s
    }
  }
  throw new Error('situation introuvable')
}

const onlineRoom = { ...room, status: 'playing', gameId: 'petit-buveur' } as TvRoomDto

describe('TvPetitBuveur — partie en ligne', () => {
  it('case en attente : encadré public avec qui doit décider, sans effet appliqué', () => {
    const s = playUntil((x) => x.phase === 'awaiting-interaction' && Boolean(x.pending?.needsTarget) && !x.pending?.stage)
    const out = html(createElement(TvPetitBuveur, { room: onlineRoom, state: toClientView(s) }))
    const decider = s.players[s.currentPlayer].name
    expect(out).toContain(`En attente de ${decider}…`)
    expect(out).not.toContain('Aucun dégât')
  })

  it('duel en attente : « Duel sur la case » et qui décide, la case tirée reste cachée', () => {
    const s = playUntil((x) => x.pending?.stage === 'duel')
    const out = html(createElement(TvPetitBuveur, { room: onlineRoom, state: toClientView(s) }))
    expect(out).toContain('Duel sur la case')
    expect(out).toContain(`En attente de ${s.players[s.currentPlayer].name}…`)
  })

  it('effets en cours listés avec le joueur et les tours restants', () => {
    const s = playUntil((x) => x.players.some((p) => p.protected && (p.protectionTurnsLeft ?? 0) > 0) && !x.pending)
    const out = html(createElement(TvPetitBuveur, { room: onlineRoom, state: toClientView(s) }))
    expect(out).toContain('Effets en cours')
    expect(out).toContain('🛡️')
    expect(out).toMatch(/\d+ tour\(s\)/)
  })

  it('aucune taille interdite dans le rendu TV (text-xs, text-sm, px)', () => {
    const s = playUntil((x) => !x.pending && Boolean(x.lastOutcome) && x.turnCount >= 3)
    const out = html(createElement(TvPetitBuveur, { room: onlineRoom, state: toClientView(s) }))
    expect(out).not.toMatch(/\btext-(xs|sm)\b/)
    expect(out).not.toMatch(/text-\[\d+px\]/)
    expect(out).not.toMatch(/\d+px/)
  })

  it('TV allumée sur une partie déjà finie : écran de fin directement, rien à attendre', () => {
    const s = playUntil((x) => x.phase === 'finished')
    const out = html(createElement(TvPetitBuveur, { room: onlineRoom, state: toClientView(s) }))
    expect(out).toContain('Classement final')
    expect(out).toContain(s.players.find((p) => p.id === s.winner)?.name ?? '?')
  })
})

describe('TvPetitBuveur — paroles des bots', () => {
  /** 4 joueurs et 3 bots, carte posée, rien en attente. */
  function sevenWithBots(): EngineState {
    const names = ['Léa', 'Jean-Baptiste', 'Marie-Charlotte', 'Hugo', 'Raoul', 'Josiane', 'Kéké']
    let s = createInitialState(
      names.map((name, i) => ({ id: `u${i + 1}`, name })),
      settings,
      'tv-paroles'
    )
    s = { ...s, players: s.players.map((p, i) => (i >= 4 ? { ...p, isBot: true } : p)) }
    for (let i = 0; i < 400 && (s.pending || !s.lastOutcome || s.turnCount < 2); i += 1) {
      const n = autoAction(s)
      s = reduce(n.state, n.action)
    }
    return s
  }

  it('la dernière parole d’un bot au pied du classement, coupée à quatre lignes ; le classement lui cède sa hauteur', () => {
    const s = sevenWithBots()
    expect(s.phase).toBe('playing')
    const silent = html(createElement(TvPetitBuveur, { room: onlineRoom, state: toClientView(s) }))
    const spoken = reduce(s, {
      type: 'SAY',
      moves: [
        { playerId: 'u5', kind: 'overtake', targetId: 'u1' },
        { playerId: 'u6', kind: 'aim', targetId: 'u2' },
      ],
    })
    const out = html(createElement(TvPetitBuveur, { room: onlineRoom, state: toClientView(spoken) }))
    expect(silent).not.toContain('Fil de la table')
    expect(out).toContain('aria-label="Fil de la table"')
    // Une seule bulle, la dernière : Josiane taquine Jean-Baptiste.
    expect(out.match(/rounded-tl-sm/g)).toHaveLength(1)
    expect(out).toContain('<span class="font-bold">Josiane</span>')
    expect(out).toContain('Jean-Baptiste')
    expect(out).toContain('[&amp;_li&gt;div]:line-clamp-4')
    // Sept joueurs : la case sous chaque nom tant que personne ne parle, sur une ligne quand la bulle prend sa place.
    expect(rankingDensity(7).mode).toBe('detailed')
    expect(rankingDensity(7, SPEECH_BLOCK_REM).mode).toBe('single')
    const caseLines = /text-lg font-semibold leading-tight text-white\/75">/g
    expect(silent.match(caseLines)).toHaveLength(7)
    expect(out.match(caseLines)).toBeNull()
    expect(out).not.toMatch(/\btext-(xs|sm)\b/)
    expect(out).not.toMatch(/\d+px/)
  })
})

describe('TvPbVictory — écran de fin du Petit Buveur', () => {
  const players = [
    { id: 'a', name: 'Alice', index: 0, icon: null, position: 29, drinks: 3 },
    { id: 'b', name: 'Bob', index: 1, icon: null, position: 12, drinks: 5 },
  ]

  function renderVictory(soft: boolean): string {
    // Les textes passent par le même enrobage que l'écran (gages en Soft).
    function Probe() {
      const texts = usePbTexts(soft)
      return createElement(TvPbVictory, { players, winnerId: 'a', turnCount: 9, difficulty: 'normal', texts })
    }
    return html(createElement(Probe))
  }

  it('en Soft, le classement final compte des gages, sans bière', () => {
    const out = renderVictory(true)
    expect(out).not.toContain('🍺')
    expect(out).not.toContain('lucide-beer')
    expect(out).toContain('3 gage(s)')
  })

  it('en ambiance alcool, le classement final compte des gorgées, avec tours et difficulté', () => {
    const out = renderVictory(false)
    expect(out).toContain('lucide-beer')
    expect(out).toContain('3 gorgée(s)')
    expect(out).toContain('Classement final')
    expect(out).toContain('Normal')
  })
})

describe('fixtures de l’aperçu TV — chaque étape rendue comme une télé allumée sur cet état', () => {
  const online = buildOnlineFixtures()
  const local = buildLocalFixtures()

  function screen(fixtures: TvPreviewFixture[], id: string, stepIndex = 0): string {
    const step = fixtures.find((f) => f.id === id)?.steps[stepIndex]
    if (!step) throw new Error(`fixture ${id}#${stepIndex} absente`)
    return html(
      createElement(TvRoomScreen, {
        code: step.room?.code ?? 'APERCU',
        room: step.room,
        notFound: Boolean(step.notFound),
        frame: step.frame ?? null,
      })
    )
  }

  it('aucune taille illisible, aucune taille en px, aucune opacité morte', () => {
    for (const [fixtures, label] of [
      [online, 'en ligne'],
      [local, 'local'],
    ] as const) {
      for (const fixture of fixtures) {
        fixture.steps.forEach((_, i) => {
          const main = screen(fixtures, fixture.id, i).split('<main')[1] ?? ''
          const where = `${label} ${fixture.id}#${i}`
          expect(main, where).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]/)
          expect(main, where).not.toMatch(/\d+px/)
          expect(main, where).not.toMatch(/\/(15|35|45|55|65|85)\b/)
        })
      }
    }
  })

  it('20 joueurs sur la case 1 : douze pions et « +8 », le classement résumé', () => {
    const out = screen(online, 'debut-20')
    expect(out).toMatch(/col-span-full[^>]*>\+8</)
    expect(out).toMatch(/<li[^>]*>\+6<\/li>/)
  })

  it('trois absents : deux nommés en tête du classement, « +1 », aucun dans la colonne de la carte', () => {
    const out = screen(online, 'absents-12')
    expect(out.match(/En attente du retour de/g)?.length).toBe(2)
    expect(out).toMatch(/>\+1<\/p>/)
    const aside = out.split('<aside')[1] ?? ''
    expect(aside).toContain('En attente du retour de')
  })

  it('partie finie : le QR de l’en-tête reste (la fin se dévoile avec le pion gagnant)', () => {
    const [header] = screen(online, 'fin-12').split('<main')
    expect(header).toContain('<svg')
  })

  it('un bot commente le coup : une bulle, au pied du classement', () => {
    const out = screen(online, 'paroles-bot-7')
    expect(out).toContain('aria-label="Fil de la table"')
    expect(out.match(/rounded-tl-sm/g)).toHaveLength(1)
    expect(out.split('<aside')[1] ?? '').toContain('Fil de la table')
  })

  it('attente Chance et Téléport : qui décide, en entier', () => {
    expect(screen(online, 'attente-chance-12')).toContain('Chance')
    expect(screen(online, 'attente-teleport-12')).toContain('Téléport')
  })
})
