import { readFileSync } from 'node:fs'
import { createElement, type ComponentProps, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, type AbstractIntlMessages } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { createQuizState, reduceQuiz, toQuizClientView, type QuizQuestion, type QuizState } from './engine'
import { QuizOnline } from '@/components/online/QuizOnline'

/**
 * L'écran téléphone du Grand Pillaveur rendu côté serveur, hooks de salle
 * simulés : buzzers lisibles (encre sur l'or, crème ailleurs), réponse
 * envoyée qui éteint les autres cases, reveal qui atténue VRAIMENT les
 * mauvaises réponses (opacité générée par Tailwind 3.3).
 */

const room = vi.hoisted(() => ({ current: null as unknown }))

vi.mock('@/components/providers/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'h', ambianceMode: 'normal' } }),
}))
vi.mock('@/hooks/useOnlineRoom', () => ({
  useOnlineRoom: () => ({ room: room.current, voteRematch: async () => {}, leaveRoom: async () => {} }),
}))
vi.mock('@/hooks/useGameAction', () => ({
  useGameAction: () => ({ busy: false, actionError: null, sendAction: async () => ({ ok: true }) }),
}))
vi.mock('@/hooks/useBotReferee', () => ({ useBotReferee: () => {}, useAdvanceTick: () => {} }))
vi.mock('@/i18n/navigation', () => ({ Link: () => null, usePathname: () => '/', useRouter: () => ({ push: () => {} }) }))
vi.mock('@/components/online/GameTutorialModal', () => ({
  useGameTutorial: () => ({ open: false }),
  GameTutorialModal: () => null,
  TutorialReopenButton: () => null,
}))
vi.mock('@/components/online/GameOnlineLobby', () => ({ GameOnlineLobby: () => null }))
vi.mock('@/components/online/OnlineEndScreen', () => ({ OnlineEndScreen: () => null }))
vi.mock('@/components/online/XpGainBanner', () => ({ XpGainBanner: () => null }))

const messages = JSON.parse(
  readFileSync(new URL('../../../messages/fr.json', import.meta.url), 'utf8')
) as AbstractIntlMessages

const IntlProvider = NextIntlClientProvider as FunctionComponent<
  Omit<ComponentProps<typeof NextIntlClientProvider>, 'children'>
>

const POOL: QuizQuestion[] = [
  { id: 't-1', cat: 'culture', diff: 1, q: 'Capitale de l’Australie ?', choices: ['Sydney', 'Canberra', 'Melbourne', 'Perth'], answer: 1 },
  { id: 't-2', cat: 'sport', diff: 1, q: 'Joueurs d’une équipe de foot ?', choices: ['10', '11', '12', '13'], answer: 1 },
]
const T0 = 1_000_000

/** Question 1 ouverte : Riqui (h) et deux bots. */
function questionOpen(): QuizState {
  const start = createQuizState(
    [{ id: 'h', name: 'Riqui' }, { id: 'g', name: 'Gépéto', isBot: true }, { id: 's', name: 'Suzette', isBot: true }],
    POOL,
    2,
    'seed',
    T0
  )
  return reduceQuiz(start, {
    type: 'ADVANCE',
    claimedKey: toQuizClientView(start, 'h').phaseKey,
    now: start.phaseEndsAt!,
  })
}

const wrongOf = (state: QuizState) => (state.questions[state.qIdx].answer + 1) % 4

function render(state: QuizState): string {
  room.current = {
    id: 'r',
    gameId: 'quiz',
    status: 'playing',
    stateVersion: state.version,
    currentTurnUserId: null,
    members: [],
    gameStateJson: JSON.stringify(toQuizClientView(state, 'h')),
  }
  return renderToStaticMarkup(
    createElement(IntlProvider, { locale: 'fr', messages, timeZone: 'Europe/Paris', onError: () => {} }, createElement(QuizOnline))
  )
}

/** Classes des quatre buzzers, dans l'ordre. */
const buzzers = (html: string) =>
  [...html.matchAll(/<button type="button"[^>]*class="([^"]*min-h-\[5\.5rem\][^"]*)"/g)].map((m) => m[1])

describe('QuizOnline — les buzzers', () => {
  it('question ouverte : quatre buzzers d’au moins 88 px, encre sur l’or, crème sur les autres', () => {
    const html = render(questionOpen())
    const classes = buzzers(html)
    expect(classes).toHaveLength(4)
    for (const c of classes) expect(c).not.toContain('game-grid-cell')
    expect(classes.filter((c) => c.includes('from-amber-400') && c.includes('text-[#24201A]'))).toHaveLength(1)
    expect(classes.filter((c) => c.includes('text-cream'))).toHaveLength(3)
    expect(html).not.toMatch(/\btext-white\b/)
    expect(html).toContain('role="status"')
    // Pas de plancher sous la question : sur un écran court, les buzzers
    // passent avant les puces « qui a répondu ».
    expect(html).not.toContain('min-h-[4rem]')
  })

  it('réponse envoyée : ma case cerclée, les trois autres éteintes', () => {
    const open = questionOpen()
    const pick = wrongOf(open)
    const html = render(reduceQuiz(open, { type: 'ANSWER', playerId: 'h', choice: pick, now: T0 + 6_000 }))
    const classes = buzzers(html)
    expect(classes[pick]).toContain('ring-cream')
    expect(classes.filter((c) => c.includes('opacity-50'))).toHaveLength(3)
  })

  it('reveal : bonne réponse cerclée, mon mauvais choix marqué, les autres atténuées', () => {
    const open = questionOpen()
    const right = open.questions[open.qIdx].answer
    const pick = wrongOf(open)
    let state = reduceQuiz(open, { type: 'ANSWER', playerId: 'h', choice: pick, now: T0 + 6_000 })
    state = reduceQuiz(state, { type: 'ANSWER', playerId: 'g', choice: right, now: T0 + 6_100 })
    state = reduceQuiz(state, { type: 'ANSWER', playerId: 's', choice: right, now: T0 + 6_200 })
    expect(state.phase).toBe('reveal')
    const html = render(state)
    // Au reveal, le classement garde un plancher (il défile au lieu de s'écraser).
    expect(html).toContain('min-h-[4rem]')
    const classes = buzzers(html)
    expect(classes[right]).toContain('ring-cream')
    expect(classes[pick]).toContain('ring-red-300')
    expect(classes.filter((c) => /\bopacity-30\b/.test(c))).toHaveLength(2)
    // opacity-35 ne génère aucun CSS en Tailwind 3.3.
    for (const c of classes) expect(c).not.toMatch(/opacity-(15|35|45|55|65|85)\b/)
  })
})
