import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import type { TvRoomDto } from '@/lib/online-room'
import { VueDeNezOnline } from '@/components/online/VueDeNezOnline'
import {
  TvVueDeNez,
  VDN_TV_END_BUDGET_REM,
  VDN_TV_LIST_BUDGET_REM,
  vdnTvEndLayout,
  vdnTvRowTier,
} from '@/components/tv/TvVueDeNez'
import type { VdnClientView } from './online-view'
import {
  applyVdnRoomAction,
  buildVdnOnlineState,
  vdnClientViewJson,
  vdnOnlineBank,
  type VdnOnlineState,
  type VdnRoomActionInput,
} from './server-adapter'

/**
 * Les écrans en ligne rendus côté serveur (téléphone, hooks de salle simulés,
 * et TV), dans les 4 langues et les 2 ambiances, sur le VRAI catalogue. Les
 * seules clés tolérées absentes sont les nouvelles (`online`, `tv`) tant que
 * les fragments ne sont pas fusionnés : toute autre clé manquante est une
 * faute de frappe.
 */

const ctx = vi.hoisted(() => ({
  room: null as unknown,
  viewer: 'u1',
  ambiance: 'alcool' as 'alcool' | 'soft',
}))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: ctx.viewer, ambianceMode: ctx.ambiance }, setAmbianceMode: async () => {} }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({ room: ctx.room, voteRematch: async () => {}, leaveRoom: async () => {} }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: null, sendAction: async () => ({ ok: true }) }),
}))
vi.mock('@/hooks/useBotReferee', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useBotReferee')>()),
  useBotReferee: () => {},
  useAdvanceTick: () => {},
}))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  useGameTutorial: () => ({ open: false }),
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
}))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))
vi.mock('@/components/online/OnlineEndScreen', async () => {
  const react = await import('react')
  return {
    OnlineEndScreen: (props: { header: ReactNode; ranking?: ReactNode }) =>
      react.createElement('div', null, props.header, props.ranking),
  }
})

const LOCALES = ['fr', 'en', 'es', 'it'] as const
type Locale = (typeof LOCALES)[number]
const CATALOGS = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(new URL(`../../../messages/${l}.json`, import.meta.url), 'utf8'))])
) as Record<Locale, AbstractIntlMessages>

/**
 * Nouvelles clés de ce lot (`online`, `tv`), livrées en fragments : tolérées
 * absentes tant qu'elles ne sont pas fusionnées dans le catalogue de la
 * langue, plus du tout ensuite — une faute de frappe y serait alors masquée.
 */
function pendingIn(locale: Locale): RegExp | null {
  const games = CATALOGS[locale].games
  const vdn = typeof games === 'object' ? games['vue-de-nez'] : undefined
  const merged = typeof vdn === 'object' && typeof vdn.online === 'object' && typeof vdn.tv === 'object'
  return merged ? null : /^games\.vue-de-nez\.(?:online|tv)\./
}

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const T0 = 1_700_000_000_000
const MEMBERS = ['u1', 'u2', 'u3'].map((id) => ({
  userId: id,
  displayName: `Joueur ${id}`,
  isHost: id === 'u1',
  isReady: true,
  isSelf: false,
  preferences: {},
  level: 1,
  role: 'user',
  present: true,
}))

function start(botsCount = 0): VdnOnlineState {
  return buildVdnOnlineState(
    MEMBERS.map((m) => ({ userId: m.userId, user: { displayName: m.displayName } })),
    { seed: 'rendu', botsCount, now: T0 }
  )
}

function act(state: VdnOnlineState, userId: string, input: VdnRoomActionInput, now = T0 + 1_000): VdnOnlineState {
  const result = applyVdnRoomAction(state, userId, input, now)
  if (!result.ok) throw new Error(result.error)
  return result.state
}

const answerOf = (s: VdnOnlineState) => s.questions[s.game.index].answer

