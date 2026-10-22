import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  addCrobardSpeech,
  createCrobardState,
  currentCrobardActorId,
  reduceCrobard,
  toCrobardClientView,
  toCrobardSpectatorView,
  CrobardEngineError,
  CROBARD_COUNTDOWN_MS,
  CROBARD_ROUND_SPEECH_MAX,
  CROBARD_SPEECH_CAP,
  type CrobardInitialPlayer,
  type CrobardSpeech,
  type CrobardState,
  type Stroke,
} from './engine'
import { CROBARD_COMMENT_AT_STROKES, crobardBotSay } from './bot-speech'
import { applyCrobardRoomAction, parseCrobardState, type CrobardRoomActionInput } from './server-adapter'

/**
 * Paroles des bots du Crobard : des réactions de spectateurs au dessin, aux
 * bons moments, sobres, et aveugles au mot — la vue spectateur seule,
 * vérifiée de bout en bout par l'adaptateur.
 */

const WORDS = ['Parapluie', 'Horloge', 'Bougie', 'Valise', 'Miroir', 'Cadenas', 'Boussole', 'Ampoule']
const OTHER_WORDS = ['Girafe', 'Volcan', 'Fusée', 'Château', 'Sirène', 'Igloo', 'Tracteur', 'Cactus']
const T0 = 1_000_000

/** Riqui et Lola humains, Josiane (farceuse bavarde), Bernadette (prudente, taiseuse), Paulo converti. */
const PLAYERS: CrobardInitialPlayer[] = [
  { id: 'h1', name: 'Riqui' },
  { id: 'h2', name: 'Lola' },
  { id: 'b1', name: 'Josiane', isBot: true },
  { id: 'b2', name: 'Bernadette', isBot: true },
  { id: 'b3', name: 'Paulo', isBot: true },
]

const STROKE: Stroke = { points: [0.1, 0.1, 0.5, 0.5], color: '#020617', width: 6 }

/** Manche 1 au choix du mot, dessinateur imposé. */
function choosing(drawerId = 'h1', players: CrobardInitialPlayer[] = PLAYERS): CrobardState {
  const raw = createCrobardState(players, WORDS, 'parole', T0 - CROBARD_COUNTDOWN_MS)
  const s = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  return { ...s, drawerId, drawerOrder: [drawerId, ...s.drawerOrder.filter((id) => id !== drawerId)] }
}
function drawing(drawerId = 'h1', strokes = 0): CrobardState {
  let s = reduceCrobard(choosing(drawerId), { type: 'CHOOSE_WORD', playerId: drawerId, index: 0, now: T0 + 1 })
  for (let i = 0; i < strokes; i += 1) s = reduceCrobard(s, { type: 'DRAW_STROKE', playerId: drawerId, stroke: STROKE })
  return s
}

const view = (s: CrobardState) => toCrobardSpectatorView(s)
const yes = () => 0
const never = () => 0.999
const seq = (...values: number[]) => () => values.shift() ?? 0
const sp = (playerId: string, kind: CrobardSpeech['kind'], targetId: string, round = 1): CrobardSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

