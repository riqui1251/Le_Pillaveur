import { describe, expect, it } from 'vitest'
import { createRng } from '@/lib/petit-buveur/rng'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName, botTraitsFor } from '@/lib/online/bot-personas'
import {
  createEspionState,
  espionFreeSpeechLeft,
  pendingEspionQuestion,
  reduceEspion,
  toEspionSpectatorView,
  ESPION_ACCUSATION_WINDOW_MS,
  ESPION_HUMAN_ASK_PRIORITY_MS,
  ESPION_SPEECH_CAP,
  type EspionAction,
  type EspionSpeech,
  type EspionState,
} from './engine'
import { applyEspionBotAction, ESPION_BOT_DEPS } from './server-adapter'
import { espionBotMove } from './bot-speech'
import { espionAllyShare } from './bot-brain'
import {
  espionBotTempoMs,
  espionBotTickDelayMs,
  espionDueBotEvents,
  espionHash01,
  ESPION_BOT_EARLY_SLACK_MS,
  ESPION_LAST_CALL_MS,
  ESPION_NO_QUESTION_END_MS,
  ESPION_OPENING_MS,
  ESPION_SPEECH_END_MS,
  ESPION_SPEECH_PAUSE_MS,
} from './bot-tick'
import { ESPION_LOCATION_IDS, espionLocationName, getEspionLocations, type EspionLocationId } from './data'
import { espionAttrsOf } from './data/attributes'
import { ESPION_ANY, ESPION_QUESTION_IDS, espionQuestionValues, type EspionQuestionId } from './data/questions'

/**
 * Planificateur des bots de l'Espion : un tick = une écriture, dans l'ordre
 * (1) devinette désespérée … (7) question suivante, (8) rien.
 */

const deps = ESPION_BOT_DEPS
const MIN = 60_000
const DISCUSSION_MS = 3 * MIN
const L: EspionLocationId = 'plage'
const attrs = (id: EspionLocationId) => espionAttrsOf(id)!
const PRECISE = ESPION_QUESTION_IDS.filter((q) => attrs(L)[q] !== ESPION_ANY)
const wrongFor = (q: EspionQuestionId) => espionQuestionValues(q).find((v) => v !== attrs(L)[q])!
const zero = () => 0

type Entry = Omit<EspionSpeech, 'round'>

/** Bots nommés d'après les personas (tempo, audace) ; `humans` en tête de table. */
function table({ humans = [] as string[], bots = 5, spy = 'bot-5', location = L, speech = [] as Entry[] } = {}) {
  const seats = [
    ...humans.map((id) => ({ id, name: id, isBot: false })),
    ...Array.from({ length: bots }, (_, i) => ({ id: `bot-${i + 1}`, name: botDisplayName(BOT_PERSONAS[i]), isBot: true })),
  ]
  let s = createEspionState(seats, getEspionLocations('fr'), 'fixture', 0, DISCUSSION_MS)
  s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
  const start = s.phaseEndsAt! - DISCUSSION_MS
  const state: EspionState = {
    ...s,
    location: espionLocationName(location, 'fr'),
    players: s.players.map((p) => ({ ...p, role: p.id === spy ? 'spy' : 'crew' })),
    speech: speech.map((sp) => ({ ...sp, round: s.round })),
  }
  return { state, start, end: s.phaseEndsAt! }
}

const qa = (asker: string, target: string, q: EspionQuestionId, value: string, at: number): Entry[] => [
  { playerId: asker, kind: 'question', targetId: target, questionId: q, at },
  { playerId: target, kind: 'answer', targetId: asker, questionId: q, value: value as EspionSpeech['value'], at: at + 2_000 },
]

/** Entrées non silencieuses écrites par une écriture. */
const bubbles = (before: EspionState, actions: EspionAction[]) => {
  const after = actions.reduce(reduceEspion, before)
  return (after.speech ?? []).slice((before.speech ?? []).length).filter((sp) => !sp.quiet)
}

