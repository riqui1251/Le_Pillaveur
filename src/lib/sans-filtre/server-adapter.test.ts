import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSFState,
  reduceSF,
  SF_COUNTDOWN_MS,
  SF_REVEAL_BOT_TICK_MS,
  SF_REVEAL_MIN_MS,
  type SFState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  applySFBotAction,
  applySFRoomAction,
  buildSFState,
  markSFPlayerLeft,
  parseSFState,
  serializeSFState,
  sfClientViewJson,
} from './server-adapter'
import { personaForBotName } from '@/lib/online/bot-personas'
import { getGameAdapter } from '@/lib/online/game-adapters'

const T0 = 1_000_000
const BLACKS = ['Trou n°1 : ___.', 'Trou n°2 : ___.', 'Trou n°3 : ___.']
/** Longueur du texte = index de carte + 1 → « plus courte » = plus petit index. */
const WHITES = Array.from({ length: 48 }, (_, i) => 'x'.repeat(i + 1))

/**
 * Table solo (1 humain + 3 bots à persona), countdown consommé : manche 1 à
 * T0, juge = p0 (l'humain), les bots doivent soumettre via les ticks.
 */
function makeSolo(seed: string | number = 'seed'): SFState {
  const players = [
    { id: 'p0', name: 'P0' },
    { id: 'b1', name: 'Barnabé 🎩', isBot: true }, // prudent
    { id: 'b2', name: 'Gépéto 🤠', isBot: true }, // farceur
    { id: 'b3', name: 'Huguette 👵', isBot: true }, // prudent
  ]
  const raw = createSFState(players, BLACKS, WHITES, seed, T0 - SF_COUNTDOWN_MS)
  return reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

/** Déroule la manche 1 puis contrôle la manche 2 : juge-bot b1, soumissions [p0, b2, b3]. */
function makeBotJudgeJudging(): SFState {
  let s = makeSolo()
  for (const id of ['b1', 'b2', 'b3']) {
    const hand = s.players.find((p) => p.id === id)!.hand
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: hand[0], now: T0 })
  }
  s = reduceSF(s, { type: 'JUDGE_PICK', playerId: 'p0', card: s.submissions[0].card, now: T0 })
  s = reduceSF(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
  for (const id of ['p0', 'b2', 'b3']) {
    const hand = s.players.find((p) => p.id === id)!.hand
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: id, card: hand[0], now: T0 })
  }
  return s
}

describe('buildSFState : personas', () => {
  it('les bots de complément portent un persona retrouvable par le nom', () => {
    const members = [{ userId: 'u1', user: { displayName: 'Riqui' } }]
    const state = buildSFState(members, 'soft', 0, 'seed')
    const bots = state.players.filter((p) => p.isBot)
    expect(bots).toHaveLength(3)
    expect(new Set(bots.map((b) => b.name)).size).toBe(bots.length)
    for (const bot of bots) {
      expect(personaForBotName(bot.name)).not.toBeNull()
    }
  })
})

describe('applySFBotAction : soumissions étalées', () => {
  it('un tick fait soumettre exactement UN bot (le premier en attente)', () => {
    let s = makeSolo()
    const r1 = applySFBotAction(s, () => 0)
    if (!r1.ok) throw new Error(r1.error)
    s = r1.state
    expect(s.phase).toBe('submit')
    expect(s.submissions).toHaveLength(1)
    expect(s.submissions[0].playerId).toBe('b1')

    const r2 = applySFBotAction(s, () => 0)
    if (!r2.ok) throw new Error(r2.error)
    s = r2.state
    expect(s.phase).toBe('submit')
    expect(s.submissions).toHaveLength(2)
    expect(s.submissions[1].playerId).toBe('b2')

    // Dernier bot : le raccourci « tous ont soumis » entre au jugement.
    const r3 = applySFBotAction(s, () => 0)
    if (!r3.ok) throw new Error(r3.error)
    s = r3.state
    expect(s.submissions).toHaveLength(3)
    expect(s.phase).toBe('judging')
    expect(applySFBotAction(s).ok).toBe(false) // juge humain : plus rien à ticker
  })

  it('farceur : parmi 3 cartes tirées de sa main, abat la plus courte', () => {
    const s = makeSolo()
    const gepeto = s.players.find((p) => p.id === 'b2')!
    // rand → 0 : tire hand[0..2] ; la plus courte = plus petit index de carte.
    const expected = Math.min(...gepeto.hand.slice(0, 3))
    const r1 = applySFBotAction(s, () => 0) // b1 joue (aléatoire simple)
    if (!r1.ok) throw new Error(r1.error)
    const r2 = applySFBotAction(r1.state, () => 0) // b2 le farceur
    if (!r2.ok) throw new Error(r2.error)
    expect(r2.state.submissions.find((sub) => sub.playerId === 'b2')?.card).toBe(expected)
  })
})

describe('applySFBotAction : juge-bot pondéré', () => {
  it('couronne pondéré 3:1 en faveur des soumissions humaines', () => {
    const s = makeBotJudgeJudging()
    expect(s.phase).toBe('judging')
    expect(s.judgeId).toBe('b1')
    expect(s.submissions.map((sub) => sub.playerId)).toEqual(['p0', 'b2', 'b3'])

    // Poids [humain 3, bot 1, bot 1], total 5 : r < 3/5 → l'humain gagne.
    const pickAt = (r: number) => {
      const result = applySFBotAction(s, () => r)
      if (!result.ok) throw new Error(result.error)
      expect(result.state.phase).toBe('reveal')
      return result.state.crowned?.playerId
    }
    expect(pickAt(0)).toBe('p0')
    expect(pickAt(0.59)).toBe('p0')
    expect(pickAt(0.61)).toBe('b2')
    expect(pickAt(0.99)).toBe('b3')
  })
})

