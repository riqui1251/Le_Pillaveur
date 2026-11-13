import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { parseSimplePhaseSyncedState } from '@/lib/online-game-state'
import { VDN_QUESTIONS } from './data/questions'
import { VDN_TEXTS as VDN_TEXTS_FR } from './data/fr'
import { VDN_POINTS } from './engine'
import {
  VDN_ANSWER_MS,
  VDN_ONLINE_MAX_PLAYERS,
  VDN_REVEAL_MIN_MS,
  VDN_REVEAL_MS,
  vdnRankingBeforeReveal,
  vdnRevealLeader,
  type VdnClientView,
} from './online-view'
import {
  VDN_BOT_REFERENCE_YEAR,
  applyVdnRoomAction,
  buildVdnOnlineState,
  convertVdnPlayerToBot,
  isVdnYearQuestion,
  markVdnPlayerLeft,
  parseVdnOnlineState,
  rejoinVdnPlayer,
  serializeVdnOnlineState,
  toVdnClientView,
  vdnBotEstimate,
  vdnClientViewJson,
  vdnOnlineBank,
  vdnSpectatorViewJson,
  type VdnBuildOptions,
  type VdnOnlineState,
  type VdnRoomActionInput,
  type VdnRoomActionResult,
} from './server-adapter'

const T0 = 1_700_000_000_000

const members = (...ids: string[]) => ids.map((id) => ({ userId: id, user: { displayName: `Joueur ${id}` } }))

function build(ids: string[], options: VdnBuildOptions = {}): VdnOnlineState {
  return buildVdnOnlineState(members(...ids), { seed: 'graine-vdn', now: T0, ...options })
}

function accepted(result: VdnRoomActionResult): VdnOnlineState {
  if (!result.ok) throw new Error(`action refusée : ${result.error}`)
  return result.state
}

function act(state: VdnOnlineState, userId: string, input: VdnRoomActionInput, now = T0 + 1_000): VdnOnlineState {
  return accepted(applyVdnRoomAction(state, userId, input, now))
}

const answerOf = (state: VdnOnlineState) => state.questions[state.game.index].answer
/** Plus loin que la réponse, jamais sous le minimum de la question (réponses négatives comprises). */
const farFrom = (answer: number, by = 1) => answer + (Math.abs(answer) + 10) * by

function revealed(state: VdnOnlineState, ...ids: string[]): VdnOnlineState {
  let s = state
  ids.forEach((id, i) => {
    s = act(s, id, { type: 'estimate', value: i === 0 ? answerOf(s) : farFrom(answerOf(s), i) })
  })
  return s
}

