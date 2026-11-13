import { readFileSync } from 'node:fs'
import { createElement, createRef, type ComponentProps, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { ChiffrePiegeBoomScreen } from '@/app/[locale]/games/chiffre-piege/components/chiffre-piege-ui'
import { ChiffrePiegeOnline } from '@/components/online/ChiffrePiegeOnline'
import { TvChiffrePiege } from '@/components/tv/TvChiffrePiege'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import type { TvRoomDto } from '@/lib/online-room'
import { phaseKey } from '@/lib/online/phase-clock'
import type { ChiffrePiegeBoom, ChiffrePiegeState } from './engine'
import type { ChiffrePiegeOnlineState } from './online-state'
import {
  applyChiffrePiegeRoomAction,
  buildChiffrePiegeState,
  markChiffrePiegePlayerLeft,
  toChiffrePiegeClientView,
  type ChiffrePiegeRoomActionResult,
} from './server-adapter'

/**
 * Le téléphone et la TV du Chiffre Piégé (et le BOUM du jeu local, écran
 * partagé) rendus côté serveur, hooks de salle simulés, avec le VRAI
 * catalogue des 4 langues : un argument ICU mal nommé
 * ou une clé existante mal visée fait échouer le rendu. Seules les clés que
 * l'intégration ajoute (fragments de la vague 2) peuvent manquer, et
 * seulement tant qu'elle n'est pas faite.
 */

const session = vi.hoisted(() => ({
  user: { id: 'u1', ambianceMode: 'alcool' },
  room: null as unknown,
  actionError: null as string | null,
}))

vi.mock('@/components/providers/AuthProvider', () => ({ useAuth: () => ({ user: session.user }) }))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({ room: session.room, voteRematch: async () => null, leaveRoom: async () => null }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: session.actionError, sendAction: async () => null }),
}))
vi.mock('@/hooks/useBotReferee', () => ({ useBotReferee: () => -1, useAdvanceTick: () => -1, useAfkTick: () => 0 }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  useGameTutorial: () => ({ open: false, reopen: () => {}, close: () => {} }),
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
}))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))
vi.mock('@/components/online/OnlineEndScreen', async () => {
  const { createElement: h } = await import('react')
  return {
    OnlineEndScreen: (props: { header: unknown; ranking?: unknown }) =>
      h('div', null, props.header as never, props.ranking as never),
  }
})

const LOCALES = ['fr', 'en', 'es', 'it'] as const
const catalogues = new Map<string, AbstractIntlMessages>()
function catalogue(locale: string): AbstractIntlMessages {
  const cached = catalogues.get(locale)
  if (cached) return cached
  const messages = JSON.parse(
    readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), 'utf8')
  ) as AbstractIntlMessages
  catalogues.set(locale, messages)
  return messages
}

/**
 * Sous-objets des fragments de la vague 2. Une clé manquante n'y est tolérée
 * que si son sous-objet entier manque au catalogue de la langue (fusion pas
 * faite) : une fois fusionné, une clé renommée ou supprimée fait échouer.
 */
const PENDING = [
  ['games', 'chiffre-piege', 'online'],
  ['games', 'chiffre-piege', 'tv'],
  ['games', 'chiffre-piege', 'soft', 'tv'],
]

function lookup(messages: unknown, path: readonly string[]): unknown {
  let node = messages
  for (const key of path) node = node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined
  return node
}

function pendingPrefixes(locale: string): string[] {
  const messages = catalogue(locale)
  return PENDING.filter((path) => lookup(messages, path) === undefined).map((path) => `${path.join('.')}.`)
}

function unexpected(errors: unknown[], locale: string): string[] {
  const pending = pendingPrefixes(locale)
  return errors
    .map((e) => e as { code?: string; message?: string })
    .filter((e) => !(e.code === 'MISSING_MESSAGE' && pending.some((key) => e.message?.includes(key))))
    .map((e) => `${e.code}: ${e.message}`)
}

/** Les <p> qui contiennent un <div> : HTML invalide, que React signale à chaque rendu. */
function blocksInParagraphs(html: string): string[] {
  return html.match(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?<div\b/g) ?? []
}

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const T0 = 1_790_000_000_000

const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, user: { displayName: `Joueur ${i + 1}` } }))

function accepted(result: ChiffrePiegeRoomActionResult): ChiffrePiegeOnlineState {
  if (!result.ok) throw new Error(result.error)
  return result.state
}

/** 3 humains (u1 au tour) et un bot, piège en 42. */
function table(game: Partial<ChiffrePiegeState> = {}, humans = 3, bots = 1): ChiffrePiegeOnlineState {
  const built = buildChiffrePiegeState(members(humans), bots, 'rendu', { max: 100, rounds: 3 })
  return { ...built, game: { ...built.game, turnIndex: 0, trap: 42, ...game } }
}

