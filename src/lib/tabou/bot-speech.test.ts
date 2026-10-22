import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  addTabouSpeech,
  createTabouState,
  currentTabouActorId,
  reduceTabou,
  toTabouClientView,
  toTabouSpectatorView,
  TabouEngineError,
  TABOU_COUNTDOWN_MS,
  TABOU_ROUND_SPEECH_MAX,
  TABOU_SPEECH_CAP,
  type TabouEntry,
  type TabouInitialPlayer,
  type TabouSpeech,
  type TabouState,
} from './engine'
import { TABOU_CONSOLE_AT, TABOU_PROUD_AT, tabouBotSay, type TabouSpeechEvent } from './bot-speech'
import { applyTabouRoomAction, parseTabouState, serializeTabouState, type TabouRoomActionInput } from './server-adapter'

/**
 * Paroles des bots du Tabou : des réactions à ce que toute la table voit,
 * aux bons orateurs (coéquipier ou adversaire du décrivant), sobres, et
 * aveugles au mot en cours — la vue spectateur seule, vérifiée de bout en
 * bout par l'adaptateur.
 */

const WORDS: TabouEntry[] = [
  { word: 'Pizza', taboo: ['Italie', 'fromage', 'four', 'tranche'], diff: 1 },
  { word: 'Chat', taboo: ['miauler', 'griffe', 'félin', 'ronronner'], diff: 1 },
  { word: 'Plage', taboo: ['sable', 'mer', 'soleil', 'serviette'], diff: 1 },
  { word: 'Vélo', taboo: ['roue', 'pédale', 'guidon', 'chaîne'], diff: 2 },
  { word: 'Noël', taboo: ['sapin', 'cadeau', 'décembre', 'neige'], diff: 3 },
]
const OTHER_WORDS: TabouEntry[] = [
  { word: 'Volcan', taboo: ['lave', 'cratère', 'éruption', 'montagne'], diff: 3 },
  { word: 'Piano', taboo: ['touche', 'musique', 'clavier', 'noir'], diff: 2 },
  { word: 'Lune', taboo: ['nuit', 'ciel', 'croissant', 'astronaute'], diff: 1 },
  { word: 'Café', taboo: ['tasse', 'matin', 'noir', 'expresso'], diff: 1 },
  { word: 'Ski', taboo: ['neige', 'piste', 'montagne', 'hiver'], diff: 2 },
]
const T0 = 1_000_000

/** h1, h2 (A) et h3, h4 (B) humains ; Paulo, déserteur converti (A) ; Josiane, persona bavarde (B). */
const PLAYERS: TabouInitialPlayer[] = [
  { id: 'h1', name: 'Riqui', team: 'A' },
  { id: 'h3', name: 'Lola', team: 'B' },
  { id: 'h2', name: 'Momo', team: 'A' },
  { id: 'h4', name: 'Zaza', team: 'B' },
  { id: 'b1', name: 'Paulo', team: 'A', isBot: true },
  { id: 'b2', name: 'Josiane', team: 'B', isBot: true },
]