describe('buildVdnOnlineState : table et partie', () => {
  it('humains d’abord (userId brut), puis bots bot-N aux personas distincts, reproductibles', () => {
    const state = build(['u1', 'u2'], { botsCount: 3 })
    expect(state.players.map((p) => p.id)).toEqual(['u1', 'u2', 'bot-1', 'bot-2', 'bot-3'])
    expect(state.players.slice(0, 2).every((p) => !p.isBot && p.leftAt === null)).toBe(true)
    const bots = state.players.filter((p) => p.isBot)
    expect(new Set(bots.map((b) => b.name)).size).toBe(3)
    const names = BOT_PERSONAS.map(botDisplayName)
    for (const bot of bots) expect(names).toContain(bot.name)
    expect(build(['u1', 'u2'], { botsCount: 3 }).players).toEqual(state.players)
    expect(state.game.playerIds).toEqual(state.players.map((p) => p.id))
  })

  it('complète jusqu’au minimum sans option bots, et plafonne à 16', () => {
    expect(build(['u1']).players.map((p) => p.isBot)).toEqual([false, true])
    const full = build(['u1', 'u2'], { botsCount: 30 })
    expect(full.players).toHaveLength(VDN_ONLINE_MAX_PLAYERS)
  })

  it('ouvre la 1re question : 60 s, version 1, rien de révélé', () => {
    const state = build(['u1', 'u2'])
    expect(state.version).toBe(1)
    expect(state.phase).toBe('answering')
    expect(state.game.phase).toBe('answering')
    expect(state.phaseEndsAt).toBe(T0 + VDN_ANSWER_MS)
    expect(state.revealAt).toBeNull()
    expect(state.rematchVotes).toEqual([])
    expect(state.game.settings.allowCorrection).toBe(true)
    expect(state.questions).toHaveLength(10)
    expect(state.questions.map((q) => q.id)).toEqual(state.game.questionIds)
  })

  it('nombre de questions, thèmes et langue de la salle', () => {
    const sport = build(['u1', 'u2'], { questionCount: 5, themes: ['sport'], lang: 'it' })
    expect(sport.questions).toHaveLength(5)
    expect(sport.questions.every((q) => q.theme === 'sport')).toBe(true)
    expect(sport.lang).toBe('it')
    const italian = new Map(vdnOnlineBank('it').map((q) => [q.id, q.text]))
    for (const q of sport.questions) expect(q.text).toBe(italian.get(q.id))
    expect(build(['u1', 'u2'], { lang: 'de' }).lang).toBe('fr')
  })

  it('chaque langue a toute la banque, réponses identiques', () => {
    for (const lang of ['fr', 'en', 'es', 'it'] as const) {
      const bank = vdnOnlineBank(lang)
      expect(bank).toHaveLength(VDN_QUESTIONS.length)
      for (const q of bank) expect(q.answer).toBe(VDN_QUESTIONS.find((m) => m.id === q.id)?.answer)
    }
  })

  it('repère les questions dont la réponse est une année', () => {
    expect(isVdnYearQuestion('culture-premier-star-wars')).toBe(true)
    expect(isVdnYearQuestion('histoire-bastille')).toBe(true)
    expect(isVdnYearQuestion('corps-os-adulte')).toBe(false)
    expect(isVdnYearQuestion('geographie-loire')).toBe(false)
    const years = VDN_QUESTIONS.filter((q) => isVdnYearQuestion(q.id))
    expect(years.length).toBeGreaterThanOrEqual(10)
    for (const q of years) {
      expect(Number.isInteger(q.answer), q.id).toBe(true)
      expect(q.answer, q.id).toBeLessThan(VDN_BOT_REFERENCE_YEAR)
    }
    // Les drapeaux de la méta suivent les unités de la banque française : « année », ou
    // « av. J.-C. » (une date aussi, la règle affichée dit « un an pour une date »).
    const fr: Readonly<Record<string, { unit: string } | undefined>> = VDN_TEXTS_FR
    const bce = (id: string) => fr[id]?.unit === 'av. J.-C.'
    for (const q of VDN_QUESTIONS) expect(isVdnYearQuestion(q.id), q.id).toBe(fr[q.id]?.unit === 'année' || bce(q.id))
    expect(VDN_QUESTIONS.filter((q) => bce(q.id)).map((q) => q.id)).toEqual(['histoire-fondation-rome', 'histoire-alesia'])
    for (const lang of ['fr', 'en', 'es', 'it'] as const) {
      for (const q of vdnOnlineBank(lang)) {
        expect(q.year, `${lang} ${q.id}`).toBe(isVdnYearQuestion(q.id))
        expect(q.bce, `${lang} ${q.id}`).toBe(bce(q.id))
      }
    }
  })
})

