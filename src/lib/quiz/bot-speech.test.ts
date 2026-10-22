import { afterEach, describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createQuizState,
  reduceQuiz,
  toQuizSpectatorView,
  QuizEngineError,
  QUIZ_COUNTDOWN_MS,
  QUIZ_QUESTION_MS,
  QUIZ_REVEAL_MIN_MS,
  QUIZ_SAY_KINDS_OF_PHASE,
  QUIZ_SPEECH_CAP,
  type QuizInitialPlayer,
  type QuizQuestion,
  type QuizSayMove,
  type QuizSpeech,
  type QuizState,
} from './engine'
import {
  QUIZ_TEASE_FROM_QIDX,
  quizAnswerSay,
  quizConfidence,
  quizRevealSay,
} from './bot-speech'
import {
  applyQuizBotAction,
  applyQuizRoomAction,
  parseQuizState,
  serializeQuizState,
} from './server-adapter'

const T0 = 1_000_000
const ALWAYS = () => 0
const NEVER = () => 0.999

const question = (i: number, diff: 1 | 2 | 3 = 1, answer = 0): QuizQuestion => ({
  id: `q${i}`,
  cat: 'culture',
  diff,
  q: `Question ${i} ?`,
  choices: ['A', 'B', 'C', 'D'],
  answer,
})

const HUMAN = { id: 'h', name: 'Riqui' }
const HUMAN2 = { id: 'h2', name: 'Léa' }
const bot = (id: string, name: string): QuizInitialPlayer => ({ id, name, isBot: true })

