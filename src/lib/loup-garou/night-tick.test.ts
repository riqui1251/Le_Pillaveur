import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le tick `bot` de NUIT ne doit rien dire des rôles. Avant, un client qui
 * l'envoyait en début de phase recevait 200 quand un bot tenait le rôle (le
 * loup, la Voyante…) et 409 sinon : à 3 amis et 1 bot, le loup était connu
 * dès la première nuit. Désormais le client reçoit toujours la même réponse,
 * et c'est le minuteur de service qui fait jouer le bot, à un instant tiré
 * au hasard dans la phase (`botActAt`). La route action et le minuteur sont
 * hors champ : on passe par le vrai adaptateur du registre.
 */

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { getGameAdapter } from '@/lib/online/game-adapters'
import { SERVICE_ACTOR_ID } from '@/lib/online/room-actions'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  LG_DEBATE_DEFAULT_MS,
  LG_EARLY_FINISH_JITTER_MS,
  LG_EARLY_FINISH_MS,
  LG_SEER_MS,
  type LGPlayer,
  type LGPhase,
  type LGState,
} from './engine'
import {
  LG_NIGHT_BOT_MIN_MS,
  LG_NIGHT_BOT_TAIL_MS,
  LG_SERVICE_ACTOR_ID,
  applyLGRoomAction,
  lgServiceBotDelayMs,
  parseLGState,
  serializeLGState,
  withNightTempo,
} from './server-adapter'

const T0 = 1_700_000_000_000

const P = (id: string, role: LGPlayer['role']): LGPlayer => ({
  id,
  name: id.toUpperCase(),
  isBot: id.startsWith('b'),
  leftAt: null,
  role,
  alive: true,
  sips: 0,
})

function craft(players: LGPlayer[], phase: LGPhase, over: Partial<LGState> = {}): LGState {
  return {
    version: 1,
    phase,
    phaseSeq: 4,
    phaseEndsAt: T0 + 30_000,
    players,
    round: 1,
    debateMs: LG_DEBATE_DEFAULT_MS,
    wolfVotes: {},
    seerPeeks: [],
    witchSaveUsed: false,
    witchKillUsed: false,
    witchActed: false,
    nightVictimId: null,
    witchSavedId: null,
    witchKillId: null,
    guardProtectedId: null,
    guardLastProtectedId: null,
    ravenTargetId: null,
    elderLifeUsed: false,
    elderAttackedRound: null,
    mayorId: null,
    mayorVotes: {},
    dayVotes: {},
    debateSkips: [],
    debateSpeech: [],
    revoteCandidates: null,
    pendingHunterId: null,
    afterHunter: null,
    lastNightDeaths: [],
    lastVoteResult: null,
    deaths: [],
    winnerTeam: null,
    rematchVotes: [],
    rngState: 424242,
    ...over,
  }
}

/** 3 amis et 1 bot, 1 seul loup : le bot (b1) tient le rôle, ou c'est h3. */
const botHolds = (role: LGPlayer['role']) => [
  P('h1', 'villageois'),
  P('h2', 'villageois'),
  P('h3', role === 'loup' ? 'voyante' : 'loup'),
  P('b1', role),
]
const humanHolds = (role: LGPlayer['role']) => [
  P('h1', 'villageois'),
  P('h2', role === 'loup' ? 'voyante' : 'loup'),
  P('h3', role),
  P('b1', 'villageois'),
]

const adapter = getGameAdapter('loup-garou')!

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('tick bot d’un client pendant la nuit : une seule réponse', () => {
  for (const [phase, role] of [
    ['night-wolves', 'loup'],
    ['night-seer', 'voyante'],
  ] as const) {
    it(`${phase} : même refus que le rôle soit tenu par le bot ou par un humain`, () => {
      const withBot = adapter.applyAction(craft(botHolds(role), phase, { botActAt: T0 + 9_000 }), 'h1', {
        action: 'bot',
      })
      const withHuman = adapter.applyAction(craft(humanHolds(role), phase, { botActAt: T0 + 9_000 }), 'h1', {
        action: 'bot',
      })
      expect(withBot).toEqual({ ok: false, error: 'NOT_BOT_TURN', status: 409 })
      expect(withHuman).toEqual(withBot)
    })
  }

  it('même passé botActAt, le client n’obtient rien de plus', () => {
    vi.setSystemTime(T0 + 20_000)
    const state = craft(botHolds('voyante'), 'night-seer', { botActAt: T0 + 9_000 })
    expect(adapter.applyAction(state, 'h1', { action: 'bot' })).toEqual({
      ok: false,
      error: 'NOT_BOT_TURN',
      status: 409,
    })
  })

  it('le jour, le tick « au cas où » du client fait toujours jouer les bots', () => {
    const debate = craft(botHolds('voyante'), 'day-vote', { phaseEndsAt: T0 + 60_000 })
    const result = adapter.applyAction(debate, 'h1', { action: 'bot' })
    expect(result.ok).toBe(true)
  })
})