describe('estimations', () => {
  it('secrète : seul son auteur la voit, les autres voient qu’il a répondu', () => {
    const state = act(build(['u1', 'u2']), 'u1', { type: 'estimate', value: 123_456.75 })
    expect(state.version).toBe(2)
    expect(state.phase).toBe('answering')
    const mine = toVdnClientView(state, 'u1')
    const other = toVdnClientView(state, 'u2')
    expect(mine.myEstimate).toBe(123_456.75)
    expect(other.myEstimate).toBeNull()
    expect(other.players.find((p) => p.id === 'u1')?.hasAnswered).toBe(true)
    expect(vdnClientViewJson(state, 'u2')).not.toContain('123456.75')
    expect(vdnSpectatorViewJson(state)).not.toContain('123456.75')
  })

  it('se corrige tant que la question est ouverte', () => {
    let state = act(build(['u1', 'u2', 'u3']), 'u1', { type: 'estimate', value: 10 })
    state = act(state, 'u1', { type: 'estimate', value: 20 })
    expect(state.game.estimates.u1).toBe(20)
    expect(state.phase).toBe('answering')
  })

  it('refuse un inconnu, un bot, une valeur sous le minimum', () => {
    const state = build(['u1'], { botsCount: 1 })
    expect(applyVdnRoomAction(state, 'intrus', { type: 'estimate', value: 1 }, T0)).toEqual({ ok: false, error: 'UNKNOWN_PLAYER' })
    expect(applyVdnRoomAction(state, 'bot-1', { type: 'estimate', value: 1 }, T0)).toEqual({ ok: false, error: 'UNKNOWN_PLAYER' })
    const min = state.questions[0].min
    expect(applyVdnRoomAction(state, 'u1', { type: 'estimate', value: min - 1 }, T0)).toEqual({ ok: false, error: 'BELOW_MIN' })
  })

  it('toute la table a répondu : révélation sans attendre l’échéance, barème appliqué', () => {
    const start = build(['u1', 'u2', 'u3'])
    const answer = answerOf(start)
    const state = revealed(start, 'u1', 'u2', 'u3')
    expect(state.phase).toBe('reveal')
    expect(state.revealAt).toBe(T0 + 1_000)
    expect(state.phaseEndsAt).toBe(T0 + 1_000 + VDN_REVEAL_MS)
    expect(state.version).toBe(4)
    expect(state.game.reveal?.answer).toBe(answer)
    expect(state.game.scores.u1).toBe(VDN_POINTS.bullseye)
    expect(state.game.scores.u3).toBe(VDN_POINTS.farthest)
    expect(applyVdnRoomAction(state, 'u1', { type: 'estimate', value: 1 }, T0)).toEqual({ ok: false, error: 'WRONG_PHASE' })
  })

  it('question-année : « dans le mille » à un an près, pas à 2 % du millésime', () => {
    const wall = vdnOnlineBank('fr').find((q) => q.id === 'histoire-chute-mur-berlin')
    expect(wall?.year).toBe(true)
    if (!wall) return
    const base = build(['u1', 'u2', 'u3'])
    const start: VdnOnlineState = {
      ...base,
      questions: [wall, ...base.questions.slice(1)],
      game: {
        ...base.game,
        questionIds: [wall.id, ...base.game.questionIds.slice(1)],
        questionMins: [wall.min, ...base.game.questionMins.slice(1)],
      },
    }
    // 1960 : le plus proche, à 29 ans — « dans le mille » avec un seuil de 2 % × 1989 ≈ 40 ans.
    let state = act(start, 'u1', { type: 'estimate', value: 1960 })
    state = act(state, 'u2', { type: 'estimate', value: 1900 })
    state = act(state, 'u3', { type: 'estimate', value: 2025 })
    expect(state.phase).toBe('reveal')
    expect(state.game.reveal?.results.map((r) => [r.playerId, r.tag])).toEqual([
      ['u1', 'closest'],
      ['u3', null],
      ['u2', 'farthest'],
    ])
    expect(state.game.scores.u1).toBe(VDN_POINTS.closest)
  })
})