describe('crobardBotSay — qui réagit à quoi', () => {
  it('début de manche : un bot encourage le dessinateur humain ; un bot dessinateur dit qu’il passe', () => {
    expect(crobardBotSay(view(choosing('h1')), { type: 'roundStart' }, yes)).toEqual({ playerId: 'b1', kind: 'go', targetId: 'h1' })
    expect(crobardBotSay(view(choosing('b2')), { type: 'roundStart' }, yes)).toEqual({ playerId: 'b2', kind: 'skip', targetId: 'h1' })
  })

  it(`commentaire de dessin au ${CROBARD_COMMENT_AT_STROKES.join('e ou au ')}e trait seulement, au ton du caractère, une fois par manche`, () => {
    for (let n = 1; n <= 24; n += 1) {
      const said = crobardBotSay(view(drawing('h1', n)), { type: 'stroke' }, yes)
      expect(said !== null, `trait ${n}`).toBe(CROBARD_COMMENT_AT_STROKES.includes(n))
    }
    // Josiane (farceuse) se dit perdue, Bernadette (prudente) et le converti (suiveur) admirent.
    const at8 = view(drawing('h1', 8))
    expect(crobardBotSay(at8, { type: 'stroke' }, seq(0, 0))?.kind).toBe('puzzled')
    expect(crobardBotSay(at8, { type: 'stroke' }, seq(0.5, 0))).toEqual({ playerId: 'b2', kind: 'admire', targetId: 'h1' })
    expect(crobardBotSay(at8, { type: 'stroke' }, seq(0.9, 0))).toEqual({ playerId: 'b3', kind: 'admire', targetId: 'h1' })
    const commented = { ...drawing('h1', 20), speech: [sp('b3', 'admire', 'h1')] }
    expect(crobardBotSay(view(commented), { type: 'stroke' }, yes)).toBeNull()
  })

  it('« on efface tout ? » s’il y avait au moins trois traits, une fois par manche', () => {
    expect(crobardBotSay(view(drawing('h1')), { type: 'erase', strokesBefore: 2 }, yes)).toBeNull()
    expect(crobardBotSay(view(drawing('h1')), { type: 'erase', strokesBefore: 3 }, yes)?.kind).toBe('erase')
    const erased = { ...drawing('h1'), speech: [sp('b1', 'erase', 'h1')] }
    expect(crobardBotSay(view(erased), { type: 'erase', strokesBefore: 9 }, yes)).toBeNull()
  })

  it('bonne réponse : « déjà ?! » au premier, bravo aux suivants', () => {
    let s = drawing('h1', 5)
    s = reduceCrobard(s, { type: 'GUESS', playerId: 'h2', text: s.word!, now: T0 + 2 })
    expect(crobardBotSay(view(s), { type: 'found', by: 'h2' }, yes)).toEqual({ playerId: 'b1', kind: 'first', targetId: 'h2' })
    const second = { ...s, correctGuessers: ['b9', 'h2'] }
    expect(crobardBotSay(view(second), { type: 'found', by: 'h2' }, yes)?.kind).toBe('found')
  })

  it('bilan : bravo au dessinateur si quelqu’un a trouvé, « c’était ÇA ?! » sinon ; rien pour un bot dessinateur', () => {
    const blank = drawing('h1', 5)
    const ended = (s: CrobardState) => reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    expect(crobardBotSay(view(ended(blank)), { type: 'roundEnd' }, yes)).toEqual({ playerId: 'b1', kind: 'stumped', targetId: 'h1' })
    const found = reduceCrobard(blank, { type: 'GUESS', playerId: 'h2', text: blank.word!, now: T0 + 2 })
    expect(crobardBotSay(view(ended(found)), { type: 'roundEnd' }, yes)?.kind).toBe('bravo')
    const botRound = reduceCrobard(choosing('b2'), { type: 'ADVANCE', claimedKey: phaseKey(choosing('b2')), now: T0 + 20_000 })
    expect(crobardBotSay(view(ended(botRound)), { type: 'roundEnd' }, yes)).toBeNull()
  })

  it('une table sans humain assis se tait ; plafonds du bot et de la table', () => {
    const s = choosing('h1')
    const gone = { ...s, players: s.players.map((p) => (p.isBot ? p : { ...p, leftAt: T0 })) }
    expect(crobardBotSay(view(gone), { type: 'roundStart' }, yes)).toBeNull()
    // Bernadette (bavardage 1) a déjà parlé : le tirage qui la vise passe au suivant.
    const quiet = { ...s, speech: [sp('b2', 'go', 'h1')] }
    expect(crobardBotSay(view(quiet), { type: 'roundStart' }, seq(0.5, 0))).toEqual({ playerId: 'b3', kind: 'go', targetId: 'h1' })
    const full = { ...s, speech: [sp('b1', 'go', 'h1'), sp('b2', 'go', 'h1'), sp('b3', 'go', 'h1'), sp('b1', 'go', 'h1')] }
    expect(full.speech).toHaveLength(CROBARD_ROUND_SPEECH_MAX)
    expect(crobardBotSay(view(full), { type: 'roundStart' }, yes)).toBeNull()
  })
})