describe('un tick = une écriture, dans l’ordre', () => {
  it('(1) l’espion bot accusé, à une voix de tomber, tente le lieu', () => {
    const { state, start } = table()
    let s = reduceEspion(state, { type: 'ACCUSE', playerId: 'bot-1', targetId: 'bot-5', now: start + 10_000 })
    s = reduceEspion(s, { type: 'SUPPORT', playerId: 'bot-2', now: start + 11_000 })
    const move = espionBotMove(s, start + 10_000 + 8_000, zero, deps)
    expect(move).toHaveLength(1)
    expect(move![0]).toMatchObject({ type: 'GUESS_LOCATION', playerId: 'bot-5' })
  })

  it('(2) les bots échus soutiennent ou refusent d’un seul coup, avec au plus une bulle', () => {
    const { state, start } = table({ bots: 8, spy: 'bot-8' })
    const opened = start + 10_000
    const s = reduceEspion(state, { type: 'ACCUSE', playerId: 'bot-1', targetId: 'bot-2', now: opened })
    const move = espionBotMove(s, opened + 8_000, zero, deps)!
    expect(move.length).toBeGreaterThan(0)
    expect(move.every((a) => a.type === 'SUPPORT' || a.type === 'DECLINE')).toBe(true)
    expect(bubbles(s, move).length).toBeLessThanOrEqual(1)
  })

  it('(3) le bot interrogé répond', () => {
    const askedAt = 30_000
    const { state } = table({ speech: [{ playerId: 'bot-1', kind: 'question', targetId: 'bot-3', questionId: PRECISE[0], at: askedAt }] })
    const move = espionBotMove(state, askedAt + 8_000, zero, deps)
    expect(move).toEqual([{ type: 'ANSWER', playerId: 'bot-3', value: expect.any(String), now: askedAt + 8_000 }])
  })

  it('(4) l’espion bot, sûr de lui, devine plutôt que de poser la question due', () => {
    const others = ['bot-1', 'bot-2', 'bot-3', 'bot-4']
    const speech = PRECISE.flatMap((q, i) => qa(others[i % 4], others[(i + 1) % 4], q, attrs(L)[q], 10_000 + i * 6_000))
    const { state } = table({ speech })
    const last = speech[speech.length - 1].at
    const move = espionBotMove(state, last + 8_000, zero, deps)
    expect(move).toEqual([{ type: 'GUESS_LOCATION', playerId: 'bot-5', locationId: L, now: last + 8_000 }])
  })

  it('(5) un équipier accuse sur preuve plutôt que de poser la question due', () => {
    const speech = qa('bot-1', 'bot-5', PRECISE[0], wrongFor(PRECISE[0]), 10_000)
    const { state } = table({ speech })
    const move = espionBotMove(state, 10_000 + 2_000 + 7_000, zero, deps)!
    expect(move).toHaveLength(1)
    expect(move[0]).toMatchObject({ type: 'ACCUSE', targetId: 'bot-5' })
  })

  it('(6) dernier appel : le plus audacieux accuse son premier suspect', () => {
    // Fil épuisé (plafond de 10 questions) : le dernier appel est avancé.
    const ids = ['bot-1', 'bot-2', 'bot-3', 'bot-4', 'bot-5']
    const speech = Array.from({ length: 10 }, (_, i) => {
      const q = ESPION_QUESTION_IDS[i]
      const target = ids[(i + 1) % 5]
      return qa(ids[i % 5], target, q, target === 'bot-5' ? ESPION_ANY : attrs(L)[q] === ESPION_ANY ? ESPION_ANY : attrs(L)[q], 10_000 + i * 6_000)
    }).flat()
    const { state } = table({ speech })
    const at = speech[speech.length - 1].at + 4_000
    const move = espionBotMove(state, at, zero, deps)!
    expect(move).toHaveLength(1)
    // Raoul (bot-3) est le plus audacieux.
    expect(move[0]).toMatchObject({ type: 'ACCUSE', playerId: 'bot-3' })
  })

  it('(7) ouverture : la première question, 4 s après le début ; (8) avant, rien', () => {
    const { state, start } = table()
    expect(espionBotMove(state, start + 1_000, zero, deps)).toBeNull()
    const move = espionBotMove(state, start + ESPION_OPENING_MS, zero, deps)!
    expect(move).toHaveLength(1)
    expect(move[0]).toMatchObject({ type: 'ASK' })
  })

  it('aucune question pendant une accusation, ni dans les 10 dernières secondes', () => {
    const { state, start, end } = table()
    const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'bot-1', targetId: 'bot-2', now: start + 1_000 })
    for (let at = start + 1_000; at < start + 1_000 + ESPION_ACCUSATION_WINDOW_MS; at += 500) {
      const move = espionBotMove(accused, at, zero, deps)
      expect(move?.some((a) => a.type === 'ASK') ?? false).toBe(false)
    }
    const lateAt = end - ESPION_NO_QUESTION_END_MS - 2_000
    const late = table({ speech: qa('bot-1', 'bot-2', 'where', attrs(L).where, lateAt - 2_000) })
    for (let at = lateAt; at < end; at += 500) {
      const move = espionBotMove(late.state, at, zero, deps)
      expect(move?.some((a) => a.type === 'ASK') ?? false).toBe(false)
    }
  })
})