describe('échéances et enchaînement', () => {
  it('advance : trop tôt, mauvaise clé, puis révélation à l’échéance sans les absents', () => {
    let state = build(['u1', 'u2', 'u3'])
    state = act(state, 'u1', { type: 'estimate', value: answerOf(state) })
    state = act(state, 'u2', { type: 'estimate', value: farFrom(answerOf(state)) })
    const key = phaseKey(state)
    expect(applyVdnRoomAction(state, '__service__', { type: 'advance', phaseKey: key }, T0 + 5_000)).toEqual({
      ok: false,
      error: 'NOT_EXPIRED',
    })
    expect(applyVdnRoomAction(state, '__service__', { type: 'advance', phaseKey: 'reveal#9' }, T0 + VDN_ANSWER_MS)).toEqual({
      ok: false,
      error: 'PHASE_CHANGED',
    })
    const shown = act(state, '__service__', { type: 'advance', phaseKey: key }, T0 + VDN_ANSWER_MS)
    expect(shown.phase).toBe('reveal')
    expect(shown.game.reveal?.results.map((r) => r.playerId)).toEqual(['u1', 'u2'])
    expect(shown.game.scores.u3).toBe(0)
  })

  it('personne n’a répondu : la question passe sans score', () => {
    const state = build(['u1', 'u2'])
    const shown = act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, T0 + VDN_ANSWER_MS)
    expect(shown.game.reveal?.results).toEqual([])
    expect(Object.values(shown.game.scores)).toEqual([0, 0])
  })

  it('révélation : « Question suivante » du meneur seul, après le plancher de lecture', () => {
    const shown = revealed(build(['u1', 'u2']), 'u1', 'u2')
    const at = shown.revealAt!
    expect(applyVdnRoomAction(shown, 'u1', { type: 'continue' }, at + 1_000)).toEqual({ ok: false, error: 'READING_TIME' })
    expect(applyVdnRoomAction(shown, 'intrus', { type: 'continue' }, at + VDN_REVEAL_MIN_MS)).toEqual({
      ok: false,
      error: 'UNKNOWN_PLAYER',
    })
    // Un autre joueur ne coupe pas la révélation à toute la table, même une fois la réponse lue.
    expect(applyVdnRoomAction(shown, 'u2', { type: 'continue' }, at + 20_000)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' })
    const next = act(shown, 'u1', { type: 'continue' }, at + VDN_REVEAL_MIN_MS)
    expect(next.phase).toBe('answering')
    expect(next.game.index).toBe(1)
    expect(next.game.estimates).toEqual({ u1: null, u2: null })
    expect(next.phaseEndsAt).toBe(at + VDN_REVEAL_MIN_MS + VDN_ANSWER_MS)
    expect(next.revealAt).toBeNull()
    expect(applyVdnRoomAction(next, 'u1', { type: 'continue' }, at + 10_000)).toEqual({ ok: false, error: 'WRONG_PHASE' })
  })

  it('meneur : le premier humain encore à table ; son départ passe la main au suivant, jamais à un bot', () => {
    const start = build(['u1', 'u2', 'u3'], { botsCount: 1 })
    expect(vdnRevealLeader(start.players)?.id).toBe('u1')
    const shown = revealed(start, 'u1', 'u2', 'u3')
    expect(shown.phase).toBe('answering')
    const all = act(shown, '__service__', { type: 'bot' })
    expect(all.phase).toBe('reveal')
    const left = markVdnPlayerLeft(all, 'u1', T0 + 2_000)!
    expect(vdnRevealLeader(left.players)?.id).toBe('u2')
    const at = left.revealAt! + VDN_REVEAL_MIN_MS
    expect(applyVdnRoomAction(left, 'u1', { type: 'continue' }, at)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' })
    expect(applyVdnRoomAction(left, 'u3', { type: 'continue' }, at)).toEqual({ ok: false, error: 'NOT_YOUR_TURN' })
    expect(act(left, 'u2', { type: 'continue' }, at).phase).toBe('answering')
    // Remplacé par un bot, l'ancien meneur ne le redevient pas.
    const replaced = convertVdnPlayerToBot(all, 'u1')!
    expect(vdnRevealLeader(replaced.players)?.id).toBe('u2')
    // Plus aucun humain : personne ne mène, la suite arrive à l'échéance.
    const deserted = { ...all, players: all.players.map((p) => (p.isBot ? p : { ...p, leftAt: T0 })) }
    expect(vdnRevealLeader(deserted.players)).toBeUndefined()
  })

  it('révélation échue : la question suivante arrive seule', () => {
    const shown = revealed(build(['u1', 'u2']), 'u1', 'u2')
    const next = act(shown, '__service__', { type: 'advance', phaseKey: phaseKey(shown) }, shown.phaseEndsAt!)
    expect(next.phase).toBe('answering')
    expect(next.game.index).toBe(1)
  })

  it('après la dernière révélation : partie finie, plus d’échéance', () => {
    let state = build(['u1', 'u2'], { questionCount: 5 })
    for (let i = 0; i < 5; i += 1) {
      state = revealed(state, 'u1', 'u2')
      state = act(state, 'u1', { type: 'continue' }, state.revealAt! + VDN_REVEAL_MIN_MS)
    }
    expect(state.phase).toBe('finished')
    expect(state.game.phase).toBe('finished')
    expect(state.phaseEndsAt).toBeNull()
    expect(state.game.scores.u1).toBe(5 * VDN_POINTS.bullseye)
    expect(state.game.scores.u2).toBe(5 * VDN_POINTS.farthest)
    expect(applyVdnRoomAction(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, T0 + 1e9)).toEqual({
      ok: false,
      error: 'NO_DEADLINE',
    })
  })
})

describe('bots', () => {
  it('un tick = un bot, dans l’ordre de la table ; plus personne → NOT_BOT_TURN', () => {
    let state = build(['u1'], { botsCount: 3 })
    state = act(state, '__service__', { type: 'bot' })
    expect(state.players.filter((p) => state.game.estimates[p.id] !== null).map((p) => p.id)).toEqual(['bot-1'])
    state = act(state, '__service__', { type: 'bot' })
    state = act(state, '__service__', { type: 'bot' })
    expect(applyVdnRoomAction(state, '__service__', { type: 'bot' }, T0)).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
    expect(state.phase).toBe('answering')
    state = act(state, 'u1', { type: 'estimate', value: answerOf(state) })
    expect(state.phase).toBe('reveal')
    expect(applyVdnRoomAction(state, '__service__', { type: 'bot' }, T0)).toEqual({ ok: false, error: 'NOT_BOT_TURN' })
  })

  it('tirage par le RNG du serveur : reproductible, et la graine avance', () => {
    const state = build(['u1'], { botsCount: 1 })
    const a = act(state, '__service__', { type: 'bot' })
    const b = act(state, '__service__', { type: 'bot' })
    expect(a.game.estimates['bot-1']).toBe(b.game.estimates['bot-1'])
    expect(a.rngState).not.toBe(state.rngState)
  })

  it('estimation crédible : arrondie, au-dessus du minimum, centrée sur la réponse', () => {
    const rng = createRng('bruit')
    const draws = Array.from({ length: 400 }, () => vdnBotEstimate({ answer: 206, min: 0, year: false }, rng))
    expect(draws.every((v) => Number.isInteger(v) && v >= 0)).toBe(true)
    const sorted = [...draws].sort((x, y) => x - y)
    const median = sorted[sorted.length / 2]
    expect(median).toBeGreaterThan(160)
    expect(median).toBeLessThan(260)
    expect(new Set(draws).size).toBeGreaterThan(10)
    // Deux chiffres significatifs, comme un humain lance un ordre de grandeur.
    for (const v of draws) expect(Number(v.toPrecision(2))).toBe(v)
    const decimals = Array.from({ length: 50 }, () => vdnBotEstimate({ answer: 9.81, min: 0, year: false }, rng))
    for (const v of decimals) expect(Math.round(v * 100) / 100).toBeCloseTo(v, 10)
    const frozen = Array.from({ length: 200 }, () => vdnBotEstimate({ answer: -273, min: -1000, year: false }, rng))
    expect(frozen.every((v) => v <= 0 && v >= -1000)).toBe(true)
  })

  it('une année : bruit sur l’ancienneté, jamais dans le futur', () => {
    const rng = createRng('annees')
    const draws = Array.from({ length: 300 }, () => vdnBotEstimate({ answer: 1977, min: 0, year: true }, rng))
    expect(draws.every((v) => Number.isInteger(v) && v < VDN_BOT_REFERENCE_YEAR && v > 1700)).toBe(true)
    const sorted = [...draws].sort((x, y) => x - y)
    expect(Math.abs(sorted[150] - 1977)).toBeLessThan(15)
    // Pompéi (79) : sans repli, une estimation sur deux s'écraserait sur le minimum (0).
    const ancient = Array.from({ length: 300 }, () => vdnBotEstimate({ answer: 79, min: 0, year: true }, rng))
    expect(ancient.every((v) => Number.isInteger(v) && v >= 0 && v < VDN_BOT_REFERENCE_YEAR)).toBe(true)
    expect(ancient.filter((v) => v === 0).length).toBeLessThan(15)
  })

  it('une année avant notre ère : bruit sur le nombre, centré sur la réponse', () => {
    const rng = createRng('avant-notre-ere')
    // Alésia (52 av. J.-C.) : bruitée sur l'ancienneté, l'estimation tombait vers l'an 760.
    const alesia = Array.from({ length: 300 }, () => vdnBotEstimate({ answer: 52, min: 0, year: true, bce: true }, rng))
    expect(alesia.every((v) => Number.isInteger(v) && v > 0)).toBe(true)
    const median = [...alesia].sort((x, y) => x - y)[150]
    expect(median).toBeGreaterThan(40)
    expect(median).toBeLessThan(65)
    const rome = Array.from({ length: 300 }, () => vdnBotEstimate({ answer: 753, min: 0, year: true, bce: true }, rng))
    const romeMedian = [...rome].sort((x, y) => x - y)[150]
    expect(romeMedian).toBeGreaterThan(600)
    expect(romeMedian).toBeLessThan(950)
  })
})

describe('départs, retours, remplacements', () => {
  it('le dernier attendu s’en va : révélation sur-le-champ', () => {
    let state = build(['u1', 'u2', 'u3'])
    state = act(state, 'u1', { type: 'estimate', value: answerOf(state) })
    state = act(state, 'u2', { type: 'estimate', value: farFrom(answerOf(state)) })
    const left = markVdnPlayerLeft(state, 'u3', T0 + 2_000)!
    expect(left.players.find((p) => p.id === 'u3')?.leftAt).toBe(T0 + 2_000)
    expect(left.phase).toBe('reveal')
    expect(left.version).toBe(state.version + 1)
  })

  it('départ : rien pour un bot, un inconnu, un parti, une partie finie', () => {
    const state = build(['u1'], { botsCount: 1 })
    expect(markVdnPlayerLeft(state, 'bot-1', T0)).toBeNull()
    expect(markVdnPlayerLeft(state, 'intrus', T0)).toBeNull()
    const left = markVdnPlayerLeft(state, 'u1', T0)!
    expect(left.phase).toBe('answering')
    expect(markVdnPlayerLeft(left, 'u1', T0)).toBeNull()
    expect(markVdnPlayerLeft({ ...state, phase: 'finished' }, 'u1', T0)).toBeNull()
  })

  it('retour avant remplacement', () => {
    const left = markVdnPlayerLeft(build(['u1', 'u2']), 'u2', T0)!
    const back = rejoinVdnPlayer(left, 'u2')!
    expect(back.players.find((p) => p.id === 'u2')?.leftAt).toBeNull()
    expect(rejoinVdnPlayer(back, 'u2')).toBeNull()
  })

  it('remplacement après la grâce : bot sous le même id, qui estime ensuite', () => {
    const left = markVdnPlayerLeft(build(['u1', 'u2']), 'u2', T0)!
    expect(applyVdnRoomAction(left, 'u1', { type: 'replace-left', graceMs: 180_000 }, T0 + 1_000)).toEqual({
      ok: false,
      error: 'NOTHING_TO_REPLACE',
    })
    const replaced = act(left, 'u1', { type: 'replace-left', graceMs: 180_000 }, T0 + 180_000)
    expect(replaced.players.find((p) => p.id === 'u2')).toMatchObject({ isBot: true, leftAt: null })
    const played = act(replaced, '__service__', { type: 'bot' })
    expect(played.game.estimates.u2).not.toBeNull()
  })

  it('conversion directe en bot, jamais une fois la partie finie', () => {
    const state = build(['u1', 'u2'])
    expect(convertVdnPlayerToBot(state, 'u2')?.players[1]).toMatchObject({ id: 'u2', isBot: true })
    expect(convertVdnPlayerToBot({ ...state, phase: 'finished' }, 'u2')).toBeNull()
    expect(convertVdnPlayerToBot(state, 'intrus')).toBeNull()
  })
})

describe('vues : rien de secret ne sort', () => {
  const SECRET_KEYS = ['rngState', 'questions', 'game', 'estimates', 'lang', 'revealAt', 'winner']

  function expectNoSecretKeys(view: VdnClientView) {
    for (const key of SECRET_KEYS) expect(view, key).not.toHaveProperty(key)
  }

  it('question ouverte : ni réponse, ni source, ni les questions suivantes', () => {
    const state = build(['u1', 'u2'])
    const question = state.questions[0]
    for (const json of [vdnClientViewJson(state, 'u1'), vdnSpectatorViewJson(state)]) {
      const view = JSON.parse(json) as VdnClientView
      expectNoSecretKeys(view)
      expect(view.reveal).toBeNull()
      expect(view.question).toEqual({
        id: question.id,
        theme: question.theme,
        text: question.text,
        unit: question.unit,
        min: question.min,
      })
      expect(json).not.toContain('"answer"')
      expect(json).not.toContain('"source"')
      expect(json).not.toContain(question.source)
      for (const later of state.questions.slice(1)) expect(json).not.toContain(later.id)
      expect(view.questionNumber).toBe(1)
      expect(view.questionCount).toBe(10)
      expect(view.phaseKey).toBe(phaseKey(state))
      expect(view.continueAt).toBeNull()
    }
  })

  it('unité : une année de notre ère se lit seule (« 1959 », pas « 1959 année »), avant notre ère avec son ère', () => {
    const base = build(['u1', 'u2'])
    const unitOn = (id: string, lang: 'fr' | 'en' = 'fr') => {
      const question = vdnOnlineBank(lang).find((q) => q.id === id)
      if (!question) throw new Error(`${id} absente`)
      const state: VdnOnlineState = {
        ...base,
        questions: [question, ...base.questions.slice(1)],
        game: {
          ...base.game,
          questionIds: [question.id, ...base.game.questionIds.slice(1)],
          questionMins: [question.min, ...base.game.questionMins.slice(1)],
        },
      }
      expect(toVdnClientView(state, '').question?.unit).toBe(toVdnClientView(state, 'u1').question?.unit)
      return toVdnClientView(state, 'u1').question?.unit
    }
    expect(unitOn('culture-premier-asterix')).toBe('')
    expect(unitOn('culture-premier-asterix', 'en')).toBe('')
    expect(unitOn('histoire-fondation-rome')).toBe('av. J.-C.')
    expect(unitOn('histoire-fondation-rome', 'en')).toBe('BC')
    expect(unitOn('corps-os-adulte')).toBe('os')
  })

  it('révélation : réponse, source et estimations de chacun ; spectateur sans « mon estimation »', () => {
    const state = revealed(build(['u1', 'u2']), 'u1', 'u2')
    const view = toVdnClientView(state, 'u2')
    expect(view.reveal).toMatchObject({ questionId: state.questions[0].id, answer: answerOf(state), source: state.questions[0].source })
    expect(view.reveal?.results).toHaveLength(2)
    expect(view.myEstimate).toBe(state.game.estimates.u2)
    expect(view.continueAt).toBe(state.revealAt! + VDN_REVEAL_MIN_MS)
    const tv = JSON.parse(vdnSpectatorViewJson(state)) as VdnClientView
    expect(tv.myEstimate).toBeNull()
    expectNoSecretKeys(tv)
  })

  it('pose de la règle : le classement d’avant la question, celui que la TV montrait pendant la question', () => {
    let state = revealed(build(['u1', 'u2', 'u3']), 'u1', 'u2', 'u3') // u1 +6, u3 −1
    state = act(state, 'u1', { type: 'continue' }, state.revealAt! + VDN_REVEAL_MIN_MS)
    const asked = toVdnClientView(state, '')
    state = revealed(state, 'u3', 'u2', 'u1') // u3 +6, u1 −1
    const shown = toVdnClientView(state, '')
    expect(shown.ranking.map((r) => [r.playerId, r.score])).toEqual([
      ['u1', 5],
      ['u3', 5],
      ['u2', 0],
    ])
    expect(asked.ranking.map((r) => [r.playerId, r.score, r.rank])).toEqual([
      ['u1', 6, 1],
      ['u2', 0, 2],
      ['u3', -1, 3],
    ])
    expect(vdnRankingBeforeReveal(shown)).toEqual(asked.ranking)
    expect(vdnRankingBeforeReveal(asked)).toBe(asked.ranking)
  })

  it('partie finie : plus de question ni de révélation, le classement reste', () => {
    const finished = { ...revealed(build(['u1', 'u2']), 'u1', 'u2'), phase: 'finished' as const }
    const view = toVdnClientView(finished, 'u1')
    expect(view.question).toBeNull()
    expect(view.reveal).toBeNull()
    expect(view.ranking.map((r) => r.playerId)).toEqual(['u1', 'u2'])
  })

  it('socle des jeux à phases : version et phase dans l’état et dans chaque vue', () => {
    const state = build(['u1', 'u2'])
    for (const json of [serializeVdnOnlineState(state), vdnClientViewJson(state, 'u1'), vdnSpectatorViewJson(state)]) {
      expect(parseSimplePhaseSyncedState(json)).toMatchObject({ version: 1, phase: 'answering', rematchVotes: [] })
    }
  })
})

describe('parse / serialize', () => {
  it('aller-retour fidèle, champs manquants complétés', () => {
    const state = build(['u1', 'u2'])
    expect(parseVdnOnlineState(serializeVdnOnlineState(state))).toEqual(state)
    const { rematchVotes: _votes, revealAt: _at, ...older } = state
    void _votes
    void _at
    expect(parseVdnOnlineState(JSON.stringify(older))).toMatchObject({ rematchVotes: [], revealAt: null })
  })

  it('jamais d’exception sur un JSON illisible ou d’une autre forme', () => {
    for (const json of [null, '', '{', 'null', '5', '[]', '{"phase":"answering"}', '{"version":1,"phase":"x","phaseSeq":1,"players":[],"questions":[],"game":null}']) {
      expect(() => parseVdnOnlineState(json)).not.toThrow()
      expect(parseVdnOnlineState(json)).toBeNull()
    }
  })
})