/** La partie de `start()`, sa 1re question remplacée par celle de la banque française qui porte cet id. */
function startOn(id: string): VdnOnlineState {
  const base = start()
  const question = vdnOnlineBank('fr').find((q) => q.id === id)
  if (!question) throw new Error(`${id} absente`)
  return {
    ...base,
    questions: [question, ...base.questions.slice(1)],
    game: {
      ...base.game,
      questionIds: [question.id, ...base.game.questionIds.slice(1)],
      questionMins: [question.min, ...base.game.questionMins.slice(1)],
    },
  }
}

/** Toute la table répond : u1 à `near`, les autres plus loin. */
function revealOn(state: VdnOnlineState, near: number): VdnOnlineState {
  let s = act(state, 'u1', { type: 'estimate', value: near })
  s = act(s, 'u2', { type: 'estimate', value: near + 40 })
  return act(s, 'u3', { type: 'estimate', value: near + 90 })
}

/** Ce que renderToStaticMarkup écrit pour un texte. */
const escaped = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

/** Textes rendus (attributs et classes exclus) dont un nombre porte le trait d'union d'Intl au lieu de « − ». */
const hyphenatedNumbers = (html: string) => (html.match(/>[^<]*</g) ?? []).filter((text) => /-\d/.test(text))

function revealedState(): VdnOnlineState {
  let s = start()
  s = act(s, 'u1', { type: 'estimate', value: answerOf(s) })
  s = act(s, 'u2', { type: 'estimate', value: answerOf(s) + Math.abs(answerOf(s)) + 10 })
  return act(s, 'u3', { type: 'estimate', value: answerOf(s) + 3 * (Math.abs(answerOf(s)) + 10) })
}

function withProvider(locale: (typeof LOCALES)[number], child: ReturnType<typeof createElement>, missing: string[]): string {
  return renderToStaticMarkup(
    createElement(
      IntlProvider,
      {
        locale,
        messages: CATALOGS[locale],
        timeZone: 'Europe/Paris',
        onError: () => {},
        getMessageFallback: ({ namespace, key }: { namespace?: string; key: string }) => {
          const path = namespace ? `${namespace}.${key}` : key
          missing.push(path)
          return path
        },
      },
      child
    )
  )
}

function phone(state: VdnOnlineState, viewer = 'u1', locale: (typeof LOCALES)[number] = 'fr') {
  ctx.viewer = viewer
  ctx.room = {
    id: 'r',
    gameId: 'vue-de-nez',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: null,
    members: MEMBERS,
    gameStateJson: vdnClientViewJson(state, viewer),
  }
  const missing: string[] = []
  const html = withProvider(locale, createElement(VueDeNezOnline), missing)
  return { html, missing }
}

function tv(state: VdnOnlineState, locale: (typeof LOCALES)[number] = 'fr') {
  const room = { code: 'ABCDEF', gameId: 'vue-de-nez', status: 'playing', members: MEMBERS } as unknown as TvRoomDto
  const view = JSON.parse(vdnClientViewJson(state, '')) as VdnClientView
  const missing: string[] = []
  const html = withProvider(locale, createElement(TvVueDeNez, { room, state: view }), missing)
  return { html, missing }
}

function finishedState(): VdnOnlineState {
  let s = start()
  for (let i = 0; i < s.questions.length; i += 1) {
    s = act(s, 'u1', { type: 'estimate', value: answerOf(s) })
    s = act(s, 'u2', { type: 'estimate', value: answerOf(s) + Math.abs(answerOf(s)) + 10 })
    s = act(s, 'u3', { type: 'estimate', value: answerOf(s) + 2 * (Math.abs(answerOf(s)) + 10) })
    s = act(s, 'u1', { type: 'continue' }, (s.revealAt ?? 0) + 6_000)
  }
  return s
}