/** Partie au début de la 1re question, `count` questions de difficulté `diff`. */
function make(players: QuizInitialPlayer[], { diff = 1 as 1 | 2 | 3, count = 4, answer = 0 } = {}): QuizState {
  const pool = Array.from({ length: count }, (_, i) => question(i, diff, answer))
  const raw = createQuizState(players, pool, count, 'seed', T0 - QUIZ_COUNTDOWN_MS)
  return reduceQuiz(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const right = (s: QuizState) => s.questions[s.qIdx].answer
const wrong = (s: QuizState) => (right(s) + 1) % 4
const answer = (s: QuizState, playerId: string, ok: boolean, now = T0 + 1000) =>
  reduceQuiz(s, { type: 'ANSWER', playerId, choice: ok ? right(s) : wrong(s), now })
const say = (s: QuizState, ...moves: QuizSayMove[]) => reduceQuiz(s, { type: 'SAY', moves })
const close = (s: QuizState) => reduceQuiz(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
const next = (s: QuizState, now: number) => reduceQuiz(s, { type: 'CONTINUE', playerId: 'h', now })
const view = (s: QuizState) => toQuizSpectatorView(s)
const seeded = (seed: string) => {
  const rng = createRng(seed)
  return () => rng.next()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('quizConfidence : l’assurance ne lit que la difficulté publique et le caractère', () => {
  it('l’agressif crâne toujours, la prudente n’est sûre que sur une facile et se tait au milieu', () => {
    const raoul = botTraitsFor('Raoul')
    const gaston = botTraitsFor('Gaston')
    for (const diff of [1, 2, 3] as const) expect(quizConfidence(raoul, diff, ALWAYS)).toBe('sure')
    expect(quizConfidence(gaston, 1, ALWAYS)).toBe('sure')
    expect(quizConfidence(gaston, 2, ALWAYS)).toBeNull()
    expect(quizConfidence(gaston, 3, ALWAYS)).toBe('unsure')
  })

  it('le suiveur n’est sûr que d’une facile ; le farceur crâne au gré de son audace', () => {
    const mauricette = botTraitsFor('Mauricette')
    expect(quizConfidence(mauricette, 1, ALWAYS)).toBe('sure')
    expect(quizConfidence(mauricette, 3, ALWAYS)).toBe('unsure')
    const josiane = botTraitsFor('Josiane')
    expect(quizConfidence(josiane, 3, () => josiane.audace - 0.01)).toBe('sure')
    expect(quizConfidence(josiane, 1, () => josiane.audace + 0.01)).toBe('unsure')
  })
})

describe('quizAnswerSay : la fanfaronnade jointe aux réponses des bots', () => {
  const table = [HUMAN, bot('b1', 'Raoul'), bot('b2', 'Josiane')]

  it('une parole au plus, d’un bot qui buzze, vers un humain qui n’a pas encore répondu', () => {
    const s = make([HUMAN, HUMAN2, bot('b1', 'Raoul'), bot('b2', 'Kéké')])
    const answered = answer(s, 'h', true)
    const moves = quizAnswerSay(view(answered), ['b1', 'b2'], ALWAYS)
    expect(moves).toHaveLength(1)
    expect(['b1', 'b2']).toContain(moves[0].playerId)
    expect(moves[0].kind).toBe('sure')
    expect(moves[0].targetId).toBe('h2')
  })

  it('tous les humains ont répondu : la cible reste un humain présent', () => {
    const s = answer(make(table), 'h', false)
    expect(quizAnswerSay(view(s), ['b1', 'b2'], ALWAYS)[0]?.targetId).toBe('h')
  })

  it('aucun humain présent : aucune parole (une table de bots ne se parle pas)', () => {
    const left = reduceQuiz(make(table), { type: 'LEAVE', playerId: 'h', at: T0 + 10 })
    expect(quizAnswerSay(view(left), ['b1', 'b2'], ALWAYS)).toEqual([])
  })

  it('un seul fanfaron par question, et seulement parmi les bots qui buzzent', () => {
    const s = make(table)
    expect(quizAnswerSay(view(s), [], ALWAYS)).toEqual([])
    const first = quizAnswerSay(view(s), ['b1'], ALWAYS)
    expect(first.map((m) => m.playerId)).toEqual(['b1'])
    expect(quizAnswerSay(view(say(s, ...first)), ['b2'], ALWAYS)).toEqual([])
  })

  it('le dé de parole : un bot qui ne le passe pas se tait', () => {
    expect(quizAnswerSay(view(make(table)), ['b1', 'b2'], NEVER)).toEqual([])
  })

  it('la prudente se tait sur une question moyenne, même à dé favorable', () => {
    const s = make([HUMAN, bot('b1', 'Gaston')], { diff: 2 })
    expect(quizAnswerSay(view(s), ['b1'], ALWAYS)).toEqual([])
  })

  it('jamais hors de la question', () => {
    const s = close(make(table))
    expect(s.phase).toBe('reveal')
    expect(quizAnswerSay(view(s), ['b1', 'b2'], ALWAYS)).toEqual([])
  })

  it('ANTI-FUITE : la vue lue ne porte pas la bonne réponse, et le même tirage donne la même parole quelle qu’elle soit', () => {
    const players = [HUMAN, bot('b1', 'Josiane'), bot('b2', 'Mauricette')]
    const states = [0, 1, 2, 3].map((a) => make(players, { diff: 2, answer: a }))
    for (const s of states) expect(JSON.stringify(view(s))).not.toContain('"answer"')
    const plans = states.map((s) => quizAnswerSay(view(s), ['b1', 'b2'], seeded('même-dé')))
    for (const plan of plans) expect(plan).toEqual(plans[0])
  })
})

describe('applyQuizBotAction : la parole est tirée avant les réponses, sur son propre flux', () => {
  it('ANTI-FUITE : même parole, que le bot ait juste ou faux (seul le dé des réponses change)', () => {
    const players = [HUMAN, bot('b1', 'Josiane')]
    const s = make(players, { diff: 2 })
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 3000)
    const run = (answerDraw: number) => {
      const random = vi.spyOn(Math, 'random').mockReturnValue(answerDraw)
      const res = applyQuizBotAction(s, ALWAYS)
      random.mockRestore()
      if (!res.ok) throw new Error(res.error)
      return res.state
    }
    const lucky = run(0)
    const unlucky = run(0.9)
    expect(lucky.answers.b1.choice).toBe(right(s))
    expect(unlucky.answers.b1.choice).not.toBe(right(s))
    expect(lucky.speech).toEqual(unlucky.speech)
    expect(lucky.speech?.map((sp) => `${sp.kind}>${sp.targetId}`)).toEqual(['sure>h'])
  })

  it('les paroles ne pèsent pas sur le jeu : mêmes réponses avec ou sans elles', () => {
    const players = [HUMAN, bot('b1', 'Raoul'), bot('b2', 'Kéké'), bot('b3', 'Josiane')]
    vi.spyOn(Date, 'now').mockReturnValue(T0 + 3000)
    const run = (sayRand: () => number) => {
      const random = vi.spyOn(Math, 'random').mockImplementation(seeded('partie'))
      const res = applyQuizBotAction(make(players), sayRand)
      random.mockRestore()
      if (!res.ok) throw new Error(res.error)
      return res.state
    }
    const talking = run(ALWAYS)
    const silent = run(NEVER)
    expect(talking.speech).toHaveLength(1)
    expect(silent.speech).toEqual([])
    expect(talking.answers).toEqual(silent.answers)
  })
})

describe('quizRevealSay : la réaction de la table à la révélation', () => {
  /** Bot qui a parlé (ou non) en buzzant, puis réponses : la question se ferme sur la dernière. */
  function reveal(players: QuizInitialPlayer[], results: Record<string, boolean | null>, quips: QuizSayMove[] = []): QuizState {
    let s = make(players, { count: 4 })
    s = say(s, ...quips)
    for (const [id, ok] of Object.entries(results)) if (ok !== null) s = answer(s, id, ok, s.questionStartAt + 500)
    return s.phase === 'reveal' ? s : close(s)
  }

  it('juste après « au pif » : lucky ; faux après « trop facile » : oops, vers l’humain qui a trouvé', () => {
    const lucky = reveal([HUMAN, bot('b1', 'Josiane')], { h: false, b1: true }, [
      { playerId: 'b1', kind: 'unsure', targetId: 'h' },
    ])
    expect(quizRevealSay(view(lucky), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'lucky', targetId: 'h' }])

    const oops = reveal([HUMAN, HUMAN2, bot('b1', 'Raoul')], { h: false, h2: true, b1: false }, [
      { playerId: 'b1', kind: 'sure', targetId: 'h' },
    ])
    expect(quizRevealSay(view(oops), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'oops', targetId: 'h2' }])
  })

  it('juste sans rien dire : knewIt vers un humain qui s’est trompé — personne à taquiner, rien', () => {
    const s = reveal([HUMAN, HUMAN2, bot('b1', 'Raoul')], { h: true, h2: false, b1: true })
    expect(quizRevealSay(view(s), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'knewIt', targetId: 'h2' }])
    const allRight = reveal([HUMAN, bot('b1', 'Raoul')], { h: true, b1: true })
    expect(quizRevealSay(view(allRight), ALWAYS)).toEqual([])
  })

  it('faux sans avoir crâné : missed vers l’humain qui a trouvé (« comment tu savais ça ? »)', () => {
    const s = reveal([HUMAN, bot('b1', 'Raoul')], { h: true, b1: false })
    expect(quizRevealSay(view(s), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'missed', targetId: 'h' }])
  })

  it('un humain qui n’a pas répondu se fait réveiller, avant le « je le savais »', () => {
    const s = reveal([HUMAN, bot('b1', 'Raoul')], { h: null, b1: true })
    expect(quizRevealSay(view(s), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'asleep', targetId: 'h' }])
  })

  it(`on chambre le meneur humain, seul en tête, à partir de la question ${QUIZ_TEASE_FROM_QIDX + 1}`, () => {
    const players = [HUMAN, bot('b1', 'Raoul')]
    // Tout le monde trouve : ni knewIt ni missed, il ne reste que le classement.
    const early = reveal(players, { h: true, b1: true })
    expect(quizRevealSay(view(early), ALWAYS)).toEqual([])
    let s = make(players, { count: 4 })
    for (let q = 0; q < QUIZ_TEASE_FROM_QIDX; q += 1) {
      s = answer(s, 'h', true, s.questionStartAt + 100)
      s = answer(s, 'b1', true, s.questionStartAt + 9000)
      s = next(s, T0 + 100_000 * (q + 1))
    }
    s = answer(s, 'h', true, s.questionStartAt + 100)
    s = answer(s, 'b1', true, s.questionStartAt + 9000)
    expect(s.qIdx).toBe(QUIZ_TEASE_FROM_QIDX)
    expect(quizRevealSay(view(s), ALWAYS)).toEqual([{ playerId: 'b1', kind: 'tease', targetId: 'h' }])
  })

  it('sobriété : une réaction par révélation, et la taiseuse qui a déjà parlé se tait', () => {
    const s = reveal([HUMAN, bot('b1', 'Raoul'), bot('b2', 'Kéké')], { h: false, b1: true, b2: true })
    const first = quizRevealSay(view(s), ALWAYS)
    expect(first).toHaveLength(1)
    expect(quizRevealSay(view(say(s, ...first)), ALWAYS)).toEqual([])

    const gaston = reveal([HUMAN, bot('b1', 'Gaston')], { h: false, b1: true }, [
      { playerId: 'b1', kind: 'sure', targetId: 'h' },
    ])
    expect(botTraitsFor('Gaston').bavardage).toBe(1)
    expect(quizRevealSay(view(gaston), ALWAYS)).toEqual([])
  })

  it('aucun humain présent : rien ; dé défavorable : rien', () => {
    const s = reveal([HUMAN, bot('b1', 'Raoul')], { h: false, b1: true })
    expect(quizRevealSay(view(s), NEVER)).toEqual([])
    const alone = reduceQuiz(s, { type: 'LEAVE', playerId: 'h', at: T0 + 20_000 })
    expect(quizRevealSay(view(alone), ALWAYS)).toEqual([])
  })
})

