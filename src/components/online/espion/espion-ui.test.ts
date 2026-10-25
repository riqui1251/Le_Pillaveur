import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it } from 'vitest'
import type { TvRoomDto } from '@/lib/online-room'
import { phaseKey } from '@/lib/online/phase-clock'
import { createEspionState, reduceEspion, toEspionClientView, toEspionSpectatorView, type EspionSpeech } from '@/lib/espion/engine'
import { espionLocationsFor, getEspionLocations } from '@/lib/espion/data'
import { TvEspion } from '@/components/tv/TvEspion'
import type { EspionQuestionId } from '@/lib/espion/data/questions'
import { EspionTableTalk, espionAimedBy, espionExchangeKeys } from './EspionTableTalk'
import { QuestionCard } from './QuestionCard'
import { AskSheet } from './AskSheet'
import { EspionNotebook } from './EspionNotebook'
import { LocationGuessGrid } from './LocationGuessGrid'
import { EspionRoleCard } from './EspionRoleCard'
import { espionTurn } from './espion-turn'

/**
 * Les écrans du fil de questions, rendus côté serveur avec le VRAI catalogue
 * de chaque langue : une clé absente ou un argument ICU mal nommé ferait
 * échouer le rendu, pas seulement la parité.
 */

const LOCALES = ['fr', 'en', 'es', 'it'] as const
type Catalogue = AbstractIntlMessages & { games: { espion: { game: Record<string, unknown> } } }
const catalogue = (locale: string): Catalogue =>
  JSON.parse(readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8'))
const qa = (locale: string) => catalogue(locale).games.espion.game.qa as Record<string, Record<string, string> | string>

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

function render(element: ReactElement, locale: string, errors: unknown[]): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      { locale, messages: catalogue(locale), timeZone: 'Europe/Paris', onError: (e) => void errors.push(e) },
      element
    )
  )
}

const PLAYERS = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'b1', name: 'Raoul', isBot: true },
  { id: 'b2', name: 'Suzette', isBot: true },
]
const iconOf = (p: { isBot: boolean }) => (p.isBot ? '🤖' : '🦊')
const entry = (sp: Omit<EspionSpeech, 'round'>): EspionSpeech => ({ ...sp, round: 1 })
const FEED: EspionSpeech[] = [
  entry({ playerId: 'b1', kind: 'question', targetId: 'b2', questionId: 'when', at: 1 }),
  entry({ playerId: 'b2', kind: 'answer', targetId: 'b1', questionId: 'when', value: 'night', at: 2 }),
  entry({ playerId: 'b2', kind: 'accuse', targetId: 'h', at: 3 }),
  entry({ playerId: 'b1', kind: 'rally', targetId: 'h', at: 4 }),
  entry({ playerId: 'h', kind: 'rally', targetId: 'h', at: 5, quiet: true }),
]

/** Le texte d'un rendu ; les espaces insécables du catalogue survivent (pas de classe d'espaces ici). */
const textOf = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/ +/g, ' ')