const boomOf = (state: ChiffrePiegeOnlineState) =>
  accepted(applyChiffrePiegeRoomAction(state, state.game.playerIds[state.game.turnIndex], { type: 'guess', value: 42 }, T0))

const finishedOf = (state: ChiffrePiegeOnlineState) => {
  const boom = boomOf({ ...state, game: { ...state.game, roundIndex: state.game.roundsTotal - 1 } })
  return accepted(applyChiffrePiegeRoomAction(boom, '__service__', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!))
}

const memberDtos = (state: ChiffrePiegeOnlineState) =>
  state.players
    .filter((p) => !p.isBot)
    .map((p) => ({
      userId: p.id,
      displayName: p.name,
      isHost: p.id === 'u1',
      isReady: true,
      isSelf: p.id === session.user.id,
      present: true,
      preferences: { icon: 'chope' },
      level: 3,
      role: 'user',
    }))

function intl(locale: string, errors: unknown[], screen: ReactElement) {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      {
        locale,
        messages: catalogue(locale),
        timeZone: 'Europe/Paris',
        onError: (error: unknown) => {
          errors.push(error)
        },
      },
      screen
    )
  )
}

function phone(state: ChiffrePiegeOnlineState, locale = 'fr', errors: unknown[] = []): string {
  session.room = {
    id: 'r',
    code: 'ABCDEF',
    gameId: 'chiffre-piege',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: null,
    gameStateJson: JSON.stringify(toChiffrePiegeClientView(state)),
    members: memberDtos(state),
    settings: {},
  }
  return intl(locale, errors, createElement(ChiffrePiegeOnline))
}

function tv(state: ChiffrePiegeOnlineState, locale = 'fr', errors: unknown[] = []): string {
  const room: TvRoomDto = {
    code: 'ABCDEF',
    status: 'playing',
    gameId: 'chiffre-piege',
    hostUserId: 'u1',
    members: memberDtos(state).map(({ userId, displayName, isHost, isReady, preferences, level, role }) => ({
      userId,
      displayName,
      isHost,
      isReady,
      preferences,
      level,
      role,
    })) as TvRoomDto['members'],
    settings: {},
    stateVersion: state.version,
    currentTurnUserId: null,
    gameStateJson: JSON.stringify(toChiffrePiegeClientView(state)),
  }
  return intl(locale, errors, createElement(TvChiffrePiege, { room, state: toChiffrePiegeClientView(state) }))
}

/** u2 est parti pendant son tour : son siège joue automatiquement. */
const leftAtTurn = () => markChiffrePiegePlayerLeft(table({ turnIndex: 1 }), 'u2', T0)!

const PHASES: [string, () => ChiffrePiegeOnlineState][] = [
  ['mon tour', () => table()],
  ['tour d’un autre', () => table({ turnIndex: 1 })],
  ['tour du bot', () => table({ turnIndex: 3 })],
  ['tour d’un parti', leftAtTurn],
  ['dernier nombre', () => table({ low: 42, high: 42 })],
  ['BOUM', () => boomOf(table())],
  ['classement', () => finishedOf(table())],
]

const withAmbiance = (mode: 'alcool' | 'soft', run: () => void) => {
  const previous = session.user.ambianceMode
  session.user.ambianceMode = mode
  try {
    run()
  } finally {
    session.user.ambianceMode = previous
  }
}