describe('propriétés', () => {
  /** États de partie variés : bots seuls, solo, mixte, à des instants tirés au hasard. */
  /** Un humain interrogé répond au hasard 3 s plus tard (« ça dépend » compris) ; sinon, une fois sur dix, il trouve un bot « louche ». */
  function humanMove(state: EspionState, at: number, rand: () => number): Extract<EspionAction, { type: 'ANSWER' | 'SPEAK' }> | null {
    const pending = pendingEspionQuestion(state, at)
    const asked = pending && state.players.find((p) => p.id === pending.targetId)
    if (pending && asked && !asked.isBot) {
      const values = [...espionQuestionValues(pending.questionId), ESPION_ANY]
      return { type: 'ANSWER', playerId: asked.id, value: values[Math.floor(rand() * values.length)], now: Math.max(at, pending.askedAt + 3_000) }
    }
    const speaker = state.players.find((p) => !p.isBot && !p.leftAt && espionFreeSpeechLeft(state, p.id) > 0)
    const bots = state.players.filter((p) => p.isBot && !p.leftAt)
    if (!speaker || bots.length === 0 || at + 1_000 >= state.phaseEndsAt! || rand() >= 0.1) return null
    return { type: 'SPEAK', playerId: speaker.id, kind: 'suspect', targetId: bots[Math.floor(rand() * bots.length)].id, now: at + 1_000 }
  }

  function snapshots(count: number): { state: EspionState; now: number }[] {
    const out: { state: EspionState; now: number }[] = []
    const rng = createRng('instants')
    for (let g = 0; out.length < count; g += 1) {
      const spec = [{ bots: 5 }, { humans: ['h1'], bots: 4, spy: 'h1' }, { humans: ['h1', 'h2', 'h3'], bots: 2, spy: 'bot-1' }][g % 3]
      let { state } = table({ ...spec, location: ESPION_LOCATION_IDS[g % ESPION_LOCATION_IDS.length] })
      let versionAt = state.phaseEndsAt! - DISCUSSION_MS
      const rand = createRng(`p-${g}`).next
      for (let step = 0; step < 40 && state.phase === 'discussion'; step += 1) {
        out.push({ state, now: versionAt + rng.next() * 30_000 })
        // Les humains jouent aussi : ils répondent quand on les interroge, et trouvent parfois un bot « louche ».
        const human = humanMove(state, versionAt, rand)
        if (human) {
          state = reduceEspion(state, human)
          versionAt = human.now
          continue
        }
        const delay = espionBotTickDelayMs(toEspionSpectatorView(state), versionAt, rand)
        if (delay === null) break
        const result = applyEspionBotAction(state, rand, versionAt + delay, deps)
        if (!result.ok) break
        state = result.state
        versionAt += delay
      }
    }
    return out.slice(0, count)
  }

  it('500 états : une échéance due produit une écriture ; null ⇒ aucune échéance due, la prochaine est dans le futur', () => {
    let writes = 0
    let speeches = 0
    for (const { state, now } of snapshots(500)) {
      const move = espionBotMove(state, now, createRng(`m-${now}`).next, deps)
      const due = espionDueBotEvents(toEspionSpectatorView(state), now)
      if (move === null) {
        // Seule exception tolérée : la question due par avance d'horloge (≤ 1,5 s) quand la
        // question sans réponse attend encore son expiration — le filet serveur, plus tardif,
        // la pose. Un dernier appel dû écrit toujours : son bot a quelqu'un à viser.
        expect(due.filter((e) => e.kind !== 'turn' || e.at <= now), `${now}`).toEqual([])
        const delay = espionBotTickDelayMs(toEspionSpectatorView(state), now, zero)
        if (due.length === 0 && delay !== null) expect(delay).toBeGreaterThan(0)
      } else {
        writes += 1
        expect(bubbles(state, move).length).toBeLessThanOrEqual(1)
        // Parole libre d'un bot : jamais dans les 10 dernières secondes, sous min(plafond, bavardage) hors défense.
        for (const a of move) {
          if (a.type !== 'SPEAK') continue
          speeches += 1
          expect(now, `${a.kind} @${now}`).toBeLessThan(state.phaseEndsAt! - ESPION_SPEECH_END_MS)
          if (a.kind === 'defend') continue
          const name = state.players.find((p) => p.id === a.playerId)!.name
          const before = (state.speech ?? []).filter(
            (sp) => sp.round === state.round && sp.playerId === a.playerId && ['suspect', 'defend', 'ally', 'toldYou', 'wrong'].includes(sp.kind)
          ).length
          expect(before, a.playerId).toBeLessThan(Math.min(ESPION_SPEECH_CAP, botTraitsFor(name).bavardage))
        }
        expect(move.every((a) => a.type === move[0].type || ['SUPPORT', 'DECLINE'].includes(a.type))).toBe(true)
        if (move.length > 1) expect(move.every((a) => a.type === 'SUPPORT' || a.type === 'DECLINE')).toBe(true)
      }
    }
    expect(writes).toBeGreaterThan(100)
    expect(speeches).toBeGreaterThan(5)
  })

  it('brouillage : l’espion permuté entre deux humains ne change aucun coup des bots', () => {
    for (let g = 0; g < 30; g += 1) {
      const speech = qa('h1', 'bot-1', PRECISE[g % PRECISE.length], attrs(L)[PRECISE[g % PRECISE.length]], 10_000)
      const a = table({ humans: ['h1', 'h2', 'h3'], bots: 2, spy: 'h2', speech }).state
      const b = { ...a, players: a.players.map((p) => ({ ...p, role: p.id === 'h3' ? ('spy' as const) : ('crew' as const) })) }
      for (const now of [15_000, 22_000, 40_000, 120_000, 150_000]) {
        expect(espionBotMove(b, now, createRng(`b-${g}`).next, deps), `${g} @${now}`).toEqual(
          espionBotMove(a, now, createRng(`b-${g}`).next, deps)
        )
      }
    }
  })

  it('brouillage du lieu : l’espion bot, seul bot parmi des humains, joue pareil quel que soit le lieu tiré', () => {
    const speech: Entry[] = [
      ...qa('h1', 'h2', PRECISE[0], attrs(L)[PRECISE[0]], 10_000),
      ...qa('h2', 'h3', PRECISE[1], attrs(L)[PRECISE[1]], 20_000),
      { playerId: 'h3', kind: 'question', targetId: 'bot-1', questionId: PRECISE[2], at: 30_000 },
    ]
    // Sa réponse à la question en attente, puis sa décision sur une accusation entre humains.
    const moves = (location: EspionLocationId) => {
      const { state } = table({ humans: ['h1', 'h2', 'h3'], bots: 1, spy: 'bot-1', location, speech })
      const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'h1', targetId: 'h2', now: 60_000 })
      return [
        ...[33_000, 40_000, 50_000].map((now) => espionBotMove(state, now, createRng(`lieu-${now}`).next, deps)),
        ...[62_000, 66_000].map((now) => espionBotMove(accused, now, createRng(`lieu-${now}`).next, deps)),
      ]
    }
    const reference = moves(L)
    expect(reference.filter((move) => move !== null).length).toBeGreaterThanOrEqual(3)
    for (const location of ESPION_LOCATION_IDS) expect(moves(location), location).toEqual(reference)
  })

  it('même graine et mêmes instants ⇒ même coup', () => {
    for (const { state, now } of snapshots(60)) {
      expect(espionBotMove(state, now, createRng('x').next, deps)).toEqual(espionBotMove(state, now, createRng('x').next, deps))
    }
  })
})