describe('addCrobardSpeech — le moteur garde la porte', () => {
  it('écrit à la manche courante, même version ; refuse hors phase, un humain, soi-même, les plafonds', () => {
    const s = choosing('h1')
    const next = addCrobardSpeech(s, { playerId: 'b1', kind: 'go', targetId: 'h1' })
    expect(next.speech).toEqual([sp('b1', 'go', 'h1')])
    expect(next.version).toBe(s.version)
    const refuse = (state: CrobardState, say: Parameters<typeof addCrobardSpeech>[1], code: string) =>
      expect(() => addCrobardSpeech(state, say)).toThrow(new CrobardEngineError(code))
    refuse(s, { playerId: 'b1', kind: 'bravo', targetId: 'h1' }, 'SPEECH_OUT_OF_PHASE')
    refuse(s, { playerId: 'h2', kind: 'go', targetId: 'h1' }, 'INVALID_SPEAKER')
    refuse(s, { playerId: 'b1', kind: 'go', targetId: 'b1' }, 'INVALID_TARGET')
    refuse({ ...s, speech: [sp('b1', 'go', 'h1'), sp('b1', 'go', 'h2')] }, { playerId: 'b1', kind: 'go', targetId: 'h1' }, 'ALREADY_SPOKE')
    const full = [sp('b1', 'go', 'h1'), sp('b2', 'go', 'h1'), sp('b3', 'go', 'h1'), sp('b3', 'go', 'h2')]
    refuse({ ...s, speech: full }, { playerId: 'b1', kind: 'go', targetId: 'h1' }, 'TABLE_TALK_FULL')
  })

  it('« manche suivante » ne garde que la manche qui s’achève ; vues et état ancien', () => {
    let s = addCrobardSpeech(choosing('h1'), { playerId: 'b1', kind: 'go', targetId: 'h1' })
    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    s = { ...s, speech: [sp('b2', 'go', 'h1', 0), ...(s.speech ?? [])] }
    const next = reduceCrobard(s, { type: 'CONTINUE', playerId: 'h1', now: T0 + 200_000 })
    expect(next.speech).toEqual([sp('b1', 'go', 'h1')])
    expect(toCrobardClientView(next, 'h2').speech).toEqual(next.speech)
    const { speech: _drop, ...legacy } = choosing('h1')
    void _drop
    expect(parseCrobardState(JSON.stringify(legacy))?.speech).toEqual([])
  })
})

// ─── De bout en bout : l'adaptateur ──────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
})

type Step = { actor: string; input: CrobardRoomActionInput }

function nextStep(s: CrobardState, rand: () => number): Step | null {
  const humans = s.players.filter((p) => !p.isBot && !p.leftAt)
  const advance: Step = { actor: humans[0].id, input: { type: 'advance', phaseKey: phaseKey(s) } }
  if (s.phase === 'countdown') return advance
  if (s.phase === 'roundEnd') {
    const actor = s.players.find((p) => p.id === currentCrobardActorId(s))!
    return { actor: actor.id, input: { type: actor.isBot ? 'bot' : 'continue' } }
  }
  const drawer = s.players.find((p) => p.id === s.drawerId)!
  if (s.phase === 'choosing') {
    return drawer.isBot ? advance : { actor: drawer.id, input: { type: 'choose-word', index: Math.floor(rand() * 3) } }
  }
  if (s.phase !== 'drawing') return null
  const roll = rand()
  if (drawer.isBot || roll < 0.03) return advance
  if (roll < 0.75) return { actor: drawer.id, input: { type: 'draw-stroke', stroke: STROKE } }
  if (roll < 0.78) return { actor: drawer.id, input: { type: 'clear' } }
  const guesser = humans.find((p) => p.id !== drawer.id && !s.correctGuessers.includes(p.id))
  return guesser ? { actor: guesser.id, input: { type: 'guess', text: s.word ?? '' } } : advance
}

function play(seed: string, players: CrobardInitialPlayer[], sayRand: () => number, words: string[] = WORDS) {
  vi.setSystemTime(T0)
  let s = createCrobardState(players, words, seed, T0, 6)
  const rand = createRng(`${seed}-coups`).next
  const states: CrobardState[] = []
  for (let i = 0; i < 3_000 && s.phase !== 'finished'; i += 1) {
    const step = nextStep(s, rand)
    if (!step) break
    if (step.input.type === 'advance') vi.setSystemTime(s.phaseEndsAt ?? Date.now())
    else vi.advanceTimersByTime(300)
    const res = applyCrobardRoomAction(s, step.actor, step.input, sayRand)
    if (!res.ok) throw new Error(`${step.input.type} : ${res.error}`)
    states.push(s)
    s = res.state
  }
  return { final: s, states }
}