describe('ChiffrePiegeOnline : écran du téléphone', () => {
  it('se rend à chaque phase, dans les 4 langues et les 2 ambiances, sans clé ni argument fautif', () => {
    for (const mode of ['alcool', 'soft'] as const) {
      withAmbiance(mode, () => {
        for (const locale of LOCALES) {
          for (const [label, make] of PHASES) {
            const errors: unknown[] = []
            phone(make(), locale, errors)
            expect(unexpected(errors, locale), `${mode} ${locale} ${label}`).toEqual([])
          }
        }
      })
    }
  })

  it('mon tour : le champ numérique et le joker ; sinon, rien à taper', () => {
    const mine = phone(table())
    expect(mine).toContain('inputMode="numeric"')
    expect(mine).toContain('Je passe (joker) · 1 gorgée')
    expect(phone(table({ turnIndex: 1 }))).not.toContain('<input')
  })

  it('le dernier nombre se joue ou s’esquive au joker', () => {
    const html = phone(table({ low: 42, high: 42 }))
    expect(html).toContain('Jouer le 42')
    expect(html).toContain('Joue-le… ou grille ton joker.')
  })

  it('BOUM : le perdant et sa pénalité dans l’ambiance du téléphone, bouton pour les joueurs seulement', () => {
    const boom = boomOf(table())
    const html = phone(boom)
    expect(html).toContain('BOUM !')
    expect(html).toContain('Joueur 1 tombe sur le 42')
    expect(html).toContain('Joueur 1 boit 1 gorgée')
    expect(html.match(/<button/g)).toHaveLength(1)
    withAmbiance('soft', () => expect(phone(boom)).toContain('Joueur 1 perd 1 point'))
    const previous = session.user.id
    session.user.id = 'spectateur'
    try {
      expect(phone(boom)).not.toContain('<button')
    } finally {
      session.user.id = previous
    }
  })

  it('BOUM : un refus de « Manche suivante » se lit sur l’écran rouge', () => {
    const boom = boomOf(table())
    expect(phone(boom)).not.toContain('role="alert"')
    session.actionError = 'Laissez le temps de lire le résultat'
    try {
      const html = phone(boom)
      expect(html).toMatch(/role="alert"[^>]*>.*Laissez le temps de lire le résultat/)
      // Le compte à rebours reste affiché sous le refus (clé de fragment avant la fusion).
      expect(html).toMatch(/Manche suivante dans|online\.nextRoundIn/)
    } finally {
      session.actionError = null
    }
  })

  it('BOUM : le décor est coupé à l’écran, qui ne défile jamais de côté', () => {
    const html = phone(boomOf(table()))
    expect(html).toMatch(/<section[^>]*class="[^"]*\boverflow-y-auto overflow-x-hidden\b/)
    // Halo et rayons (46 rem, plus larges que tout téléphone) dans un calque qui les coupe.
    expect(html).toMatch(
      /<div aria-hidden="true" class="pointer-events-none absolute inset-0 overflow-hidden"><div class="absolute inset-0"[^>]*><\/div><div class="[^"]*w-\[46rem\]/
    )
  })

  it('manche suivante : la voix dit qui l’ouvre, le bandeau remonté après le BOUM se taisant', () => {
    // Joueur 1 tombe sur le piège : la manche 2 s’ouvre chez son voisin, Joueur 2.
    const boom = boomOf(table())
    const next = accepted(applyChiffrePiegeRoomAction(boom, 'u1', { type: 'next', phaseKey: phaseKey(boom) }, T0 + 60_000))
    expect(phone(next)).toMatch(/role="status" aria-live="polite" class="sr-only">Manche 2 : Joueur 2 ouvre\. Le piège/)
    const previous = session.user.id
    session.user.id = 'u2'
    try {
      expect(phone(next)).toMatch(/role="status" aria-live="polite" class="sr-only">Manche 2 : à toi d’ouvrir\. Le piège/)
    } finally {
      session.user.id = previous
    }
  })

  it('tour d’un parti : son siège joue seul, personne ne l’attend', () => {
    const html = phone(leftAtTurn())
    expect(html).not.toContain('<input')
    expect(html).toMatch(/son tour se joue automatiquement|online\.autoTurn/)
    expect(html).not.toMatch(/choisit son nombre|online\.waitingTurn/)
  })

  it('classement final : chaque joueur et sa pénalité', () => {
    const html = phone(finishedOf(table()))
    expect(html).toContain('Classement final')
    for (const name of ['Joueur 1', 'Joueur 2', 'Joueur 3']) expect(html).toContain(name)
    expect(html).toContain('1 gorgée')
  })

  it('classement final : le détail se replie à la ligne, « joker grillé » n’est jamais coupé', () => {
    // À 375 px, l’ellipse (truncate) mangeait la fin de la ligne.
    const html = phone(finishedOf(table({ jokersUsed: { u2: true } })))
    expect(html).toMatch(/<p class="[^"]*\bbreak-words\b[^"]*">Jamais piégé · joker grillé<\/p>/)
    expect(html).not.toMatch(/class="[^"]*\btruncate\b[^"]*">(Piégé|Jamais piégé)/)
  })
})

describe('ChiffrePiegeBoomScreen : BOUM du jeu local', () => {
  const boom: ChiffrePiegeBoom = { playerId: 'lea', trap: 47, attempts: 3, penalty: 3, roundIndex: 0, at: T0 }
  const local = (locale = 'fr', ambiance: AmbianceMode = 'alcool', errors: unknown[] = []) =>
    intl(
      locale,
      errors,
      createElement(ChiffrePiegeBoomScreen, {
        boom,
        loser: { name: 'Léa' },
        roundIndex: 0,
        roundsTotal: 5,
        nextStarter: { name: 'Tom' },
        canContinue: true,
        onContinue: () => {},
        ambiance,
        titleRef: createRef<HTMLHeadingElement>(),
      })
    )

  it('se rend dans les 4 langues et les 2 ambiances, sans clé ni argument fautif', () => {
    for (const ambiance of ['alcool', 'soft'] as const) {
      for (const locale of LOCALES) {
        const errors: unknown[] = []
        local(locale, ambiance, errors)
        expect(unexpected(errors, locale), `${ambiance} ${locale}`).toEqual([])
      }
    }
  })

  it('l’icône du joueur (PlayerIcon, un <div>) n’est jamais dans un paragraphe', () => {
    // React criait « <div> cannot be a descendant of <p> » à chaque BOUM local.
    const html = local()
    expect(html).toMatch(/aria-hidden="true"><span class="[^"]*">L<\/span><\/div>/)
    expect(html).toContain('Léa tombe sur le 47')
    expect(html).toContain('Léa boit 3 gorgées')
    expect(blocksInParagraphs(html)).toEqual([])
  })
})