describe('le dernier appel ne vise jamais un humain resté au vocal', () => {
  it('à plusieurs humains, un humain jamais interrogé n’est pas la cible du dernier appel', () => {
    // Les bots se sont interrogés entre eux et ont répondu juste ; h1, h2 et h3 n'ont pas touché aux boutons.
    const speech = [...qa('bot-1', 'bot-2', 'where', attrs(L).where, 10_000), ...qa('bot-2', 'bot-1', 'when', attrs(L).when, 20_000)]
    const { state, end } = table({ humans: ['h1', 'h2', 'h3'], bots: 2, spy: 'h1', speech })
    const at = end - ESPION_LAST_CALL_MS + 500
    const move = espionBotMove(state, at, zero, deps)
    for (const action of move ?? []) {
      if (action.type === 'ACCUSE') expect(['h1', 'h2', 'h3']).not.toContain(action.targetId)
    }
    expect(pendingEspionQuestion(state, at)).toBeNull()
  })

  it('un seul bot, des humains au vocal : pas de dernier appel sans cible, et la question posée au bot après T − 40 s reçoit sa réponse', () => {
    // Barnabé, Gaston, Huguette, Raoul : des tempos de 0,9 à 7,5 s.
    for (const persona of [0, 5, 12, 2]) {
      const seats = [
        { id: 'h1', name: 'h1', isBot: false },
        { id: 'h2', name: 'h2', isBot: false },
        { id: 'bot-1', name: botDisplayName(BOT_PERSONAS[persona]), isBot: true },
      ]
      let s = createEspionState(seats, getEspionLocations('fr'), 'vocal', 0, DISCUSSION_MS)
      s = reduceEspion(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
      const end = s.phaseEndsAt!
      // Personne n'a touché aux boutons : aucune échéance, aucun tick pour rien.
      expect(espionBotTickDelayMs(toEspionSpectatorView(s), end - ESPION_LAST_CALL_MS - 1_000, zero)).toBeNull()
      const askedAt = end - 35_000
      s = reduceEspion(s, { type: 'ASK', playerId: 'h1', targetId: 'bot-1', questionId: 'where', now: askedAt })
      // Le tick du client (tirage quelconque) puis le filet serveur (rand = 1, + 1,5 s) : le premier qui passe répond.
      for (const r of [0, 0.5, 1]) {
        const at = askedAt + espionBotTickDelayMs(toEspionSpectatorView(s), askedAt, () => r)! + (r === 1 ? 1_500 : 0)
        const result = applyEspionBotAction(s, zero, at, deps)
        expect(result.ok, `${seats[2].name} r=${r}`).toBe(true)
        if (result.ok) expect(result.state.speech![result.state.speech!.length - 1]).toMatchObject({ kind: 'answer', playerId: 'bot-1' })
      }
    }
  })
})

describe('la table parle (lot 5) : une réaction par scénario', () => {
  // bot-1 Barnabé (prudent 0,25), bot-2 Gépéto (farceur 0,8), bot-3 Raoul (agressif 0,85), bot-4 Suzette (suiveur 0,45, loyauté 0,85).
  const SOLO_SPEC = { humans: ['h1'], bots: 4 }
  const [Q1, Q2] = PRECISE
  /** Une accusation de bot close il y a moins de 20 s : aucun bot ne peut accuser, la réaction passe. */
  const recentAccuse: Entry = { playerId: 'bot-4', kind: 'accuse', targetId: 'bot-1', at: 22_000 }
  const speakMove = (move: EspionAction[] | null) => (move?.length === 1 && move[0].type === 'SPEAK' ? move[0] : null)

  it('défense : le bot qu’un humain trouve « louche » répond à son accusateur, à son tempo ; jamais un soutien ni un refus', () => {
    const at = 30_000
    // Une question attend la réponse de h1 : ni question suivante ni réponse de bot ne sont dues, seule la défense.
    const pendingToHuman: Entry = { playerId: 'bot-1', kind: 'question', targetId: 'h1', questionId: Q1, at: at - 1_000 }
    const { state } = table({ ...SOLO_SPEC, spy: 'bot-1', speech: [pendingToHuman, { playerId: 'h1', kind: 'suspect', targetId: 'bot-2', at }] })
    const due = at + espionBotTempoMs({ id: 'bot-2', name: botDisplayName(BOT_PERSONAS[1]) }, at)
    expect(espionBotMove(state, due - ESPION_BOT_EARLY_SLACK_MS - 1, zero, deps)).toBeNull()
    expect(espionBotMove(state, due, zero, deps)).toEqual([{ type: 'SPEAK', playerId: 'bot-2', kind: 'defend', targetId: 'h1', now: due }])
    // Accusé formellement, il se défend aussi, et ne se prononce jamais sur sa propre accusation.
    const accused = reduceEspion(table({ ...SOLO_SPEC, spy: 'bot-1' }).state, { type: 'ACCUSE', playerId: 'h1', targetId: 'bot-2', now: at })
    let s = accused
    for (let t = at; t < at + ESPION_ACCUSATION_WINDOW_MS && s.phase === 'discussion'; t += 250) {
      const move = espionBotMove(s, t, zero, deps)
      if (move) s = move.reduce(reduceEspion, s)
    }
    const fromAccused = (s.speech ?? []).filter((sp) => sp.playerId === 'bot-2' && ['rally', 'doubt', 'defend'].includes(sp.kind))
    expect(fromAccused.map((sp) => [sp.kind, sp.targetId])).toEqual([['defend', 'h1']])
  })

  it('soupçon : la réponse humaine qui jure avec le lieu, relevée par le plus audacieux des équipiers — jamais par l’espion, qui ne sait pas', () => {
    const speech: Entry[] = [recentAccuse, ...qa('bot-2', 'h1', Q1, wrongFor(Q1), 25_000)]
    // Raoul (bot-3), le plus audacieux, est l'espion : Gépéto (bot-2) relève.
    const { state } = table({ ...SOLO_SPEC, spy: 'bot-3', speech })
    const at = 27_000 + ESPION_HUMAN_ASK_PRIORITY_MS
    expect(speakMove(espionBotMove(state, at, zero, deps))).toEqual({ type: 'SPEAK', playerId: 'bot-2', kind: 'suspect', targetId: 'h1', now: at })
    // Raoul équipier : c'est lui.
    const crew = table({ ...SOLO_SPEC, spy: 'bot-1', speech }).state
    expect(speakMove(espionBotMove(crew, at, zero, deps))).toMatchObject({ playerId: 'bot-3', kind: 'suspect', targetId: 'h1' })
  })

  it('une seule réaction par réponse humaine : le tick suivant pose la question', () => {
    const speech: Entry[] = [recentAccuse, ...qa('bot-2', 'h1', Q1, wrongFor(Q1), 25_000)]
    const { state } = table({ ...SOLO_SPEC, spy: 'bot-3', speech })
    const at = 27_000 + ESPION_HUMAN_ASK_PRIORITY_MS
    const reacted = espionBotMove(state, at, zero, deps)!.reduce(reduceEspion, state)
    const next = at + espionBotTickDelayMs(toEspionSpectatorView(reacted), at, zero)!
    expect(next - at).toBeGreaterThanOrEqual(ESPION_SPEECH_PAUSE_MS - 1)
    const move = espionBotMove(reacted, next, zero, deps)!
    expect(move[0].type).not.toBe('SPEAK')
  })

  it('approbation : une réponse humaine cohérente, approuvée par le plus rapide des bots avec une chance de 0,15 + 0,3 × loyauté — un seul dé par réponse', () => {
    let allies = 0
    for (let k = 0; k < 40; k += 1) {
      const answeredAt = 27_000 + k * 37
      const speech = qa('bot-2', 'h1', Q1, attrs(L)[Q1], answeredAt - 2_000)
      // h1 espion : les quatre bots sont équipiers ; Raoul (bot-3), le plus rapide, juge la réponse juste.
      const { state } = table({ ...SOLO_SPEC, spy: 'h1', speech })
      const at = answeredAt + ESPION_HUMAN_ASK_PRIORITY_MS
      const move = espionBotMove(state, at, zero, deps)!
      const expected = espionHash01(`bot-3~ally~${answeredAt}`) < espionAllyShare(BOT_PERSONAS[2])
      expect(speakMove(move), `${answeredAt}`).toEqual(expected ? { type: 'SPEAK', playerId: 'bot-3', kind: 'ally', targetId: 'h1', now: at } : null)
      if (expected) allies += 1
      // Le même tick rejoué rend le même coup : le dé raté ne se relance pas.
      expect(espionBotMove(state, at, () => 0.999, deps)!.some((a) => a.type === 'SPEAK')).toBe(expected)
    }
    expect(allies).toBeGreaterThan(0)
    expect(allies).toBeLessThan(40)
  })

  it('approbation : une au plus par humain et par manche', () => {
    for (let k = 0; k < 20; k += 1) {
      const answeredAt = 40_000 + k * 37
      const speech: Entry[] = [
        ...qa('bot-1', 'h1', Q2, attrs(L)[Q2], 20_000),
        { playerId: 'bot-4', kind: 'ally', targetId: 'h1', at: 23_000 },
        ...qa('bot-2', 'h1', Q1, attrs(L)[Q1], answeredAt - 2_000),
      ]
      const { state } = table({ ...SOLO_SPEC, spy: 'h1', speech })
      expect(speakMove(espionBotMove(state, answeredAt + ESPION_HUMAN_ASK_PRIORITY_MS, zero, deps))).toBeNull()
    }
  })

  it('suite d’un « je trouve ça louche » : l’accusé se défend, puis un fidèle le couvre ; deux réponses au plus', () => {
    const speech: Entry[] = [
      ...qa('bot-1', 'bot-2', Q1, attrs(L)[Q1], 10_000),
      { playerId: 'bot-4', kind: 'ally', targetId: 'bot-3', at: 13_000 },
      { playerId: 'h1', kind: 'suspect', targetId: 'bot-3', at: 15_000 },
      { playerId: 'bot-3', kind: 'defend', targetId: 'h1', at: 17_000 },
    ]
    const { state } = table({ ...SOLO_SPEC, spy: 'bot-1', speech })
    const at = 17_000 + ESPION_SPEECH_PAUSE_MS
    expect(espionBotMove(state, at, zero, deps)).toEqual([{ type: 'SPEAK', playerId: 'bot-4', kind: 'ally', targetId: 'bot-3', now: at }])
    const covered = espionBotMove(state, at, zero, deps)!.reduce(reduceEspion, state)
    const next = at + espionBotTickDelayMs(toEspionSpectatorView(covered), at, zero)!
    expect(speakMove(espionBotMove(covered, next, zero, deps))).toBeNull()
  })

  it('remarques d’ouverture : en manche 2, « je vous l’avais dit » à l’espion démasqué, puis la question', () => {
    const { state, start } = table({ spy: 'bot-5' })
    const round2: EspionState = {
      ...state,
      round: 2,
      lastReveal: { round: 1, location: 'x', spyId: 'bot-2', outcome: 'spy-caught', winner: 'crew' },
      speech: [{ playerId: 'bot-1', kind: 'accuse', targetId: 'bot-2', round: 1, at: start - 60_000 }],
    }
    const moves: EspionAction[] = []
    let s = round2
    let now = start
    for (let i = 0; i < 3; i += 1) {
      now += espionBotTickDelayMs(toEspionSpectatorView(s), now, zero)!
      const move = espionBotMove(s, now, zero, deps)!
      moves.push(...move)
      s = move.reduce(reduceEspion, s)
    }
    expect(moves[0]).toMatchObject({ type: 'SPEAK', playerId: 'bot-1', kind: 'toldYou', targetId: 'bot-2' })
    expect(moves[1]).toMatchObject({ type: 'ASK' })
  })

  it('silence : aucune parole de bot dans les 10 dernières secondes, même due avant', () => {
    const { state, end } = table({ ...SOLO_SPEC, spy: 'bot-1', speech: [{ playerId: 'h1', kind: 'suspect', targetId: 'bot-2', at: 0 }] })
    const late = { ...state, speech: (state.speech ?? []).map((sp) => ({ ...sp, at: end - 11_000 })) }
    for (let at = end - 10_000; at < end; at += 250) {
      expect(espionBotMove(late, at, zero, deps)?.some((a) => a.type === 'SPEAK') ?? false, `${at}`).toBe(false)
    }
  })

  it('brouillage des rôles : quel que soit l’humain espion, les bots réagissent pareil', () => {
    const speech: Entry[] = [
      { playerId: 'bot-2', kind: 'accuse', targetId: 'h3', at: 22_000 },
      ...qa('bot-1', 'h1', Q1, wrongFor(Q1), 25_000),
      { playerId: 'h2', kind: 'suspect', targetId: 'bot-1', at: 30_000 },
    ]
    const at = (spy: string) => {
      const { state } = table({ humans: ['h1', 'h2', 'h3'], bots: 2, spy, speech })
      return [31_000, 33_000, 36_000, 40_000, 45_000].map((now) => espionBotMove(state, now, createRng(`r-${now}`).next, deps))
    }
    const reference = at('h1')
    expect(reference.some((move) => move?.some((a) => a.type === 'SPEAK'))).toBe(true)
    for (const spy of ['h2', 'h3']) expect(at(spy), spy).toEqual(reference)
  })
})