const SCENES: { name: string; build: () => VdnOnlineState }[] = [
  { name: 'question ouverte', build: () => start(2) },
  { name: 'estimation envoyée', build: () => act(start(), 'u1', { type: 'estimate', value: 1234.5 }) },
  { name: 'révélation', build: revealedState },
  {
    name: 'révélation sans réponse',
    build: () => {
      const s = start()
      return act(s, '__service__', { type: 'advance', phaseKey: `answering#${s.phaseSeq}` }, s.phaseEndsAt ?? 0)
    },
  },
  { name: 'fin de partie', build: finishedState },
]

describe('rendu en ligne : aucune clé manquante hors des nouvelles', () => {
  for (const locale of LOCALES) {
    for (const ambiance of ['alcool', 'soft'] as const) {
      it(`${locale} · ${ambiance}`, () => {
        ctx.ambiance = ambiance
        const pending = pendingIn(locale)
        for (const scene of SCENES) {
          const state = scene.build()
          const unexpected = [...phone(state, 'u1', locale).missing, ...tv(state, locale).missing].filter(
            (path) => !pending?.test(path)
          )
          expect(unexpected, `${scene.name} : ${unexpected.join(', ')}`).toEqual([])
        }
      })
    }
  }
})

describe('téléphone', () => {
  it('question ouverte : la question et le champ, jamais la réponse ni la source', () => {
    ctx.ambiance = 'alcool'
    const state = start()
    const { html } = phone(state)
    expect(html).toContain(escaped(state.questions[0].text))
    expect(html).toContain('inputMode="decimal"')
    expect(html).not.toContain(escaped(state.questions[0].source))
  })

  it('estimation envoyée : affichée à son auteur seulement, et corrigeable', () => {
    ctx.ambiance = 'alcool'
    const state = act(start(), 'u1', { type: 'estimate', value: 1234.5 })
    expect(phone(state, 'u1').html).toContain('1234,5')
    expect(phone(state, 'u1').html).not.toContain('inputMode="decimal"')
    expect(phone(state, 'u2').html).not.toContain('1234,5')
    expect(phone(state, 'u2').html).toContain('inputMode="decimal"')
    // L'envoi s'annonce dans la région permanente : le formulaire et son focus viennent de disparaître.
    const live = /<p role="status" aria-live="polite" class="sr-only">([^<]*)<\/p>/
    expect(phone(state, 'u1').html.match(live)?.[1]).toBe('Estimation envoyée')
    expect(phone(state, 'u2').html.match(live)?.[1]).toBe('')
  })

  it('membre hors partie : il regarde, sans champ', () => {
    const { html } = phone(start(), 'u9')
    expect(html).not.toContain('inputMode="decimal"')
  })

  it('révélation : réponse, source, verdicts selon l’ambiance de CE téléphone', () => {
    const state = revealedState()
    ctx.ambiance = 'alcool'
    const drink = phone(state).html
    expect(drink).toContain(escaped(state.questions[0].source))
    expect(drink).toContain('distribue 6')
    expect(drink).toContain('boit 3')
    ctx.ambiance = 'soft'
    const soft = phone(state).html
    expect(soft).toContain('+6 points')
    expect(soft).toContain('−1 point')
    expect(soft).not.toContain('boit 3')
  })

  it('question-année : « 1959 », jamais « 1959 année » (champ, estimation envoyée, réponse, annonce)', () => {
    ctx.ambiance = 'alcool'
    const open = startOn('culture-premier-asterix')
    expect(phone(open).html).toContain('inputMode="decimal"')
    expect(phone(open).html).not.toMatch(/>année</)
    expect(phone(act(open, 'u1', { type: 'estimate', value: 1960 })).html).toContain('>1960<')
    const shown = phone(revealOn(open, 1960)).html
    expect(shown).toMatch(/Réponse\s:\s1959\./)
    expect(shown).toContain('>1959<')
    expect(shown).not.toMatch(/>année<|1959\sannée/)
    // Avant notre ère, l'unité porte l'ère : elle reste.
    expect(phone(revealOn(startOn('histoire-fondation-rome'), 740)).html).toMatch(/Réponse\s:\s753\sav\. J\.-C\./)
  })

  it('fin de partie : classement et gagnant', () => {
    ctx.ambiance = 'alcool'
    const { html } = phone(finishedState())
    expect(html).toContain('Joueur u1 a le nez le plus fin')
    expect(html).toMatch(/gorgées\sdistribuées/)
    ctx.ambiance = 'soft'
    expect(phone(finishedState()).html).not.toMatch(/gorgées\sdistribuées/)
  })

  it('révélation : « Question suivante » chez le meneur seulement, les autres savent qui lance la suite', () => {
    ctx.ambiance = 'alcool'
    const state = revealedState()
    expect(phone(state, 'u1').html).toContain('Question suivante')
    const other = phone(state, 'u2').html
    expect(other).not.toContain('Question suivante')
    // Avant la fusion des fragments, la clé s'affiche telle quelle (getMessageFallback).
    expect(other).toMatch(/Joueur u1 lance la suite|games\.vue-de-nez\.online\.leaderNext/)
  })
})