describe('balisage', () => {
  it('ni le téléphone ni la TV ne mettent un <div> dans un <p>', () => {
    for (const [label, make] of PHASES) {
      expect(blocksInParagraphs(phone(make())), `téléphone ${label}`).toEqual([])
      expect(blocksInParagraphs(tv(make())), `TV ${label}`).toEqual([])
    }
  })
})

describe('TvChiffrePiege : écran TV', () => {
  const full = () => table({}, 2, 14)

  it('se rend à chaque phase, dans les 4 langues et les 2 ambiances, sans clé ni argument fautif', () => {
    for (const mode of ['alcool', 'soft'] as const) {
      withAmbiance(mode, () => {
        for (const locale of LOCALES) {
          for (const [label, make] of [...PHASES, ['16 joueurs', full] as [string, () => ChiffrePiegeOnlineState]]) {
            const errors: unknown[] = []
            tv(make(), locale, errors)
            expect(unexpected(errors, locale), `${mode} ${locale} ${label}`).toEqual([])
          }
        }
      })
    }
  })

  it('lisible à 3 m : ni petit texte, ni taille en px, ni opacité morte', () => {
    for (const [label, make] of [...PHASES, ['16 joueurs', full] as [string, () => ChiffrePiegeOnlineState]]) {
      const html = tv(make())
      expect(html, label).not.toMatch(/\btext-(xs|sm)\b|text-\[\d+px\]|\/(15|35|45|55|65|85)\b/)
      expect(html, label).not.toMatch(/style="[^"]*\d+px/)
    }
  })

  it('16 joueurs : toute la table à l’écran, en jeu comme au classement', () => {
    const state = full()
    expect(state.players).toHaveLength(16)
    for (const html of [tv(state), tv(finishedOf(state))]) {
      for (const p of state.players) expect(html).toContain(p.name)
    }
  })

  it('BOUM en grand, pénalité dans l’ambiance de la télé', () => {
    const boom = boomOf(table())
    expect(tv(boom)).toContain('BOUM !')
    expect(tv(boom)).toContain('Joueur 1 boit 1 gorgée')
    withAmbiance('soft', () => expect(tv(boom)).toContain('Joueur 1 perd 1 point'))
  })

  it('textes tronqués : interligne posé après la taille, les jambages ne sont pas rognés', () => {
    // text-6xl a un interligne de 1 : tailwind-merge effaçait un leading-tight posé AVANT lui.
    expect(tv(table())).toMatch(/class="[^"]*\btruncate\b[^"]*\btext-6xl\b[^"]*\bleading-tight\b[^"]*">Joueur 1</)
    expect(tv(boomOf(table()))).toMatch(/class="[^"]*\btruncate leading-tight\b[^"]*">Joueur 1 tombe sur le 42</)
  })
})

describe('chiffres et textes', () => {
  it('chiffres alignés (lining-nums) partout où Playfair affiche un nombre', () => {
    // Ses chiffres elzéviriens lisaient « 1 et 1oo », « o gorgée ».
    let checked = 0
    for (const [label, make] of PHASES) {
      for (const html of [phone(make()), tv(make())]) {
        const numbers = (html.match(/class="[^"]*"/g) ?? []).filter(
          (c) => /\bfont-display\b/.test(c) && /\btabular-nums\b/.test(c)
        )
        for (const c of numbers) expect(c, label).toMatch(/\blining-nums\b/)
        checked += numbers.length
      }
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('le tutoriel, lu dans les deux ambiances (briefing de table, modale 💡), ne parle jamais d’alcool', () => {
    const ALCOHOL = /gorgée|boire|\bboit\b|\bbu\b|\bsips?\b|drink|\btragos?\b|beber|\bsors[oi]\b|\bbere\b|alcool|alcohol|alcol/i
    for (const locale of LOCALES) {
      const steps = lookup(catalogue(locale), ['games', 'chiffre-piege', 'tutorial', 'steps']) as { title: string; body: string }[]
      expect(steps.length, locale).toBeGreaterThan(0)
      for (const step of steps) expect(`${step.title} ${step.body}`, locale).not.toMatch(ALCOHOL)
    }
  })
})