describe('moteur : SAY, la parole d’un bot', () => {
  const players = [HUMAN, bot('b1', 'Raoul'), bot('b2', 'Kéké')]

  it('refuse un kind hors de sa phase, un humain, une cible absente ou soi-même, et le plafond', () => {
    const s = make(players)
    const err = (fn: () => unknown, code: string) => {
      expect(fn).toThrow(QuizEngineError)
      expect(fn).toThrow(code)
    }
    err(() => say(s, { playerId: 'b1', kind: 'knewIt', targetId: 'h' }), 'INVALID_KIND')
    err(() => say(s, { playerId: 'h', kind: 'sure', targetId: 'b1' }), 'NOT_BOT')
    err(() => say(s, { playerId: 'b1', kind: 'sure', targetId: 'b1' }), 'INVALID_TARGET')
    err(() => say(s, { playerId: 'b1', kind: 'sure', targetId: 'nobody' }), 'INVALID_TARGET')
    const capped = say(
      s,
      ...Array.from({ length: QUIZ_SPEECH_CAP }, () => ({ playerId: 'b1', kind: 'sure' as const, targetId: 'h' }))
    )
    err(() => say(capped, { playerId: 'b1', kind: 'unsure', targetId: 'h' }), 'ALREADY_SPOKE')
    const countdown = createQuizState(players, [question(0)], 1, 'seed', T0)
    err(() => reduceQuiz(countdown, { type: 'SAY', moves: [] }), 'NOT_SPEECH_PHASE')
  })

  it('écrit des paroles structurées, numérotées par question, gardées une question de plus', () => {
    let s = say(make(players), { playerId: 'b1', kind: 'sure', targetId: 'h' })
    expect(s.speech).toEqual([{ playerId: 'b1', kind: 'sure', targetId: 'h', round: 0 }])
    s = close(s)
    s = say(s, { playerId: 'b2', kind: 'knewIt', targetId: 'h' })
    s = next(s, T0 + QUIZ_QUESTION_MS + QUIZ_REVEAL_MIN_MS)
    expect(s.qIdx).toBe(1)
    expect(s.speech?.map((sp) => sp.round)).toEqual([0, 0])
    s = next(close(s), T0 + 3 * QUIZ_QUESTION_MS)
    expect(s.speech).toEqual([])
    expect(QUIZ_SAY_KINDS_OF_PHASE.question).toEqual(['sure', 'unsure'])
  })

  it('un état sérialisé avant les paroles se relit sans elles, et la vue les rend publiques', () => {
    const s = make(players)
    const { speech: _speech, ...legacy } = s
    void _speech
    expect(parseQuizState(JSON.stringify(legacy))?.speech).toEqual([])
    const spoken = say(s, { playerId: 'b1', kind: 'sure', targetId: 'h' })
    expect(parseQuizState(serializeQuizState(spoken))?.speech).toEqual(spoken.speech)
    expect(view(spoken).speech).toEqual(spoken.speech)
  })
})