describe('reveal et départ du juge, côté serveur', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  const HUMANS = [
    { id: 'h0', name: 'Alice' },
    { id: 'h1', name: 'Bob' },
    { id: 'h2', name: 'Chloé' },
    { id: 'h3', name: 'Dan' },
  ]

  function submitPhase(players: { id: string; name: string; isBot?: boolean }[]): SFState {
    const raw = createSFState(players, BLACKS, WHITES, 'seed', T0 - SF_COUNTDOWN_MS, 3)
    return reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  }

  /** Reveal ouvert à `at` (horloge serveur simulée) : le juge couronne la première carte. */
  function revealAt(players: { id: string; name: string; isBot?: boolean }[], at: number): SFState {
    vi.useFakeTimers()
    vi.setSystemTime(at)
    let s = submitPhase(players)
    for (const p of s.players) {
      if (p.id === s.judgeId || s.phase !== 'submit') continue
      s = reduceSF(s, { type: 'PLAY_CARD', playerId: p.id, card: p.hand[0], now: at })
    }
    s = reduceSF(s, { type: 'JUDGE_PICK', playerId: s.judgeId!, card: s.submissions[0].card, now: at })
    expect(s.phase).toBe('reveal')
    return s
  }

  it('« manche suivante » à l’instant du couronnement → READING_TIME, accepté après le plancher', () => {
    const s = revealAt(HUMANS, T0)
    expect(applySFRoomAction(s, 'h2', { type: 'continue' })).toEqual({ ok: false, error: 'READING_TIME' })
    vi.setSystemTime(T0 + SF_REVEAL_MIN_MS)
    const next = applySFRoomAction(s, 'h2', { type: 'continue' })
    expect(next.ok && next.state.phase).toBe('submit')
    expect(JSON.parse(sfClientViewJson(s, 'h1')).continueAt).toBe(T0 + SF_REVEAL_MIN_MS)
  })

  it('le bot meneur du reveal attend le plancher tant qu’un humain est assis', () => {
    const s = revealAt([{ id: 'b1', name: 'Barnabé 🎩', isBot: true }, ...HUMANS.slice(0, 3)], T0)
    expect(applySFBotAction(s)).toEqual({ ok: false, error: 'READING_TIME' })
    vi.setSystemTime(T0 + SF_REVEAL_BOT_TICK_MS)
    const next = applySFBotAction(s)
    expect(next.ok && next.state.phase).toBe('submit')
  })

  it('adaptateur : personne au tour au reveal, le tick de service suit le bot meneur', () => {
    const adapter = getGameAdapter('sans-filtre')!
    const humanLead = revealAt(HUMANS, T0)
    expect(adapter.currentActorId(humanLead)).toBeNull()
    expect(adapter.serviceTick!(humanLead, T0)).toBeNull()
    const botLead = revealAt([{ id: 'b1', name: 'Barnabé 🎩', isBot: true }, ...HUMANS.slice(0, 3)], T0)
    expect(adapter.currentActorId(botLead)).toBeNull()
    const tick = adapter.serviceTick!(botLead, T0, { rand: () => 0 })
    expect(tick?.body).toEqual({ action: 'bot' })
    expect(tick!.dueAt).toBeGreaterThanOrEqual(T0 + SF_REVEAL_BOT_TICK_MS)
  })

  it('le juge qui quitte (markSFPlayerLeft) est remplacé sur-le-champ, sans attendre 3 min', () => {
    let s = submitPhase(HUMANS)
    expect(s.judgeId).toBe('h0')
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: 'h1', card: s.players[1].hand[0], now: T0 + 1_000 })
    const left = markSFPlayerLeft(s, 'h0', T0 + 5_000)!
    expect(left.judgeId).toBe('h2')
    expect(getGameAdapter('sans-filtre')!.currentActorId(left)).toBeNull()
    let judging = reduceSF(left, { type: 'PLAY_CARD', playerId: 'h3', card: left.players[3].hand[0], now: T0 + 6_000 })
    expect(judging.phase).toBe('judging')
    expect(getGameAdapter('sans-filtre')!.currentActorId(judging)).toBe('h2')
    judging = markSFPlayerLeft(judging, 'h2', T0 + 7_000)!
    expect(judging.phase).toBe('judging')
    expect(judging.judgeId).not.toBe('h2')
    expect(judging.submissions.some((sub) => sub.playerId === judging.judgeId)).toBe(false)
  })

  it('un état sérialisé sans revealAt se relit et n’est jamais bloqué', () => {
    const s = revealAt(HUMANS, T0)
    const legacy = JSON.parse(serializeSFState(s)) as Record<string, unknown>
    delete legacy.revealAt
    const parsed = parseSFState(JSON.stringify(legacy))!
    expect(parsed.revealAt).toBeNull()
    expect(applySFRoomAction(parsed, 'h2', { type: 'continue' }).ok).toBe(true)
  })
})