describe('minuteur de service : le bot de nuit joue à botActAt', () => {
  it('l’identifiant de service du Loup-Garou est bien celui de room-actions', () => {
    expect(LG_SERVICE_ACTOR_ID).toBe(SERVICE_ACTOR_ID)
  })

  it('serviceTick vise botActAt quand un bot tient le rôle, l’échéance seule sinon', () => {
    const withBot = craft(botHolds('voyante'), 'night-seer', { botActAt: T0 + 9_000 })
    expect(adapter.serviceTick!(withBot, T0)).toEqual({ body: { action: 'bot' }, dueAt: T0 + 9_000 })
    const withHuman = craft(humanHolds('voyante'), 'night-seer', { botActAt: T0 + 9_000 })
    expect(adapter.serviceTick!(withHuman, T0)).toEqual({
      body: { action: 'advance', phaseKey: phaseKey(withHuman) },
      dueAt: T0 + 30_000,
    })
  })

  it('le tick de service fait jouer le bot ; ensuite, plus de tick bot à cette phase', () => {
    vi.setSystemTime(T0 + 10_500)
    const state = craft(botHolds('voyante'), 'night-seer', {
      phaseEndsAt: T0 + LG_SEER_MS,
      botActAt: T0 + 9_000,
      earlyFinishMs: 14_000,
    })
    const result = adapter.applyAction(state, SERVICE_ACTOR_ID, { action: 'bot' })
    expect(result.ok).toBe(true)
    const next = (result as { ok: true; state: LGState }).state
    expect(next.seerPeeks).toHaveLength(1)
    // Échéance resserrée au délai tiré pour la phase, pas « action + 10 s ».
    expect(next.phaseEndsAt).toBe(T0 + 10_500 + 14_000)
    expect(lgServiceBotDelayMs(next, T0 + 10_500, () => 1)).toBeNull()
  })

  it('partie d’avant le tirage (botActAt absent) : le bot joue au tempo d’avant', () => {
    const legacy = parseLGState(
      serializeLGState(craft(botHolds('voyante'), 'night-seer'))
    )!
    expect(legacy.botActAt).toBeNull()
    expect(lgServiceBotDelayMs(legacy, T0, () => 1)).toBe(5_500)
  })
})

describe('withNightTempo : tirage à l’entrée de chaque phase de nuit', () => {
  const day = craft(botHolds('voyante'), 'day-vote', { phaseSeq: 3, phaseEndsAt: T0 + 60_000 })
  const night = craft(botHolds('voyante'), 'night-seer', { phaseSeq: 4, phaseEndsAt: T0 + LG_SEER_MS })

  it('botActAt dans la phase, avant sa fin ; earlyFinishMs entre 10 et 20 s', () => {
    const low = withNightTempo(day, night, T0, () => 0)
    expect(low.botActAt).toBe(T0 + LG_NIGHT_BOT_MIN_MS)
    expect(low.earlyFinishMs).toBe(LG_EARLY_FINISH_MS)
    const high = withNightTempo(day, night, T0, () => 0.999999)
    expect(high.botActAt).toBe(T0 + LG_SEER_MS - LG_NIGHT_BOT_TAIL_MS)
    expect(high.earlyFinishMs).toBe(LG_EARLY_FINISH_MS + LG_EARLY_FINISH_JITTER_MS)
  })

  it('même phase déjà tirée : rien ne change ; hors de la nuit : effacé', () => {
    const drawn = withNightTempo(day, night, T0, () => 0.5)
    expect(withNightTempo(drawn, { ...drawn, version: drawn.version + 1 }, T0 + 1_000, () => 0)).toMatchObject({
      botActAt: drawn.botActAt,
      earlyFinishMs: drawn.earlyFinishMs,
    })
    const dawn = { ...drawn, phase: 'dawn' as const, phaseSeq: 5 }
    expect(withNightTempo(drawn, dawn, T0 + 30_000)).toMatchObject({ botActAt: null, earlyFinishMs: null })
  })

  it('l’advance de la révélation vers la nuit tire le tempo, secret dans les vues', () => {
    const reveal = craft(botHolds('voyante'), 'reveal-role', { round: 0, phaseEndsAt: T0 })
    const r = applyLGRoomAction(reveal, 'h1', { type: 'advance', phaseKey: phaseKey(reveal) })
    expect(r.ok).toBe(true)
    const s = (r as { ok: true; state: LGState }).state
    expect(s.phase).toBe('night-seer')
    expect(s.botActAt).toBeGreaterThanOrEqual(T0 + LG_NIGHT_BOT_MIN_MS)
    expect(s.botActAt).toBeLessThanOrEqual(s.phaseEndsAt! - LG_NIGHT_BOT_TAIL_MS)
    for (const json of [adapter.clientViewJson(s, 'h1'), adapter.spectatorViewJson(s)]) {
      expect(json).not.toContain('botActAt')
      expect(json).not.toContain('earlyFinishMs')
    }
  })
})