describe('TV', () => {
  it('lisible à 3 m : ni text-xs ni text-sm, ni tailles en px, ni opacités mortes', () => {
    for (const scene of SCENES) {
      const { html } = tv(scene.build())
      expect(html, scene.name).not.toMatch(/\btext-(?:xs|sm)\b/)
      expect(html, scene.name).not.toMatch(/\[\d+px\]/)
      expect(html, scene.name).not.toMatch(/\bopacity-(?:15|35|45|55|65|85)\b/)
    }
  })

  it('énoncé : l’interligne serré survit à la taille (tailwind-merge jette un leading-* placé avant text-*)', () => {
    const { html } = tv(start())
    expect(html).toMatch(/<p class="font-display font-bold text-(?:3|4|5|6)xl leading-tight">/)
  })

  it('question ouverte : qui a répondu, jamais quoi ni la réponse', () => {
    let state = start()
    state = act(state, 'u2', { type: 'estimate', value: 987_654.25 })
    const { html } = tv(state)
    expect(html).toContain(escaped(state.questions[0].text))
    expect(html).not.toContain('987')
    expect(html).not.toContain(escaped(state.questions[0].source))
  })

  it('révélation : la réponse, sa source et les verdicts selon l’ambiance de la TV', () => {
    const state = revealedState()
    ctx.ambiance = 'alcool'
    const drink = tv(state).html
    expect(drink).toContain(escaped(state.questions[0].source))
    expect(drink).toContain('distribue 6')
    ctx.ambiance = 'soft'
    expect(tv(state).html).toContain('+6 points')
  })

  it('question-année : ni « Unité : année » ni « 1959 année » ; avant notre ère, l’ère reste', () => {
    ctx.ambiance = 'alcool'
    const open = startOn('culture-premier-asterix')
    expect(tv(open).html).not.toMatch(/Unité\s:\sannée/)
    const shown = tv(revealOn(open, 1960)).html
    expect(shown).toContain('>1959<')
    expect(shown).not.toMatch(/>année</)
    const rome = startOn('histoire-fondation-rome')
    expect(tv(rome).html).toMatch(/Unité\s:\sav\. J\.-C\./)
    expect(tv(revealOn(rome, 740)).html).toMatch(/>753<span[^>]*>av\. J\.-C\.</)
  })

  it('table de 16 : chaque ligne rendue, rangées serrées, fin de partie sur deux colonnes', () => {
    ctx.ambiance = 'alcool'
    let s = start(13)
    expect(s.players).toHaveLength(16)
    const open = tv(s).html
    expect(open.match(/<li /g)).toHaveLength(16)
    expect(open).toMatch(/<li class="[^"]*\bh-7\b/)
    expect(tv(finishedState()).html).toContain('lucide-trophy')
    for (let i = 0; i < s.questions.length; i += 1) {
      for (const id of ['u1', 'u2', 'u3']) s = act(s, id, { type: 'estimate', value: answerOf(s) + (id === 'u1' ? 0 : 1_000) })
      while (s.phase === 'answering') s = act(s, '__service__', { type: 'bot' })
      if (i === 0) expect(tv(s).html.match(/<li /g)).toHaveLength(16)
      s = act(s, 'u1', { type: 'continue' }, (s.revealAt ?? 0) + 6_000)
    }
    expect(s.phase).toBe('finished')
    const end = tv(s).html
    expect(end.match(/<li /g)).toHaveLength(16)
    expect(end).toContain('grid-cols-2')
    expect(end).not.toContain('lucide-trophy')
  })
})