describe('écrans du fil de questions, dans les 4 langues', () => {
  it('le fil : une bulle par entrée non silencieuse, question et réponse citées, badge sur l’accusation qui me vise', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(createElement(EspionTableTalk, { speech: FEED, round: 1, players: PLAYERS, iconOf, meId: 'h' }), locale, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(4)
      const when = qa(locale).when as Record<string, string>
      const text = textOf(html)
      expect([when.q, when.q_2].some((q) => text.includes(q)), `${locale} : ${text}`).toBe(true)
      expect([when.night, when.night_2, when.night_3].some((v) => text.includes(v)), `${locale} : ${text}`).toBe(true)
      expect(text, locale).toContain(catalogue(locale).games.espion.game.accusedYou as string)
    }
  })

  it('la carte de l’interrogé : la question, une touche par réponse et « ça dépend »', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(
        createElement(QuestionCard, { askerName: 'Raoul', questionId: 'price', askedAt: Date.now(), disabled: false, onAnswer: () => undefined }),
        locale,
        errors
      )
      expect(errors, locale).toEqual([])
      const price = qa(locale).price as Record<string, string>
      const text = textOf(html)
      expect(text, locale).toContain(price.q)
      for (const v of ['free', 'cheap', 'pricey']) expect(text, `${locale}.${v}`).toContain(price[v])
      expect(text, locale).toContain(qa(locale).any as string)
      expect(html.match(/<button/g), locale).toHaveLength(4)
    }
  })

  it('la carte reprend mot pour mot la tournure de la question lue dans le fil', () => {
    for (const locale of LOCALES) {
      const when = qa(locale).when as Record<string, string>
      const has = (key: string) => key.startsWith('qa.when.') && key.split('.').pop()! in when
      const keys = ['b1', 'b2', 'b3', 'b4'].map((askerId) => ({ askerId, key: espionExchangeKeys({ authorId: askerId, round: 1, questionId: 'when' }, has).question }))
      // Les graines couvrent les deux tournures : sinon le test ne prouverait rien.
      expect(new Set(keys.map((k) => k.key)).size, locale).toBe(2)
      for (const { askerId, key } of keys) {
        const errors: unknown[] = []
        const feed = [entry({ playerId: askerId, kind: 'question', targetId: 'h', questionId: 'when', at: 1 })]
        const players = [...PLAYERS, { id: askerId, name: 'Mila', isBot: true }]
        const bubble = textOf(render(createElement(EspionTableTalk, { speech: feed, round: 1, players, iconOf, meId: 'h' }), locale, errors))
        const card = textOf(
          render(
            createElement(QuestionCard, { askerName: 'Mila', questionId: 'when', questionKey: key, askedAt: Date.now(), disabled: false, onAnswer: () => undefined }),
            locale,
            errors
          )
        )
        const phrase = when[key.split('.').pop()!]
        expect(bubble, `${locale} ${askerId}`).toContain(phrase)
        expect(card, `${locale} ${askerId}`).toContain(phrase)
        expect(errors, locale).toEqual([])
      }
    }
  })

  it('la feuille de question, le carnet et la grille de devinette se rendent sans clé manquante', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const askProps = {
        title: 'T',
        targets: PLAYERS.filter((p) => p.id !== 'h'),
        excludeIds: ['b2'],
        excludedMeta: 'M',
        iconOf,
        selfId: 'h',
        questionsFor: (): EspionQuestionId[] => ['where', 'when', 'mood'],
        onTargetChange: () => undefined,
        disabled: false,
        onAsk: () => undefined,
      }
      // D'abord la cible (la grisée dit pourquoi), puis les trois questions : Retour et Annuler sont dans la barre du bas.
      const pickTarget = render(createElement(AskSheet, { ...askProps, targetId: null }), locale, errors)
      expect(pickTarget.match(/<button/g), locale).toHaveLength(2)
      expect(textOf(pickTarget).split(' M ').length - 1, locale).toBe(1)
      const pickQuestion = render(createElement(AskSheet, { ...askProps, targetId: 'b1' }), locale, errors)
      expect(pickQuestion.match(/<button/g), locale).toHaveLength(3)
      expect(textOf(pickQuestion), locale).toContain('Raoul')
      const notebook = render(
        createElement(EspionNotebook, { speech: FEED, round: 1, nameOf: (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? '—' }),
        locale,
        errors
      )
      expect(textOf(notebook), locale).toContain('Suzette')
      const gridProps = {
        locations: espionLocationsFor(locale),
        struck: ['plage'],
        onToggle: () => undefined,
        onSelect: () => undefined,
        disabled: false,
      }
      const grid = render(createElement(LocationGuessGrid, { ...gridProps, guessing: false, selectedId: null }), locale, errors)
      expect(grid.match(/line-through/g), locale).toHaveLength(1)
      // Mode devinette : le toucher sélectionne seulement, l'essai part de la barre du bas.
      const other = espionLocationsFor(locale).find((l) => l.id !== 'plage')!
      const guess = render(createElement(LocationGuessGrid, { ...gridProps, guessing: true, selectedId: other.id }), locale, errors)
      expect(guess.match(/aria-pressed="true"/g), locale).toHaveLength(1)
      // Un lieu rayé ne se devine pas.
      expect(guess.match(/disabled=""/g), locale).toHaveLength(1)
      expect(errors, locale).toEqual([])
    }
  })
})