/** La manche 1 en cours, h1 décrit (équipe A). */
function describing(players: TabouInitialPlayer[] = PLAYERS, words: TabouEntry[] = WORDS): TabouState {
  const raw = createTabouState(players, words, 'parole', T0 - TABOU_COUNTDOWN_MS)
  return reduceTabou(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

const view = (s: TabouState) => toTabouSpectatorView(s)
/** Toujours le premier orateur, et un dé qui passe. */
const yes = () => 0
const never = () => 0.999
/** Une suite de tirages fixée (puis 0). */
const seq = (...values: number[]) => () => values.shift() ?? 0
const sp = (playerId: string, kind: TabouSpeech['kind'], targetId: string, round = 1): TabouSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

describe('tabouBotSay — qui réagit à quoi', () => {
  it('début de manche : le coéquipier encourage le décrivant, l’adversaire le chambre', () => {
    const s = describing()
    expect(s.describerId).toBe('h1')
    const mate = tabouBotSay(view(s), { type: 'roundStart' }, yes)
    expect(mate).toEqual({ playerId: 'b1', kind: 'go', targetId: 'h1' })
    // 0,9 → le 2e des deux bots (Josiane, équipe B).
    expect(tabouBotSay(view(s), { type: 'roundStart' }, seq(0.9, 0))).toEqual({ playerId: 'b2', kind: 'jinx', targetId: 'h1' })
  })

  it('mot trouvé : bravo au trouveur, « on passe devant » quand le point fait basculer, grogne adverse', () => {
    const s = describing()
    const found = reduceTabou(s, { type: 'FOUND', playerId: 'h2', now: T0 + 1 })
    const event: TabouSpeechEvent = { type: 'found', by: 'h2', scoresBefore: s.scores }
    expect(tabouBotSay(view(found), event, yes)).toEqual({ playerId: 'b1', kind: 'lead', targetId: 'h2' })
    const tied = { ...found, scores: { A: 3, B: 2 } }
    const after = { ...event, scoresBefore: { A: 2, B: 2 } }
    expect(tabouBotSay(view(tied), after, yes)?.kind).toBe('lead')
    const already = { ...event, scoresBefore: { A: 3, B: 2 } }
    expect(tabouBotSay(view({ ...found, scores: { A: 4, B: 2 } }), already, yes)).toEqual({
      playerId: 'b1',
      kind: 'found',
      targetId: 'h2',
    })
    // Le tirage tombe sur Josiane (adverse) : elle râle contre le décrivant.
    expect(tabouBotSay(view({ ...found, scores: { A: 4, B: 2 } }), already, seq(0.9, 0))).toEqual({
      playerId: 'b2',
      kind: 'grumble',
      targetId: 'h1',
    })
  })

  it('tabou buzzé : l’équipe qui buzze chambre le décrivant, le coéquipier du décrivant conteste', () => {
    const s = reduceTabou(describing(), { type: 'TABOO_CALLED', playerId: 'h3', now: T0 + 1 })
    const event: TabouSpeechEvent = { type: 'taboo', by: 'h3' }
    expect(tabouBotSay(view(s), event, yes)).toEqual({ playerId: 'b2', kind: 'buzz', targetId: 'h1' })
    expect(tabouBotSay(view(s), event, seq(0.9, 0))).toEqual({
      playerId: 'b1',
      kind: 'protest',
      targetId: 'h3',
    })
  })

  it('mot passé : seul un adversaire chambre', () => {
    const s = reduceTabou(describing(), { type: 'PASS', playerId: 'h1', now: T0 + 1 })
    expect(tabouBotSay(view(s), { type: 'pass' }, yes)).toEqual({ playerId: 'b2', kind: 'tease', targetId: 'h1' })
    const noRival = describing(PLAYERS.filter((p) => p.id !== 'b2'))
    expect(tabouBotSay(view(noRival), { type: 'pass' }, yes)).toBeNull()
  })

  it(`bilan : « belle manche » dès ${TABOU_PROUD_AT} mots, « on se rattrape » jusqu’à ${TABOU_CONSOLE_AT}, rien entre les deux`, () => {
    const s = describing()
    const ended = (found: number) =>
      view({ ...reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! }), roundStats: { found, passed: 0, taboo: 0 } })
    expect(tabouBotSay(ended(TABOU_PROUD_AT), { type: 'roundEnd' }, yes)).toEqual({ playerId: 'b1', kind: 'proud', targetId: 'h1' })
    expect(tabouBotSay(ended(TABOU_CONSOLE_AT), { type: 'roundEnd' }, yes)?.kind).toBe('console')
    expect(tabouBotSay(ended(TABOU_CONSOLE_AT + 1), { type: 'roundEnd' }, yes)).toBeNull()
  })

  it('un bot décrivant dit seulement qu’il passe, à un humain de son équipe ; le reste de sa manche se tait', () => {
    const s = { ...describing(), describerId: 'b1' }
    expect(tabouBotSay(view(s), { type: 'roundStart' }, yes)).toEqual({ playerId: 'b1', kind: 'skip', targetId: 'h1' })
    expect(tabouBotSay(view(s), { type: 'pass' }, yes)).toBeNull()
    expect(tabouBotSay(view(s), { type: 'taboo', by: 'h3' }, yes)).toBeNull()
  })

  it('une table sans humain assis se tait', () => {
    const s = describing()
    const gone = { ...s, players: s.players.map((p) => (p.isBot ? p : { ...p, leftAt: T0 })) }
    expect(tabouBotSay(view(gone), { type: 'roundStart' }, yes)).toBeNull()
  })

  it(`plafonds : min(${TABOU_SPEECH_CAP}, bavardage) par bot et ${TABOU_ROUND_SPEECH_MAX} par manche pour la table`, () => {
    const s = describing()
    const spoken = { ...s, speech: [sp('b1', 'go', 'h1'), sp('b1', 'found', 'h2')] }
    // Paulo (converti, bavardage 2) a tout dit : seule Josiane peut encore parler.
    expect(tabouBotSay(view(spoken), { type: 'roundStart' }, yes)?.playerId).toBe('b2')
    const full = { ...s, speech: [sp('b1', 'go', 'h1'), sp('b2', 'jinx', 'h1'), sp('b2', 'grumble', 'h1'), sp('b1', 'found', 'h2')] }
    expect(full.speech).toHaveLength(TABOU_ROUND_SPEECH_MAX)
    expect(tabouBotSay(view(full), { type: 'roundStart' }, yes)).toBeNull()
    // Les paroles de la manche passée ne comptent pas.
    const old = { ...s, round: 2, speech: full.speech }
    expect(tabouBotSay(view(old), { type: 'roundStart' }, yes)).not.toBeNull()
  })
})