const TABLES: CrobardInitialPlayer[][] = [
  PLAYERS,
  [{ id: 'h1', name: 'Riqui' }, { id: 'b1', name: 'Kéké', isBot: true }, { id: 'b2', name: 'Gaston', isBot: true }],
  [
    { id: 'b1', name: 'Mauricette', isBot: true },
    ...PLAYERS.filter((p) => !p.isBot),
    ...['Raoul', 'Suzette', 'Norbert', 'Ginette', 'Marcel'].map((name, i) => ({ id: `b${i + 2}`, name, isBot: true })),
  ],
]
const spokeAtAll = (states: CrobardState[]) => states.some((st) => (st.speech ?? []).length > 0)

describe('applyCrobardRoomAction — paroles dans la même réduction', () => {
  it('le trait qui atteint le seuil porte le commentaire, sans version de plus', () => {
    const s = drawing('h1', 7)
    const silent = applyCrobardRoomAction(s, 'h1', { type: 'draw-stroke', stroke: STROKE }, never)
    const talked = applyCrobardRoomAction(s, 'h1', { type: 'draw-stroke', stroke: STROKE }, yes)
    if (!silent.ok || !talked.ok) throw new Error('refusé')
    expect(talked.state.speech).toEqual([sp('b1', 'puzzled', 'h1')])
    expect({ ...talked.state, speech: [] }).toEqual({ ...silent.state, speech: [] })
  })

  it('une réponse fausse reste un refus sans parole', () => {
    expect(applyCrobardRoomAction(drawing('h1', 3), 'h2', { type: 'guess', text: 'zzz' }, yes)).toEqual({
      ok: false,
      error: 'GUESS_WRONG',
    })
  })

  it('les paroles ne pèsent pas sur le jeu : la même partie, avec ou sans elles', () => {
    for (const [i, players] of TABLES.entries()) {
      const talk = play(`egal-${i}`, players, createRng(`dire-${i}`).next)
      const mute = play(`egal-${i}`, players, never)
      expect(talk.final.phase).toBe('finished')
      expect(spokeAtAll(talk.states)).toBe(true)
      expect(spokeAtAll(mute.states)).toBe(false)
      expect({ ...talk.final, speech: [] }).toEqual({ ...mute.final, speech: [] })
    }
  })

  it(`sobriété : min(${CROBARD_SPEECH_CAP}, bavardage) bulles par bot, ${CROBARD_ROUND_SPEECH_MAX} par manche, jamais un humain`, () => {
    for (let g = 0; g < 12; g += 1) {
      const players = TABLES[g % TABLES.length]
      const { final, states } = play(`sobre-${g}`, players, createRng(`sobre-dire-${g}`).next)
      expect(spokeAtAll(states)).toBe(true)
      for (const st of [...states, final]) {
        for (const round of new Set((st.speech ?? []).map((x) => x.round))) {
          const said = (st.speech ?? []).filter((x) => x.round === round)
          expect(said.length, `manche ${round}`).toBeLessThanOrEqual(CROBARD_ROUND_SPEECH_MAX)
          for (const p of players) {
            const cap = p.isBot ? Math.min(CROBARD_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0
            expect(said.filter((x) => x.playerId === p.id).length, `${p.name} manche ${round}`).toBeLessThanOrEqual(cap)
          }
        }
      }
    }
  })

  it('aveugle au mot : d’autres mots, la même suite de paroles, coup pour coup', () => {
    for (let g = 0; g < 4; g += 1) {
      const players = TABLES[g % TABLES.length]
      const a = play(`aveugle-${g}`, players, createRng(`aveugle-dire-${g}`).next, WORDS)
      const b = play(`aveugle-${g}`, players, createRng(`aveugle-dire-${g}`).next, OTHER_WORDS)
      expect(b.states.map((st) => st.speech)).toEqual(a.states.map((st) => st.speech))
      expect(b.final.speech).toEqual(a.final.speech)
    }
  })
})