describe('signe moins : celui de « −1 point », partout', () => {
  it('fin de partie : un score négatif s’écrit « −10 pts », au téléphone comme sur la TV', () => {
    ctx.ambiance = 'soft'
    const end = finishedState()
    const worst = end.game.scores.u3
    expect(worst).toBeLessThan(0)
    for (const { html } of [phone(end), tv(end), phone(end, 'u1', 'en'), tv(end, 'it')]) {
      expect(html).toContain(`>−${-worst} pt`)
      expect(hyphenatedNumbers(html)).toEqual([])
    }
  })

  it('TV : le classement pendant la question suivante aussi', () => {
    ctx.ambiance = 'alcool'
    const revealed = revealedState()
    const next = act(revealed, 'u1', { type: 'continue' }, (revealed.revealAt ?? 0) + 6_000)
    expect(next.phase).toBe('answering')
    expect(next.game.scores.u3).toBe(-1)
    const { html } = tv(next)
    expect(html).toContain('>−1<')
    expect(hyphenatedNumbers(html)).toEqual([])
  })

  it('question sous zéro : estimations, réponse et bornes de la règle', () => {
    ctx.ambiance = 'soft'
    const cold = revealOn(startOn('sciences-zero-absolu'), -260)
    for (const { html } of [phone(cold), tv(cold)]) {
      expect(html).toContain('−273')
      expect(html).toContain('−260')
      expect(hyphenatedNumbers(html)).toEqual([])
    }
  })
})

describe('TV : budget de hauteur (le rendu serveur ne mesure rien)', () => {
  /** `h-14` → 3,5 rem, `gap-0.5` → 0,125 rem : l'échelle par défaut de Tailwind (n × 0,25 rem). */
  const remOf = (classes: string, prefix: 'h' | 'gap') => {
    const m = classes.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.\\d+)?)(?=\\s|$)`))
    return m ? Number(m[1]) / 4 : Number.NaN
  }

  it('colonne de droite : de 2 à 16 joueurs, toutes les lignes tiennent dans ~30 rem', () => {
    for (let n = 2; n <= 16; n += 1) {
      const tier = vdnTvRowTier(n)
      expect(remOf(tier.row, 'h'), tier.row).toBe(tier.rowRem)
      expect(remOf(tier.list, 'gap'), tier.list).toBe(tier.gapRem)
      expect(n * tier.rowRem + (n - 1) * tier.gapRem, `${n} joueurs`).toBeLessThanOrEqual(VDN_TV_LIST_BUDGET_REM)
    }
  })

  it('fin de partie : trophée et une colonne jusqu’à 6, deux colonnes au-delà, revanche comprise', () => {
    for (let n = 2; n <= 16; n += 1) {
      const end = vdnTvEndLayout(n)
      expect(end.twoColumns, `${n} joueurs`).toBe(n > 6)
      expect(end.trophy, `${n} joueurs`).toBe(n <= 6)
      const total = end.chromeRem + end.rows * end.rowRem + (end.rows - 1) * end.gapRem
      expect(total, `${n} joueurs`).toBeLessThanOrEqual(VDN_TV_END_BUDGET_REM)
    }
  })
})