describe('adaptateur : la réaction naît dans l’écriture qui ferme la question', () => {
  it('la dernière réponse humaine ferme la question : la réaction du bot l’accompagne', () => {
    let s = make([HUMAN, bot('b1', 'Raoul')])
    s = answer(s, 'b1', true)
    const res = applyQuizRoomAction(s, 'h', { type: 'answer', choice: wrong(s) }, ALWAYS)
    expect(res.ok && res.state.phase).toBe('reveal')
    if (!res.ok) return
    expect(res.state.speech?.map((sp) => sp.kind)).toEqual(['knewIt'])
  })

  it('l’échéance aussi (le joueur endormi se fait réveiller) ; une action qui ne ferme rien n’ajoute rien', () => {
    let s = make([HUMAN, bot('b1', 'Raoul')])
    s = answer(s, 'b1', true)
    const now = vi.spyOn(Date, 'now').mockReturnValue(T0 + QUIZ_QUESTION_MS)
    const res = applyQuizRoomAction(s, 'h', { type: 'advance', phaseKey: phaseKey(s) }, ALWAYS)
    expect(res.ok && res.state.speech?.map((sp) => `${sp.kind}>${sp.targetId}`)).toEqual(['asleep>h'])
    if (!res.ok) return
    now.mockReturnValue(T0 + QUIZ_QUESTION_MS + QUIZ_REVEAL_MIN_MS)
    const continued = applyQuizRoomAction(res.state, 'h', { type: 'continue' }, ALWAYS)
    expect(continued.ok && continued.state.speech).toEqual(res.state.speech)
  })
})

