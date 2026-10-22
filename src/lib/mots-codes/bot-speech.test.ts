import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { botTraitsFor } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  addMCSpeech,
  createMCState,
  mcRemainingFor,
  mcSpymasterOf,
  reduceMC,
  toMCClientView,
  toMCSpectatorView,
  MCEngineError,
  MC_COUNTDOWN_MS,
  MC_SPEECH_CAP,
  MC_TURN_SPEECH_MAX,
  type MCInitialPlayer,
  type MCSpeech,
  type MCState,
  type MCTeam,
  type MCTileKind,
} from './engine'
import { mcBotSay, type MCSpeechEvent } from './bot-speech'
import { applyMCRoomAction, mcSpeechEvent, parseMCState, withMCSpeech, type MCRoomActionInput } from './server-adapter'

/**
 * Paroles des bots des Mots Codés : des réactions aux tuiles retournées et à
 * la main passée, aux bons orateurs, sobres, et aveugles à la grille de clés
 * — un maître-mot bot ne parle jamais, et changer la couleur cachée des
 * autres tuiles ne change pas une bulle.
 */

const T0 = 1_000_000
const WORDS = Array.from({ length: 40 }, (_, i) => `mot${i}`)

/** Or : Gaëlle (maître-mot), Gus, Paulo (converti) ; Rouge : Rémi (maître-mot), Rose, Josiane (bot). */
const PLAYERS: MCInitialPlayer[] = [
  { id: 'g1', name: 'Gaëlle', team: 'gold' },
  { id: 'g2', name: 'Gus', team: 'gold' },
  { id: 'gb', name: 'Paulo', team: 'gold', isBot: true },
  { id: 'r1', name: 'Rémi', team: 'red' },
  { id: 'r2', name: 'Rose', team: 'red' },
  { id: 'rb', name: 'Josiane', team: 'red', isBot: true },
]