describe('addTabouSpeech — le moteur garde la porte', () => {
  it('écrit la parole à la manche courante, sans changer de version', () => {
    const s = describing()
    const next = addTabouSpeech(s, { playerId: 'b1', kind: 'go', targetId: 'h1' })
    expect(next.speech).toEqual([sp('b1', 'go', 'h1')])
    expect(next.version).toBe(s.version)
    expect({ ...next, speech: undefined }).toEqual({ ...s, speech: undefined })
  })

  it('refuse un kind hors de sa phase, un humain, un bot parti, une cible absente ou soi-même, les plafonds', () => {
    const s = describing()
    const refuse = (state: TabouState, say: Parameters<typeof addTabouSpeech>[1], code: string) =>
      expect(() => addTabouSpeech(state, say)).toThrow(new TabouEngineError(code))
    refuse(s, { playerId: 'b1', kind: 'proud', targetId: 'h1' }, 'SPEECH_OUT_OF_PHASE')
    refuse(s, { playerId: 'b1', kind: 'bavard' as never, targetId: 'h1' }, 'INVALID_KIND')
    refuse(s, { playerId: 'h2', kind: 'go', targetId: 'h1' }, 'INVALID_SPEAKER')
    refuse({ ...s, players: s.players.map((p) => (p.id === 'b1' ? { ...p, leftAt: T0 } : p)) }, { playerId: 'b1', kind: 'go', targetId: 'h1' }, 'INVALID_SPEAKER')
    refuse(s, { playerId: 'b1', kind: 'go', targetId: 'b1' }, 'INVALID_TARGET')
    refuse(s, { playerId: 'b1', kind: 'go', targetId: 'nobody' }, 'INVALID_TARGET')
    refuse({ ...s, speech: [sp('b1', 'go', 'h1'), sp('b1', 'found', 'h2')] }, { playerId: 'b1', kind: 'lead', targetId: 'h2' }, 'ALREADY_SPOKE')
    const full = [sp('b1', 'go', 'h1'), sp('b2', 'jinx', 'h1'), sp('b2', 'grumble', 'h1'), sp('b1', 'found', 'h2')]
    refuse({ ...s, speech: full }, { playerId: 'b2', kind: 'tease', targetId: 'h1' }, 'TABLE_TALK_FULL')
  })

  it('« manche suivante » ne garde que la manche qui s’achève ; la vue de chacun porte le fil', () => {
    let s = addTabouSpeech(describing(), { playerId: 'b1', kind: 'go', targetId: 'h1' })
    s = reduceTabou(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! })
    s = { ...s, speech: [sp('b2', 'jinx', 'h1', 0), ...(s.speech ?? [])] }
    const next = reduceTabou(s, { type: 'CONTINUE', playerId: 'h1', now: T0 + 70_000 })
    expect(next.speech).toEqual([sp('b1', 'go', 'h1')])
    expect(toTabouClientView(next, 'h2').speech).toEqual(next.speech)
    expect(toTabouSpectatorView(next).speech).toEqual(next.speech)
  })

  it('un état sérialisé avant les paroles se relit et se joue', () => {
    const { speech: _drop, ...legacy } = describing()
    void _drop
    const parsed = parseTabouState(JSON.stringify(legacy))!
    expect(parsed.speech).toEqual([])
    expect(reduceTabou(legacy as TabouState, { type: 'FOUND', playerId: 'h2', now: T0 + 1 }).scores.A).toBe(1)
    expect(addTabouSpeech(legacy as TabouState, { playerId: 'b1', kind: 'go', targetId: 'h1' }).speech).toHaveLength(1)
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

type Step = { actor: string; input: TabouRoomActionInput }

/** Le prochain coup d'une partie jouée au hasard (flux `rand` propre aux coups). */
function nextStep(s: TabouState, rand: () => number): Step | null {
  const pickOf = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]
  const humans = s.players.filter((p) => !p.isBot && !p.leftAt)
  if (s.phase === 'countdown') return { actor: humans[0].id, input: { type: 'advance', phaseKey: phaseKey(s) } }
  if (s.phase === 'roundEnd') {
    const actor = s.players.find((p) => p.id === currentTabouActorId(s))!
    return actor.isBot ? { actor: actor.id, input: { type: 'bot' } } : { actor: actor.id, input: { type: 'continue' } }
  }
  if (s.phase !== 'describing') return null
  const describer = s.players.find((p) => p.id === s.describerId)!
  const mates = humans.filter((p) => p.team === describer.team && p.id !== describer.id)
  const rivals = humans.filter((p) => p.team !== describer.team)
  const roll = rand()
  if (describer.isBot || roll < 0.12) return { actor: humans[0].id, input: { type: 'advance', phaseKey: phaseKey(s) } }
  if (roll < 0.6 && mates.length > 0) return { actor: pickOf(mates).id, input: { type: 'found' } }
  if (roll < 0.8) return { actor: describer.id, input: { type: 'pass' } }
  return { actor: pickOf(rivals).id, input: { type: 'taboo-called' } }
}

/** Joue une partie complète ; l'horloge suit les échéances. */
function play(seed: string, players: TabouInitialPlayer[], sayRand: () => number, words: TabouEntry[] = WORDS) {
  vi.setSystemTime(T0)
  let s = createTabouState(players, words, seed, T0, 15)
  const rand = createRng(`${seed}-coups`).next
  const states: TabouState[] = []
  for (let i = 0; i < 2_000 && s.phase !== 'finished'; i += 1) {
    const step = nextStep(s, rand)
    if (!step) break
    if (step.input.type === 'advance') vi.setSystemTime(s.phaseEndsAt ?? Date.now())
    else vi.advanceTimersByTime(700)
    const res = applyTabouRoomAction(s, step.actor, step.input, sayRand)
    if (!res.ok) throw new Error(`${step.input.type} : ${res.error}`)
    states.push(s)
    s = res.state
  }
  return { final: s, states }
}

const TABLES: TabouInitialPlayer[][] = [
  PLAYERS,
  // Le bot assis en tête mène les bilans : « manche suivante » vient de lui.
  [PLAYERS[4], ...PLAYERS.filter((p) => p.id !== 'b1' && p.id !== 'b2')],
  [...PLAYERS, { id: 'b3', name: 'Gaston', team: 'A', isBot: true }, { id: 'b4', name: 'Kéké', team: 'B', isBot: true }],
]
const spokeAtAll = (states: TabouState[]) => states.some((st) => (st.speech ?? []).length > 0)

describe('applyTabouRoomAction — paroles dans la même réduction', () => {
  it('un mot trouvé porte la réaction du coéquipier bot, sans version de plus', () => {
    const s = describing()
    const silent = applyTabouRoomAction(s, 'h2', { type: 'found' }, never)
    const talked = applyTabouRoomAction(s, 'h2', { type: 'found' }, yes)
    if (!silent.ok || !talked.ok) throw new Error('refusé')
    expect(talked.state.speech).toEqual([sp('b1', 'lead', 'h2')])
    expect(talked.state.version).toBe(silent.state.version)
    expect({ ...talked.state, speech: [] }).toEqual({ ...silent.state, speech: [] })
  })

  it('le lancement et « manche suivante » ouvrent la manche avec une réaction ; un bot qui relance aussi', () => {
    const raw = createTabouState(PLAYERS, WORDS, 'parole', T0 - TABOU_COUNTDOWN_MS)
    const started = applyTabouRoomAction(raw, 'h1', { type: 'advance', phaseKey: phaseKey(raw) }, yes)
    if (!started.ok) throw new Error(started.error)
    expect(started.state.speech).toEqual([sp('b1', 'go', 'h1')])
  })

  it('les paroles ne pèsent pas sur le jeu : la même partie, avec ou sans elles, à la parole près', () => {
    for (const [i, players] of TABLES.entries()) {
      const talk = play(`egal-${i}`, players, createRng(`dire-${i}`).next)
      const mute = play(`egal-${i}`, players, never)
      expect(talk.final.phase).toBe('finished')
      expect(spokeAtAll(talk.states)).toBe(true)
      expect(spokeAtAll(mute.states)).toBe(false)
      expect({ ...talk.final, speech: [] }).toEqual({ ...mute.final, speech: [] })
    }
  })

  it(`sobriété : jamais plus de min(${TABOU_SPEECH_CAP}, bavardage) bulles par bot ni ${TABOU_ROUND_SPEECH_MAX} par manche, jamais un humain`, () => {
    for (let g = 0; g < 12; g += 1) {
      const players = TABLES[g % TABLES.length]
      const { final, states } = play(`sobre-${g}`, players, createRng(`sobre-dire-${g}`).next)
      expect(spokeAtAll(states)).toBe(true)
      for (const st of [...states, final]) {
        for (const round of new Set((st.speech ?? []).map((x) => x.round))) {
          const said = (st.speech ?? []).filter((x) => x.round === round)
          expect(said.length, `manche ${round}`).toBeLessThanOrEqual(TABOU_ROUND_SPEECH_MAX)
          for (const p of players) {
            const mine = said.filter((x) => x.playerId === p.id).length
            const cap = p.isBot ? Math.min(TABOU_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0
            expect(mine, `${p.name} manche ${round}`).toBeLessThanOrEqual(cap)
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
      const serialized = JSON.stringify(a.final.speech)
      for (const entry of WORDS) expect(serialized).not.toContain(entry.word)
    }
  })

  it('l’état sérialisé garde le fil', () => {
    const s = applyTabouRoomAction(describing(), 'h2', { type: 'found' }, yes)
    if (!s.ok) throw new Error(s.error)
    expect(parseTabouState(serializeTabouState(s.state))?.speech).toEqual(s.state.speech)
  })
})