describe('l’écran de l’espion ne se reconnaît pas de loin', () => {
  it('même carte crème, même hauteur, mêmes lignes pour l’espion et pour l’équipe ; le dos ne montre rien', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const props = { hidden: false, onHiddenChange: () => undefined }
      const crew = render(createElement(EspionRoleCard, { ...props, location: 'Hôpital' }), locale, errors)
      const spy = render(createElement(EspionRoleCard, { ...props, location: null }), locale, errors)
      const skeleton = (html: string) => html.replace(/>[^<]*</g, '><').replace(/aria-label="[^"]*"/g, '')
      expect(skeleton(spy), locale).toBe(skeleton(crew))
      expect(spy, locale).toContain('bg-cream')
      expect(textOf(crew), locale).toContain('Hôpital')
      // Le lieu passe sur deux lignes plutôt que d'être coupé (« Chantier de construction » à 375 px).
      expect(crew, locale).not.toMatch(/\btruncate\b/)
      expect(crew, locale).toContain('line-clamp-2')
      const back = render(createElement(EspionRoleCard, { ...props, hidden: true, location: 'Hôpital' }), locale, errors)
      expect(textOf(back), locale).not.toContain('Hôpital')
      // Un seul bouton œil, hors de la carte qui se retourne : le focus clavier survit à la bascule.
      expect(back.match(/<button/g), locale).toHaveLength(1)
      expect(crew.match(/<button/g), locale).toHaveLength(1)
      expect(back.trimEnd().endsWith('</button></div>'), locale).toBe(true)
      expect(errors, locale).toEqual([])
    }
  })
})

describe('à qui le tour dans le fil des questions', () => {
  const seats = [
    { id: 'h', name: 'Riqui' },
    { id: 'b1', name: 'Raoul', isBot: true },
    { id: 'b2', name: 'Suzette', isBot: true },
  ]
  const start = () => {
    const s = createEspionState(seats, getEspionLocations('fr'), 'tv', Date.now() - 10_000)
    return reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
  }

  it('personne en début de manche ; l’interrogé tant que sa question attend ; puis la main à qui vient de répondre', () => {
    let s = start()
    const now = Date.now()
    expect(espionTurn(toEspionClientView(s, 'h'), now)).toBeNull()
    s = reduceEspion(s, { type: 'ASK', playerId: 'b1', targetId: 'h', questionId: 'when', now })
    expect(espionTurn(toEspionClientView(s, 'h'), now)).toEqual({ kind: 'answer', playerId: 'h', askerId: 'b1' })
    s = reduceEspion(s, { type: 'ANSWER', playerId: 'h', value: 'night', now })
    expect(espionTurn(toEspionClientView(s, 'h'), now)).toEqual({ kind: 'ask', playerId: 'h' })
  })

  it('une question restée sans réponse 25 s n’attend plus personne', () => {
    let s = start()
    const now = Date.now()
    s = reduceEspion(s, { type: 'ASK', playerId: 'b1', targetId: 'b2', questionId: 'when', now })
    expect(espionTurn(toEspionClientView(s, 'h'), now + 26_000)).toBeNull()
  })
})