/** Or commence (9 mots contre 8), indice donné : Gus devine. */
function guessing(players: MCInitialPlayer[] = PLAYERS): MCState {
  const raw = createMCState(players, WORDS, 'parole', T0 - MC_COUNTDOWN_MS)
  const swap = (k: MCTileKind): MCTileKind => (k === 'gold' ? 'red' : k === 'red' ? 'gold' : k)
  const kinds = raw.startingTeam === 'gold' ? raw.kinds : raw.kinds.map(swap)
  const s = reduceMC({ ...raw, kinds, startingTeam: 'gold' }, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  return reduceMC(s, { type: 'GIVE_CLUE', playerId: mcSpymasterOf(s, 'gold')!.id, word: 'indice', count: 3, now: T0 + 1 })
}
const tileOf = (s: MCState, kind: MCTileKind) => s.kinds.findIndex((k, i) => k === kind && !s.revealed[i])
type GuessEvent = Extract<MCSpeechEvent, { type: 'guess' }>
/** Le coup de `by` sur `tile`, et le fait que l'adaptateur en tire. */
function guessed(s: MCState, tile: number, by = 'g2'): { after: MCState; event: GuessEvent } {
  const after = reduceMC(s, { type: 'GUESS', playerId: by, tile, now: T0 + 2 })
  return { after, event: mcSpeechEvent(s, by, { type: 'guess', tile }) as GuessEvent }
}

const view = (s: MCState) => toMCSpectatorView(s)
const yes = () => 0
const never = () => 0.999
const seq = (...values: number[]) => () => values.shift() ?? 0
const sp = (playerId: string, kind: MCSpeech['kind'], targetId: string, round = 1): MCSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

describe('mcBotSay — qui réagit à quelle tuile', () => {
  it('une tuile de son équipe : bien vu du coéquipier ; « on passe devant » quand le compte bascule', () => {
    const s = guessing()
    // Or commence à 9 contre 8 : sa première tuile égalise (8 partout), pas de bascule.
    const { after, event } = guessed(s, tileOf(s, 'gold'))
    expect(event).toEqual({ type: 'guess', by: 'g2', tile: tileOf(s, 'gold'), remainingBefore: { gold: 9, red: 8 } })
    expect(mcBotSay(view(after), event, yes)).toEqual({ playerId: 'gb', kind: 'nice', targetId: 'g2' })
    // Une tuile d'or de moins encore cachée : 7 contre 8, Or passe devant.
    const gold = tileOf(after, 'gold')
    const ahead = { ...after, kinds: after.kinds.map((k, i): MCTileKind => (i === gold ? 'neutral' : k)) }
    expect(mcRemainingFor(ahead, 'gold')).toBeLessThan(mcRemainingFor(ahead, 'red'))
    expect(mcBotSay(view(ahead), event, yes)).toEqual({ playerId: 'gb', kind: 'lead', targetId: 'g2' })
    // Déjà devant avant le coup : pas de bascule, un simple « bien vu ».
    expect(mcBotSay(view(ahead), { ...event, remainingBefore: { gold: 8, red: 9 } }, yes)?.kind).toBe('nice')
  })

  it('neutre : le coéquipier console ; adverse : le coéquipier grimace, l’adversaire remercie', () => {
    const s = guessing()
    const neutral = guessed(s, tileOf(s, 'neutral'))
    expect(mcBotSay(view(neutral.after), neutral.event, yes)).toEqual({ playerId: 'gb', kind: 'miss', targetId: 'g2' })
    const gift = guessed(s, tileOf(s, 'red'))
    expect(mcBotSay(view(gift.after), gift.event, yes)).toEqual({ playerId: 'gb', kind: 'oops', targetId: 'g2' })
    expect(mcBotSay(view(gift.after), gift.event, seq(0.9, 0))).toEqual({ playerId: 'rb', kind: 'thanks', targetId: 'g2' })
  })

  it('assassin : « c’était l’assassin » chez soi, « merci » en face ; dernier mot : victoire ou cadeau', () => {
    const s = guessing()
    const boom = guessed(s, tileOf(s, 'assassin'))
    expect(boom.after.phase).toBe('finished')
    expect(mcBotSay(view(boom.after), boom.event, yes)).toEqual({ playerId: 'gb', kind: 'assassin', targetId: 'g2' })
    expect(mcBotSay(view(boom.after), boom.event, seq(0.9, 0))?.kind).toBe('saved')
    const lastGold = { ...s, revealed: s.kinds.map((k, i) => k === 'gold' && i !== tileOf(s, 'gold')) }
    const win = guessed(lastGold, tileOf(lastGold, 'gold'))
    expect(win.after.winnerTeam).toBe('gold')
    expect(mcBotSay(view(win.after), win.event, yes)).toEqual({ playerId: 'gb', kind: 'win', targetId: 'g2' })
    const lastRed = { ...s, revealed: s.kinds.map((k, i) => k === 'red' && i !== tileOf(s, 'red')) }
    const gift = guessed(lastRed, tileOf(lastRed, 'red'))
    expect(gift.after.winnerTeam).toBe('red')
    expect(mcBotSay(view(gift.after), gift.event, yes)).toEqual({ playerId: 'rb', kind: 'thanks', targetId: 'g2' })
  })

  it('main passée : seul un adversaire chambre', () => {
    const s = guessing()
    const after = reduceMC(s, { type: 'PASS', playerId: 'g2', now: T0 + 2 })
    expect(mcBotSay(view(after), { type: 'pass', by: 'g2' }, yes)).toEqual({ playerId: 'rb', kind: 'tease', targetId: 'g2' })
  })

  it('un maître-mot bot ne parle jamais, même de la tuile de son équipe', () => {
    const s = guessing()
    const keyHolder = { ...s, players: s.players.map((p) => (p.id === 'gb' ? { ...p, isSpymaster: true } : p)) }
    const { after, event } = guessed(keyHolder, tileOf(keyHolder, 'gold'))
    expect(mcBotSay(view(after), event, yes)).toBeNull()
    expect(() => addMCSpeech(after, { playerId: 'gb', kind: 'nice', targetId: 'g2' })).toThrow(new MCEngineError('INVALID_SPEAKER'))
  })

  it('les coups des bots n’appellent aucune réaction ; une table sans humain se tait', () => {
    const s = guessing()
    expect(mcSpeechEvent(s, 'gb', { type: 'pass' })).toBeNull()
    expect(mcSpeechEvent(s, 'g2', { type: 'advance', phaseKey: phaseKey(s) })).toBeNull()
    const gone = { ...s, players: s.players.map((p) => (p.isBot || p.id === 'g2' ? p : { ...p, leftAt: T0 })) }
    const { after, event } = guessed(gone, tileOf(gone, 'gold'))
    expect(mcBotSay(view({ ...after, players: after.players.map((p) => (p.isBot ? p : { ...p, leftAt: T0 })) }), event, yes)).toBeNull()
  })

  it('aveugle à la grille de clés : d’autres couleurs cachées, la même bulle', () => {
    for (let g = 0; g < 40; g += 1) {
      const s = guessing()
      const rand = createRng(`cles-${g}`).next
      const hidden = s.kinds.map((_, i) => i).filter((i) => !s.revealed[i])
      const tile = hidden[Math.floor(rand() * hidden.length)]
      // Les autres tuiles cachées échangent leurs couleurs (mêmes comptes).
      const others = hidden.filter((i) => i !== tile)
      const shuffled = createRng(`melange-${g}`).shuffle(others.map((i) => s.kinds[i]))
      const kinds = [...s.kinds]
      others.forEach((i, k) => {
        kinds[i] = shuffled[k]
      })
      const a = guessed(s, tile)
      const b = guessed({ ...s, kinds }, tile)
      const draws = Array.from({ length: 8 }, () => rand())
      const sayA = mcBotSay(view(a.after), a.event, seq(...draws))
      const sayB = mcBotSay(view(b.after), b.event, seq(...draws))
      expect(sayB, `partie ${g}`).toEqual(sayA)
    }
  })
})

describe('addMCSpeech — le moteur garde la porte', () => {
  it('écrit au tour courant, même version ; refuse hors phase, un humain, soi-même, les plafonds', () => {
    const s = guessing()
    const next = addMCSpeech(s, { playerId: 'gb', kind: 'nice', targetId: 'g2' })
    expect(next.speech).toEqual([sp('gb', 'nice', 'g2', s.turn)])
    expect(next.version).toBe(s.version)
    const refuse = (state: MCState, say: Parameters<typeof addMCSpeech>[1], code: string) =>
      expect(() => addMCSpeech(state, say)).toThrow(new MCEngineError(code))
    refuse(s, { playerId: 'gb', kind: 'win', targetId: 'g2' }, 'SPEECH_OUT_OF_PHASE')
    refuse(s, { playerId: 'g1', kind: 'nice', targetId: 'g2' }, 'INVALID_SPEAKER')
    refuse(s, { playerId: 'gb', kind: 'nice', targetId: 'gb' }, 'INVALID_TARGET')
    const turn = s.turn ?? 0
    refuse({ ...s, speech: [sp('gb', 'nice', 'g2', turn), sp('gb', 'lead', 'g2', turn)] }, { playerId: 'gb', kind: 'nice', targetId: 'g2' }, 'ALREADY_SPOKE')
    const full = [sp('gb', 'nice', 'g2', turn), sp('rb', 'nice', 'g2', turn), sp('rb', 'nice', 'r2', turn)]
    refuse({ ...s, speech: full }, { playerId: 'gb', kind: 'nice', targetId: 'g2' }, 'TABLE_TALK_FULL')
  })

  it('chaque tour d’équipe a son numéro ; le fil ne garde que le tour qui s’achève ; état ancien relu', () => {
    const s = addMCSpeech(guessing(), { playerId: 'gb', kind: 'nice', targetId: 'g2' })
    const turn = s.turn ?? 0
    expect(turn).toBe(1)
    const passed = reduceMC({ ...s, speech: [sp('rb', 'tease', 'g2', 0), ...(s.speech ?? [])] }, { type: 'PASS', playerId: 'g2', now: T0 + 3 })
    expect(passed.turn).toBe(2)
    expect(passed.speech).toEqual([sp('gb', 'nice', 'g2', 1)])
    expect(toMCClientView(passed, 'r2').speech).toEqual(passed.speech)
    const { speech: _s, turn: _t, ...legacy } = guessing()
    void _s
    void _t
    const parsed = parseMCState(JSON.stringify(legacy))!
    expect(parsed.speech).toEqual([])
    expect(reduceMC(legacy as MCState, { type: 'PASS', playerId: 'g2', now: T0 + 3 }).turn).toBe(1)
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

type Step = { actor: string; input: MCRoomActionInput }

function nextStep(s: MCState, rand: () => number): Step | null {
  const humans = s.players.filter((p) => !p.isBot && !p.leftAt)
  if (s.phase === 'countdown') return { actor: humans[0].id, input: { type: 'advance', phaseKey: phaseKey(s) } }
  if (s.phase === 'clue') {
    const master = mcSpymasterOf(s, s.activeTeam)!
    if (master.isBot) return { actor: master.id, input: { type: 'bot' } }
    return { actor: master.id, input: { type: 'clue', word: 'indice', count: 1 + Math.floor(rand() * 3) } }
  }
  if (s.phase !== 'guess') return null
  const guessers = s.players.filter((p) => p.team === s.activeTeam && !p.isSpymaster && !p.leftAt && !p.isBot)
  if (guessers.length === 0) return { actor: humans[0].id, input: { type: 'bot' } }
  const by = guessers[Math.floor(rand() * guessers.length)].id
  if (rand() < 0.12) return { actor: by, input: { type: 'pass' } }
  const hidden = s.revealed.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0)
  return { actor: by, input: { type: 'guess', tile: hidden[Math.floor(rand() * hidden.length)] } }
}

function play(seed: string, [players, converted]: Table, sayRand: () => number) {
  vi.setSystemTime(T0)
  const created = createMCState(players, WORDS, seed, T0)
  // Les déserteurs convertis en bots en cours de partie (la création exige deux humains par équipe).
  let s = { ...created, players: created.players.map((p) => (converted.includes(p.id) ? { ...p, isBot: true } : p)) }
  const rand = createRng(`${seed}-coups`).next
  const states: MCState[] = []
  for (let i = 0; i < 500 && s.phase !== 'finished'; i += 1) {
    const step = nextStep(s, rand)
    if (!step) break
    if (step.input.type === 'advance') vi.setSystemTime(s.phaseEndsAt ?? Date.now())
    else vi.advanceTimersByTime(1_000)
    const res = applyMCRoomAction(s, step.actor, step.input, sayRand)
    if (!res.ok) throw new Error(`${step.input.type} : ${res.error}`)
    states.push(s)
    s = res.state
  }
  return { final: s, states }
}

type Table = [MCInitialPlayer[], string[]]
const TABLES: Table[] = [
  [PLAYERS, []],
  [[...PLAYERS, { id: 'gb2', name: 'Raoul', team: 'gold', isBot: true }, { id: 'rb2', name: 'Bernadette', team: 'red', isBot: true }], []],
  // Gus parti et converti : les devineurs d'Or sont tous des bots, ils passent d'office sans qu'on les chambre.
  [PLAYERS, ['g2']],
]
const spokeAtAll = (states: MCState[]) => states.some((st) => (st.speech ?? []).length > 0)

describe('applyMCRoomAction — paroles dans la même réduction', () => {
  it('la tuile retournée porte la réaction, sans version de plus', () => {
    const s = guessing()
    const tile = tileOf(s, 'gold')
    const silent = applyMCRoomAction(s, 'g2', { type: 'guess', tile }, never)
    const talked = applyMCRoomAction(s, 'g2', { type: 'guess', tile }, yes)
    if (!silent.ok || !talked.ok) throw new Error('refusé')
    expect(talked.state.speech).toEqual([sp('gb', 'nice', 'g2', s.turn)])
    expect({ ...talked.state, speech: [] }).toEqual({ ...silent.state, speech: [] })
    expect(withMCSpeech(silent.state, null, yes)).toBe(silent.state)
  })

  it('les paroles ne pèsent pas sur le jeu : la même partie, avec ou sans elles', () => {
    for (const [i, players] of TABLES.entries()) {
      const talk = play(`egal-${i}`, players, createRng(`dire-${i}`).next)
      const mute = play(`egal-${i}`, players, never)
      expect(talk.final.phase).toBe('finished')
      expect(spokeAtAll([...talk.states, talk.final])).toBe(true)
      expect(spokeAtAll([...mute.states, mute.final])).toBe(false)
      expect({ ...talk.final, speech: [] }).toEqual({ ...mute.final, speech: [] })
    }
  })

  it(`sobriété : min(${MC_SPEECH_CAP}, bavardage) bulles par bot, ${MC_TURN_SPEECH_MAX} par tour, jamais un humain ni un maître-mot`, () => {
    for (let g = 0; g < 12; g += 1) {
      const players = TABLES[g % TABLES.length]
      const { final, states } = play(`sobre-${g}`, players, createRng(`sobre-dire-${g}`).next)
      for (const st of [...states, final]) {
        for (const turn of new Set((st.speech ?? []).map((x) => x.round))) {
          const said = (st.speech ?? []).filter((x) => x.round === turn)
          expect(said.length, `tour ${turn}`).toBeLessThanOrEqual(MC_TURN_SPEECH_MAX)
          for (const p of st.players) {
            const cap = p.isBot && !p.isSpymaster ? Math.min(MC_SPEECH_CAP, botTraitsFor(p.name).bavardage) : 0
            expect(said.filter((x) => x.playerId === p.id).length, `${p.name} tour ${turn}`).toBeLessThanOrEqual(cap)
          }
          // Jamais de bulle qui vise un bot : on réagit aux coups des humains.
          for (const x of said) expect(st.players.find((p) => p.id === x.targetId)?.isBot, x.kind).toBe(false)
        }
      }
    }
  })

  it('chaque bulle parle d’une tuile que toute la table voit déjà', () => {
    const team = (s: MCState, id: string): MCTeam => s.players.find((p) => p.id === id)!.team
    const kindsSeen = new Set<string>()
    for (let g = 0; g < 6; g += 1) {
      const { final, states } = play(`publique-${g}`, TABLES[g % TABLES.length], createRng(`publique-dire-${g}`).next)
      const all = [...states, final]
      for (let i = 1; i < all.length; i += 1) {
        const before = all[i - 1]
        const after = all[i]
        // Le fil ne fait que grandir dans un tour : les bulles nouvelles sont en queue.
        const current = (after.speech ?? []).filter((x) => x.round === after.turn)
        const fresh = current.slice((before.speech ?? []).filter((x) => x.round === after.turn).length)
        for (const x of fresh) {
          kindsSeen.add(x.kind)
          const newly = after.revealed.findIndex((r, k) => r && !before.revealed[k])
          if (x.kind === 'tease') {
            expect(newly).toBe(-1)
            continue
          }
          expect(newly, x.kind).toBeGreaterThanOrEqual(0)
          const kind = after.kinds[newly]
          const mine = kind === team(after, x.targetId!)
          if (x.kind === 'nice' || x.kind === 'lead' || x.kind === 'win') expect(mine).toBe(true)
          if (x.kind === 'miss') expect(kind).toBe('neutral')
          if (x.kind === 'oops') expect(!mine && kind !== 'neutral' && kind !== 'assassin').toBe(true)
          if (x.kind === 'assassin' || x.kind === 'saved') expect(kind).toBe('assassin')
        }
      }
    }
    expect(kindsSeen.size).toBeGreaterThanOrEqual(4)
  })
})