describe('simulation : sobriété et validité sur des parties entières', () => {
  const NAMES = ['Raoul', 'Josiane', 'Gaston', 'Mauricette', 'Kéké', 'Bernadette', 'Norbert', 'Germaine']

  function play(seed: string, botCount: number, humans: number): { state: QuizState; spoken: QuizSpeech[] } {
    const rng = createRng(seed)
    const players: QuizInitialPlayer[] = [
      ...Array.from({ length: humans }, (_, i) => ({ id: `h${i}`, name: `Humain ${i}` })),
      ...Array.from({ length: botCount }, (_, i) => bot(`b${i}`, NAMES[(i + rng.int(0, 7)) % NAMES.length])),
    ]
    const pool = Array.from({ length: 10 }, (_, i) => question(i, ((i % 3) + 1) as 1 | 2 | 3, i % 4))
    const raw = createQuizState(players, pool, 10, seed, T0 - QUIZ_COUNTDOWN_MS)
    let s = reduceQuiz(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    const sayRand = () => rng.next()
    vi.spyOn(Math, 'random').mockImplementation(() => rng.next())
    const now = vi.spyOn(Date, 'now')
    const spoken: QuizSpeech[] = []
    let clock = T0
    const record = (before: QuizState, after: QuizState) => {
      const known = new Set((before.speech ?? []).map((sp) => JSON.stringify(sp)))
      for (const sp of after.speech ?? []) if (!known.has(JSON.stringify(sp))) spoken.push(sp)
    }
    for (let guard = 0; guard < 200 && s.phase !== 'finished'; guard += 1) {
      clock += 1000
      now.mockReturnValue(clock)
      let res
      if (s.phase === 'question') {
        const human = s.players.find((p) => !p.isBot && !p.leftAt && !s.answers[p.id])
        res =
          human && rng.next() < 0.5
            ? applyQuizRoomAction(s, human.id, { type: 'answer', choice: rng.int(0, 3) }, sayRand)
            : s.players.some((p) => p.isBot && !p.leftAt && !s.answers[p.id])
              ? applyQuizRoomAction(s, 'h0', { type: 'bot' }, sayRand)
              : applyQuizRoomAction(s, 'h0', { type: 'advance', phaseKey: phaseKey(s) }, sayRand)
        if (!res.ok && s.phaseEndsAt !== null) {
          clock = s.phaseEndsAt
          now.mockReturnValue(clock)
          res = applyQuizRoomAction(s, 'h0', { type: 'advance', phaseKey: phaseKey(s) }, sayRand)
        }
      } else {
        clock += QUIZ_REVEAL_MIN_MS
        now.mockReturnValue(clock)
        res = applyQuizRoomAction(s, 'h0', { type: 'continue' }, sayRand)
      }
      expect(res.ok, `${seed} : ${!res.ok && res.error}`).toBe(true)
      if (!res.ok) break
      record(s, res.state)
      s = res.state
    }
    vi.restoreAllMocks()
    return { state: s, spoken }
  }

  it('chaque parole est celle d’un bot à un humain, au plus une en buzzant et une à la révélation, min(2, bavardage) par bot', () => {
    let total = 0
    for (let i = 0; i < 40; i += 1) {
      const { state, spoken } = play(`partie-${i}`, 1 + (i % 6), 1 + (i % 2))
      expect(state.phase).toBe('finished')
      total += spoken.length
      const byId = new Map(state.players.map((p) => [p.id, p]))
      for (let q = 0; q < 10; q += 1) {
        const round = spoken.filter((sp) => sp.round === q)
        expect(round.filter((sp) => QUIZ_SAY_KINDS_OF_PHASE.question.includes(sp.kind)).length).toBeLessThanOrEqual(1)
        expect(round.filter((sp) => QUIZ_SAY_KINDS_OF_PHASE.reveal.includes(sp.kind)).length).toBeLessThanOrEqual(1)
        for (const sp of round) {
          expect(byId.get(sp.playerId)?.isBot).toBe(true)
          expect(byId.get(sp.targetId ?? '')?.isBot).toBe(false)
          const mine = round.filter((x) => x.playerId === sp.playerId).length
          expect(mine).toBeLessThanOrEqual(Math.min(QUIZ_SPEECH_CAP, botTraitsFor(byId.get(sp.playerId)!.name).bavardage))
        }
      }
    }
    // Ni muets ni moulins à paroles : 40 parties de 10 questions.
    expect(total).toBeGreaterThan(80)
    expect(total).toBeLessThan(800)
  })
})

describe('réponse d’un humain : liée à sa question, pas à la version', () => {
  it('passe après la réponse d’un bot qui a fait monter la version', () => {
    const s0 = make([HUMAN, bot('b1', 'Raoul')])
    const key = phaseKey(s0)
    const s1 = answer(s0, 'b1', true)
    expect(s1.version).toBeGreaterThan(s0.version)
    const res = applyQuizRoomAction(s1, 'h', { type: 'answer', choice: 0, phaseKey: key }, NEVER)
    expect(res.ok).toBe(true)
  })

  it('refusée si la question a changé depuis le toucher (requête arrivée à la question suivante)', () => {
    const s0 = make([HUMAN, HUMAN2, bot('b1', 'Raoul')])
    const key = phaseKey(s0)
    const revealed = close(s0)
    let s2 = next(revealed, revealed.phaseEndsAt ?? T0 + 120_000)
    if (s2.phase !== 'question') s2 = reduceQuiz(s2, { type: 'ADVANCE', claimedKey: phaseKey(s2), now: s2.phaseEndsAt! })
    expect(s2.phase).toBe('question')
    expect(s2.qIdx).toBe(1)
    const res = applyQuizRoomAction(s2, 'h', { type: 'answer', choice: 0, phaseKey: key }, NEVER)
    expect(res).toEqual({ ok: false, error: 'PHASE_CHANGED' })
  })
})