describe('lot 5 : paroles libres et TV, dans les 4 langues', () => {
  const TALK: EspionSpeech[] = [
    ...FEED.slice(0, 2),
    entry({ playerId: 'b1', kind: 'suspect', targetId: 'h', at: 6 }),
    entry({ playerId: 'h', kind: 'defend', targetId: 'b1', at: 7 }),
    entry({ playerId: 'b2', kind: 'ally', targetId: 'h', at: 8 }),
    entry({ playerId: 'b1', kind: 'toldYou', targetId: 'b2', at: 9 }),
    entry({ playerId: 'b2', kind: 'wrong', targetId: 'b1', at: 10 }),
  ]
  const badge = (locale: string) => catalogue(locale).games.espion.game.accusedYou as string

  it('« Me défendre » n’apparaît que quand on est visé, et part vers qui me vise encore', () => {
    const all = () => true
    const aimed = (speech: EspionSpeech[], present: (id: string) => boolean = all) => espionAimedBy(speech, 'h', present)
    // Personne ne me vise : une approbation, un soutien, une pique contre un autre ne comptent pas.
    expect(aimed([])).toBeNull()
    expect(aimed([entry({ playerId: 'b1', kind: 'ally', targetId: 'h', at: 1 }), entry({ playerId: 'b1', kind: 'suspect', targetId: 'b2', at: 2 })])).toBeNull()
    expect(aimed(FEED.slice(0, 2))).toBeNull()
    // Un « louche » de bot sur ma réponse, ou une accusation formelle : je peux répondre à son auteur.
    expect(aimed(TALK.slice(0, 3))).toBe('b1')
    expect(aimed(FEED.slice(0, 3))).toBe('b2')
    // Défendu : le bouton disparaît jusqu'à la prochaine pique.
    expect(aimed(TALK.slice(0, 4))).toBeNull()
    expect(aimed([...TALK.slice(0, 4), entry({ playerId: 'b2', kind: 'accuse', targetId: 'h', at: 11 })])).toBe('b2')
    // L'accusateur parti : on répond à celui qui me vise encore, sinon à personne.
    const twice = [entry({ playerId: 'b2', kind: 'suspect', targetId: 'h', at: 1 }), entry({ playerId: 'b1', kind: 'accuse', targetId: 'h', at: 2 })]
    expect(aimed(twice, (id) => id !== 'b1')).toBe('b2')
    expect(aimed(twice, (id) => id === 'h')).toBeNull()
  })

  it('chaque parole libre a sa bulle ; le « je trouve ça louche » qui me vise porte le badge', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(createElement(EspionTableTalk, { speech: TALK, round: 1, players: PLAYERS, iconOf, meId: 'h' }), locale, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(TALK.length)
      expect(textOf(html).split(badge(locale)).length - 1, locale).toBe(1)
    }
  })

  it('TV : les quatre dernières bulles, sans badge', () => {
    for (const locale of LOCALES) {
      const errors: unknown[] = []
      const html = render(createElement(EspionTableTalk, { speech: TALK, round: 1, players: PLAYERS, iconOf, variant: 'tv' }), locale, errors)
      expect(errors, locale).toEqual([])
      expect(html.match(/<li/g), locale).toHaveLength(4)
      expect(textOf(html), locale).not.toContain(badge(locale))
    }
  })

  it('TV : la question en cours en grand, qui la pose et à qui ; jamais le lieu', () => {
    const ROOM: TvRoomDto = {
      code: 'ABCD',
      status: 'playing',
      gameId: 'espion',
      hostUserId: 'h',
      members: [],
      settings: {},
      stateVersion: 3,
      currentTurnUserId: null,
      gameStateJson: null,
    }
    const seats = [
      { id: 'h', name: 'Riqui' },
      { id: 'b1', name: 'Raoul', isBot: true },
      { id: 'b2', name: 'Suzette', isBot: true },
      { id: 'b3', name: 'Gépéto', isBot: true },
    ]
    for (const locale of LOCALES) {
      let s = createEspionState(seats, getEspionLocations(locale), 'tv', Date.now() - 10_000)
      s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
      s = reduceEspion(s, { type: 'ASK', playerId: 'b1', targetId: 'h', questionId: 'when', now: Date.now() })
      const errors: unknown[] = []
      const html = render(createElement(TvEspion, { room: ROOM, state: toEspionSpectatorView(s) }), locale, errors)
      expect(errors, locale).toEqual([])
      const text = textOf(html)
      const when = qa(locale).when as Record<string, string>
      expect([when.q, when.q_2].some((q) => text.includes(q)), `${locale} : ${text}`).toBe(true)
      expect(text, locale).toContain('Raoul')
      expect(text, locale).toContain('Riqui')
      expect(text, locale).not.toContain(s.location)
    }
  })
})

describe('dernière chance de l’espion démasqué, dans les 4 langues', () => {
  it('TV : le démasqué nommé, son décompte ; jamais le lieu ni un rôle', () => {
    const ROOM: TvRoomDto = {
      code: 'ABCD',
      status: 'playing',
      gameId: 'espion',
      hostUserId: 'h',
      members: [],
      settings: {},
      stateVersion: 3,
      currentTurnUserId: null,
      gameStateJson: null,
    }
    const seats = [
      { id: 'h', name: 'Riqui' },
      { id: 'u2', name: 'Léa' },
      { id: 'u3', name: 'Max' },
    ]
    for (const locale of LOCALES) {
      let s = createEspionState(seats, getEspionLocations(locale), 'tv-derniere-chance', Date.now() - 10_000)
      s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
      s = { ...s, players: s.players.map((p) => ({ ...p, role: p.id === 'h' ? 'spy' : 'crew' })) }
      s = reduceEspion(s, { type: 'ACCUSE', playerId: 'u2', targetId: 'h', now: Date.now() })
      s = reduceEspion(s, { type: 'SUPPORT', playerId: 'u3', now: Date.now() })
      expect(s.phase, locale).toBe('lastChance')
      const view = toEspionSpectatorView(s)
      expect(view.location, locale).toBeNull()
      expect(view.players.every((p) => p.role === null), locale).toBe(true)
      const errors: unknown[] = []
      const html = render(createElement(TvEspion, { room: ROOM, state: view }), locale, errors)
      expect(errors, locale).toEqual([])
      const text = textOf(html)
      expect(text, locale).toContain('Riqui')
      expect(text, locale).not.toContain(s.location)
      const hint = (catalogue(locale).games.espion.game.lastChance as Record<string, string>).othersHint
      expect(text, locale).toContain(hint.replace('{name}', 'Riqui'))
    }
  })
})
