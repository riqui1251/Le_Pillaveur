import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Le minuteur est testé seul : la base est une table de lignes en mémoire,
// l'application d'une action est simulée (room-actions.test.ts la couvre), et
// le jeu 'fake' dit lui-même quel tick il attend. Les VRAIS adaptateurs restent
// branchés pour les autres jeux : c'est sur eux que portent les tests de
// serviceTick plus bas.
const { rows, findUniqueMock, findManyMock, memberFindFirstMock, applyRoomActionMock, fakeAdapter } = vi.hoisted(() => {
  type FakeState = { finished?: boolean; tick?: ServiceTick | null; fallback?: ServiceTick | null }
  const rows = new Map<
    string,
    { status: string; gameId: string | null; gameStateJson: string | null; stateVersion: number }
  >()
  return {
    rows,
    findUniqueMock: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id)
      return row ? { ...row } : null
    }),
    findManyMock: vi.fn(async () =>
      [...rows.entries()].filter(([, row]) => row.status === 'playing').map(([id]) => ({ id }))
    ),
    // Présence : un membre vu récemment par défaut (table suivie).
    memberFindFirstMock: vi.fn(),
    applyRoomActionMock: vi.fn(),
    fakeAdapter: {
      parse: (json: string | null) => (json ? (JSON.parse(json) as FakeState) : null),
      isFinished: (state: unknown) => (state as FakeState).finished === true,
      // `fallback` : ce qui reste quand le tick bot de la version a été refusé.
      serviceTick: (state: unknown, _now: number, options?: ServiceTickOptions) => {
        const s = state as FakeState
        if (!s.tick) return null
        return options?.skipBot && s.tick.body.action === 'bot' ? (s.fallback ?? null) : s.tick
      },
    },
  }
})

vi.mock('@/lib/prisma', () => ({
  prisma: {
    onlineRoom: { findUnique: findUniqueMock, findMany: findManyMock },
    onlineRoomMember: { findFirst: memberFindFirstMock },
  },
}))
vi.mock('@/lib/online/room-actions', () => ({ applyRoomAction: applyRoomActionMock }))
vi.mock('@/lib/online/game-adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/online/game-adapters')>()
  return {
    ...actual,
    getGameAdapter: (gameId: string | null | undefined) =>
      gameId === 'fake' ? fakeAdapter : actual.getGameAdapter(gameId),
  }
})

import {
  SERVICE_ABANDONED_MS,
  SERVICE_TICK_MARGIN_MS,
  SERVICE_TICK_MAX_WAIT_MS,
  armRoomTicker,
  armRoomTickerForState,
  cancelRoomTicker,
  clearRoomTickers,
  rearmPlayingRooms,
  roomTickerCount,
} from '@/lib/online/room-ticker'
import {
  GAME_ADAPTERS,
  getGameAdapter,
  type ServiceTick,
  type ServiceTickOptions,
} from '@/lib/online/game-adapters'
import { BOT_PERSONAS, botTickDelayMs, personaForBotName } from '@/lib/online/bot-personas'
import { buildMenteurState } from '@/lib/menteur/server-adapter'
import { buildLGState } from '@/lib/loup-garou/server-adapter'
import { buildQuizState } from '@/lib/quiz/server-adapter'
import { buildCrobardState } from '@/lib/crobard/server-adapter'
import type { MenteurState } from '@/lib/menteur/engine'
import type { LGState } from '@/lib/loup-garou/engine'
import type { QuizState } from '@/lib/quiz/engine'
import type { CrobardState } from '@/lib/crobard/engine'

const T0 = Date.UTC(2026, 8, 25, 20, 0, 0)

const advanceTick = (dueAt: number, key = 'vote#2'): ServiceTick => ({
  body: { action: 'advance', phaseKey: key },
  dueAt,
})
const botTick = (dueAt: number): ServiceTick => ({ body: { action: 'bot' }, dueAt })

function putRoom(
  roomId: string,
  state: { finished?: boolean; tick?: ServiceTick | null; fallback?: ServiceTick | null },
  stateVersion = 3,
  status = 'playing'
) {
  rows.set(roomId, { status, gameId: 'fake', gameStateJson: JSON.stringify(state), stateVersion })
}

const ok = (stateVersion: number) => ({ status: 200, body: { ok: true, stateVersion } })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  rows.clear()
  clearRoomTickers()
  findUniqueMock.mockClear()
  findManyMock.mockClear()
  applyRoomActionMock.mockReset()
  applyRoomActionMock.mockResolvedValue(ok(4))
  memberFindFirstMock.mockReset()
  memberFindFirstMock.mockResolvedValue({ userId: 'u1' })
})

afterEach(() => {
  clearRoomTickers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// ─── Minuteur ────────────────────────────────────────────────────────────────

describe('armRoomTicker : un filet qui tire après le client', () => {
  it('tire à l’échéance + 1,5 s, avec la version sur laquelle il a été armé', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 10_000) })
    await armRoomTicker('r1')
    expect(roomTickerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(10_000 + SERVICE_TICK_MARGIN_MS - 1)
    expect(applyRoomActionMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(1)
    expect(applyRoomActionMock).toHaveBeenCalledWith('r1', null, {
      action: 'advance',
      phaseKey: 'vote#2',
      expectedVersion: 3,
    })
  })

  it('une échéance déjà passée (redémarrage) part aussitôt', async () => {
    putRoom('r1', { tick: advanceTick(T0 - 60_000) })
    await armRoomTicker('r1')
    await vi.advanceTimersByTimeAsync(0)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(1)
  })

  it('jamais plus d’un minuteur par salle : réarmer remplace', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 5_000, 'a#1') })
    await armRoomTicker('r1')
    putRoom('r1', { tick: advanceTick(T0 + 8_000, 'b#2') }, 4)
    await armRoomTicker('r1')
    expect(roomTickerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(1)
    expect(applyRoomActionMock.mock.calls[0][2]).toMatchObject({ phaseKey: 'b#2', expectedVersion: 4 })
  })

  it('rien à attendre, salle hors partie, disparue ou partie finie : aucun minuteur', async () => {
    putRoom('rien', { tick: null })
    putRoom('lobby', { tick: advanceTick(T0 + 1_000) }, 3, 'waiting')
    putRoom('finie', { finished: true, tick: advanceTick(T0 + 1_000) })
    for (const id of ['rien', 'lobby', 'finie', 'disparue']) await armRoomTicker(id)
    expect(roomTickerCount()).toBe(0)
  })

  it('cancelRoomTicker coupe le minuteur', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 5_000) })
    await armRoomTicker('r1')
    cancelRoomTicker('r1')
    expect(roomTickerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(applyRoomActionMock).not.toHaveBeenCalled()
  })

  it('la salle quitte la partie avant l’échéance : coupé au déclenchement, sans agir', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 5_000) })
    await armRoomTicker('r1')
    rows.delete('r1')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(applyRoomActionMock).not.toHaveBeenCalled()
    expect(roomTickerCount()).toBe(0)
  })
})

describe('le client reste prioritaire', () => {
  it('une écriture avant l’échéance réarme : l’ancien minuteur ne sonne jamais', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 5_000, 'a#1') })
    await armRoomTicker('r1')

    // Le client de rang 0 a joué à T0 + 3 s : la route réarme sur SON état.
    await vi.advanceTimersByTimeAsync(3_000)
    armRoomTickerForState('r1', {
      gameId: 'fake',
      state: { tick: advanceTick(T0 + 60_000, 'b#2') },
      stateVersion: 4,
    })
    expect(roomTickerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(10_000)
    expect(applyRoomActionMock).not.toHaveBeenCalled()
  })

  it('armRoomTickerForState ne relit pas la base', () => {
    armRoomTickerForState('r1', {
      gameId: 'fake',
      state: { tick: advanceTick(T0 + 5_000) },
      stateVersion: 7,
    })
    expect(findUniqueMock).not.toHaveBeenCalled()
    expect(roomTickerCount()).toBe(1)
  })

  it('version changée depuis l’armement : réarme sur l’état frais, sans agir', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 5_000, 'a#1') })
    await armRoomTicker('r1')
    // Écriture hors route action (départ, retour…) : elle n'a rien réarmé.
    putRoom('r1', { tick: advanceTick(T0 + 30_000, 'b#2') }, 4)

    await vi.advanceTimersByTimeAsync(5_000 + SERVICE_TICK_MARGIN_MS)
    expect(applyRoomActionMock).not.toHaveBeenCalled()
    expect(roomTickerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(1)
    expect(applyRoomActionMock.mock.calls[0][2]).toMatchObject({ phaseKey: 'b#2', expectedVersion: 4 })
  })

  it('409 : un client est passé avant — toléré, sans bruit, et réarmé sur l’état frais', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    putRoom('r1', { tick: advanceTick(T0 + 5_000, 'a#1') })
    await armRoomTicker('r1')
    applyRoomActionMock.mockImplementationOnce(async () => {
      // Le client écrit la version 4 pendant que le serveur tente la 3.
      putRoom('r1', { tick: advanceTick(T0 + 90_000, 'b#2') }, 4)
      return { status: 409, body: { error: 'version_conflict' } }
    })

    await vi.advanceTimersByTimeAsync(5_000 + SERVICE_TICK_MARGIN_MS)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(roomTickerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(90_000)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(2)
    expect(applyRoomActionMock.mock.calls[1][2]).toMatchObject({ phaseKey: 'b#2', expectedVersion: 4 })
  })

  it('tick bot refusé : retombe une fois sur l’échéance de la même version', async () => {
    putRoom('r1', { tick: botTick(T0 + 3_000), fallback: advanceTick(T0 + 20_000) })
    await armRoomTicker('r1')
    applyRoomActionMock.mockResolvedValueOnce({ status: 409, body: { error: 'action_failed' } })

    await vi.advanceTimersByTimeAsync(3_000 + SERVICE_TICK_MARGIN_MS)
    expect(applyRoomActionMock).toHaveBeenLastCalledWith('r1', null, {
      action: 'bot',
      expectedVersion: 3,
    })
    expect(roomTickerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(2)
    expect(applyRoomActionMock).toHaveBeenLastCalledWith('r1', null, {
      action: 'advance',
      phaseKey: 'vote#2',
      expectedVersion: 3,
    })
  })

  it('échéance refusée : pas de nouvelle tentative, journal sans donnée personnelle', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    putRoom('r1', { tick: advanceTick(T0 + 1_000) })
    await armRoomTicker('r1')
    applyRoomActionMock.mockResolvedValue({ status: 409, body: { error: 'action_failed' } })

    await vi.advanceTimersByTimeAsync(60_000)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(1)
    expect(roomTickerCount()).toBe(0)
    expect(warn).toHaveBeenCalledWith('[room-ticker] tick de service refusé :', 'fake', 'action_failed')
  })
})

describe('borne des 10 minutes', () => {
  it('une échéance lointaine est visée par étapes de 10 min, en relisant la salle', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 25 * 60_000) })
    await armRoomTicker('r1')
    findUniqueMock.mockClear()

    await vi.advanceTimersByTimeAsync(SERVICE_TICK_MAX_WAIT_MS)
    expect(findUniqueMock).toHaveBeenCalledTimes(1)
    expect(applyRoomActionMock).not.toHaveBeenCalled()
    expect(roomTickerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(SERVICE_TICK_MAX_WAIT_MS)
    expect(findUniqueMock).toHaveBeenCalledTimes(2)
    expect(applyRoomActionMock).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5 * 60_000 + SERVICE_TICK_MARGIN_MS)
    expect(applyRoomActionMock).toHaveBeenCalledTimes(1)
  })
})

describe('table abandonnée (personne vu depuis 10 min)', () => {
  it('le serveur ne joue pas la partie de fantômes : coupé au déclenchement, sans agir', async () => {
    // Onglets fermés sans « Quitter » : aucun `leftAt` dans l'état, seule la
    // présence dit que la table est vide.
    memberFindFirstMock.mockResolvedValue(null)
    putRoom('r1', { tick: advanceTick(T0 + 5_000) })
    await armRoomTicker('r1')

    await vi.advanceTimersByTimeAsync(5_000 + SERVICE_TICK_MARGIN_MS)
    expect(applyRoomActionMock).not.toHaveBeenCalled()
    expect(roomTickerCount()).toBe(0)
    expect(memberFindFirstMock).toHaveBeenCalledWith({
      where: {
        roomId: 'r1',
        lastSeenAt: { gte: new Date(T0 + 5_000 + SERVICE_TICK_MARGIN_MS - SERVICE_ABANDONED_MS) },
      },
      select: { userId: true },
    })
  })

  it('au redémarrage non plus : une échéance passée d’une table désertée ne part pas', async () => {
    memberFindFirstMock.mockResolvedValue(null)
    putRoom('r1', { tick: advanceTick(T0 - 60_000) })
    await rearmPlayingRooms()

    await vi.advanceTimersByTimeAsync(0)
    expect(applyRoomActionMock).not.toHaveBeenCalled()
    expect(roomTickerCount()).toBe(0)
  })

  it('la présence n’est lue qu’au moment d’agir, jamais à l’armement', async () => {
    putRoom('r1', { tick: advanceTick(T0 + 5_000) })
    await armRoomTicker('r1')
    armRoomTickerForState('r1', {
      gameId: 'fake',
      state: { tick: advanceTick(T0 + 6_000) },
      stateVersion: 4,
    })
    expect(memberFindFirstMock).not.toHaveBeenCalled()
  })
})

describe('rearmPlayingRooms (démarrage du serveur)', () => {
  it('réarme les salles en partie et rend le nombre de minuteurs posés', async () => {
    putRoom('a', { tick: advanceTick(T0 + 5_000) })
    putRoom('b', { tick: null })
    putRoom('c', { tick: advanceTick(T0 + 9_000) }, 3, 'waiting')
    putRoom('d', { tick: botTick(T0 + 2_000) })
    expect(await rearmPlayingRooms()).toBe(2)
    expect(roomTickerCount()).toBe(2)
  })
})

// ─── serviceTick des adaptateurs ─────────────────────────────────────────────
// La spécification est ce que chaque composant client passe à useBotReferee /
// useAdvanceTick. Le serveur prend la borne HAUTE des délais tirés au hasard
// (le client tire avant lui) ; `rand` injecté vérifie la fenêtre elle-même.

const human = (userId: string, displayName = userId) => ({ userId, user: { displayName } })
const NOW = T0
const upper = { rand: () => 1 }
const lower = { rand: () => 0 }

describe('serviceTick — Menteur (bot au tour, révélation)', () => {
  const adapter = getGameAdapter('menteur')!

  function withBotToPlay(): { state: MenteurState; botName: string } {
    const base = buildMenteurState([human('u1', 'Alice')], 1, 'seed-menteur')
    const botIdx = base.players.findIndex((p) => p.isBot)
    return { state: { ...base, phase: 'bidding', turnIdx: botIdx }, botName: base.players[botIdx].name }
  }

  it('enchère d’un bot : au tempo de SON persona, borne haute par défaut', () => {
    const { state, botName } = withBotToPlay()
    const persona = personaForBotName(botName)!
    expect(persona).toBeTruthy()
    expect(adapter.serviceTick!(state, NOW)).toEqual({
      body: { action: 'bot' },
      dueAt: NOW + persona.tempoMaxMs,
    })
    expect(adapter.serviceTick!(state, NOW, lower)?.dueAt).toBe(NOW + botTickDelayMs(botName, () => 0))
  })

  it('révélation menée par un bot : 2,6 s de lecture, quel que soit le persona', () => {
    const { state } = withBotToPlay()
    // Sans perdant désigné, le premier vivant mène le « continuer » : le bot.
    const reveal: MenteurState = {
      ...state,
      phase: 'reveal',
      lastReveal: null,
      players: [...state.players.filter((p) => p.isBot), ...state.players.filter((p) => !p.isBot)],
    }
    expect(adapter.serviceTick!(reveal, NOW)).toEqual({ body: { action: 'bot' }, dueAt: NOW + 2600 })
  })

  it('tour d’un humain, ou plus aucun humain présent : rien', () => {
    const { state } = withBotToPlay()
    const humanTurn: MenteurState = { ...state, turnIdx: state.players.findIndex((p) => !p.isBot) }
    expect(adapter.serviceTick!(humanTurn, NOW)).toBeNull()
    const deserted: MenteurState = {
      ...state,
      players: state.players.map((p) => (p.isBot ? p : { ...p, leftAt: NOW - 1_000 })),
    }
    expect(adapter.serviceTick!(deserted, NOW)).toBeNull()
  })
})

describe('serviceTick — Loup-Garou (échéance de phase, tick bot « au cas où »)', () => {
  const adapter = getGameAdapter('loup-garou')!

  it('table sans bot : l’advance à l’échéance, avec la clé de phase', () => {
    const state = buildLGState(['u1', 'u2', 'u3', 'u4'].map((id) => human(id)), undefined, 0, 'seed-lg')
    expect(state.phaseEndsAt).not.toBeNull()
    expect(adapter.serviceTick!(state, NOW)).toEqual({
      body: { action: 'advance', phaseKey: `${state.phase}#${state.phaseSeq}` },
      dueAt: state.phaseEndsAt,
    })
  })

  it('avec des bots : le tick bot passe d’abord (2,5-5,5 s), puis l’échéance s’il est refusé', () => {
    const state: LGState = {
      ...buildLGState([human('u1')], undefined, 3, 'seed-lg'),
      phaseEndsAt: NOW + 180_000,
    }
    expect(adapter.serviceTick!(state, NOW)).toEqual({ body: { action: 'bot' }, dueAt: NOW + 5500 })
    expect(adapter.serviceTick!(state, NOW, lower)?.dueAt).toBe(NOW + 2500)
    expect(adapter.serviceTick!(state, NOW, { skipBot: true })).toEqual({
      body: { action: 'advance', phaseKey: `${state.phase}#${state.phaseSeq}` },
      dueAt: NOW + 180_000,
    })
  })

  it('échéance déjà dépassée : l’advance passe avant le bot', () => {
    const state: LGState = {
      ...buildLGState([human('u1')], undefined, 3, 'seed-lg'),
      phaseEndsAt: NOW - 1_000,
    }
    expect(adapter.serviceTick!(state, NOW)?.body.action).toBe('advance')
  })
})

describe('serviceTick — Quiz (échéances, bots retardataires)', () => {
  const adapter = getGameAdapter('quiz')!

  it('compte à rebours : l’advance à son échéance', () => {
    const state = buildQuizState([human('u1'), human('u2')], 'fr', 10, 0, 'seed-quiz')
    expect(adapter.serviceTick!(state, NOW)).toEqual({
      body: { action: 'advance', phaseKey: `${state.phase}#${state.phaseSeq}` },
      dueAt: state.phaseEndsAt,
    })
  })

  it('question avec un bot qui n’a pas répondu : 2,5 à 7 s, avant l’échéance de 15 s', () => {
    const base = buildQuizState([human('u1')], 'fr', 10, 1, 'seed-quiz')
    const question: QuizState = { ...base, phase: 'question', phaseSeq: 2, phaseEndsAt: NOW + 15_000 }
    expect(adapter.serviceTick!(question, NOW)).toEqual({ body: { action: 'bot' }, dueAt: NOW + 7000 })
    expect(adapter.serviceTick!(question, NOW, lower)?.dueAt).toBe(NOW + 2500)

    const bot = base.players.find((p) => p.isBot)!
    const answered: QuizState = {
      ...question,
      answers: { [bot.id]: { choice: 0, answeredAt: NOW } },
    }
    expect(adapter.serviceTick!(answered, NOW)).toEqual({
      body: { action: 'advance', phaseKey: 'question#2' },
      dueAt: NOW + 15_000,
    })
  })
})

describe('serviceTick — Crobard (échéances, bot meneur du bilan)', () => {
  const adapter = getGameAdapter('crobard')!

  it('compte à rebours : l’advance à son échéance', () => {
    const state = buildCrobardState([human('u1'), human('u2'), human('u3')], 'fr', 0, 'seed-crobard')
    expect(adapter.serviceTick!(state, NOW)).toEqual({
      body: { action: 'advance', phaseKey: `${state.phase}#${state.phaseSeq}` },
      dueAt: state.phaseEndsAt,
    })
  })

  it('bilan de manche mené par un bot : son tempo, avant l’échéance du bilan', () => {
    const base = buildCrobardState([human('u1')], 'fr', 2, 'seed-crobard')
    const bots = base.players.filter((p) => p.isBot)
    const humans = base.players.filter((p) => !p.isBot)
    // Le bilan est mené par le premier joueur actif : on met un bot en tête.
    const roundEnd: CrobardState = {
      ...base,
      players: [...bots, ...humans],
      phase: 'roundEnd',
      phaseSeq: 5,
      phaseEndsAt: NOW + 60_000,
    }
    const persona = personaForBotName(bots[0].name)!
    expect(adapter.serviceTick!(roundEnd, NOW, upper)).toEqual({
      body: { action: 'bot' },
      dueAt: NOW + persona.tempoMaxMs,
    })
  })

  it('bilan mené par un humain : seule l’échéance compte', () => {
    const base = buildCrobardState([human('u1')], 'fr', 2, 'seed-crobard')
    const roundEnd: CrobardState = { ...base, phase: 'roundEnd', phaseSeq: 5, phaseEndsAt: NOW + 60_000 }
    expect(adapter.serviceTick!(roundEnd, NOW)).toEqual({
      body: { action: 'advance', phaseKey: 'roundEnd#5' },
      dueAt: NOW + 60_000,
    })
  })
})

describe('les moteurs acceptent le tick de service sans utilisateur', () => {
  // Le vrai module (il est simulé plus haut pour le minuteur).
  const serviceActorId = async () =>
    (await vi.importActual<typeof import('@/lib/online/room-actions')>('@/lib/online/room-actions'))
      .SERVICE_ACTOR_ID

  it('Menteur : le bot au tour joue sous l’identifiant de service', async () => {
    const base = buildMenteurState([human('u1')], 1, 'seed-menteur')
    const state: MenteurState = {
      ...base,
      phase: 'bidding',
      turnIdx: base.players.findIndex((p) => p.isBot),
    }
    const result = getGameAdapter('menteur')!.applyAction(state, await serviceActorId(), {
      action: 'bot',
    })
    expect(result.ok).toBe(true)
  })

  it('Loup-Garou : l’advance échu passe sous l’identifiant de service', async () => {
    const base = buildLGState(['u1', 'u2', 'u3', 'u4'].map((id) => human(id)), undefined, 0, 'seed-lg')
    const state: LGState = { ...base, phaseEndsAt: Date.now() - 1 }
    const result = getGameAdapter('loup-garou')!.applyAction(state, await serviceActorId(), {
      action: 'advance',
      phaseKey: `${state.phase}#${state.phaseSeq}`,
    })
    expect(result.ok).toBe(true)
  })
})

describe('serviceTick — couverture du registre', () => {
  it('chaque jeu en ligne a son tick de service', () => {
    for (const [gameId, adapter] of Object.entries(GAME_ADAPTERS)) {
      expect(typeof adapter.serviceTick, `${gameId} sans serviceTick`).toBe('function')
    }
  })

  it('la borne haute du serveur couvre tout tirage du client', () => {
    for (const persona of BOT_PERSONAS) {
      const name = `${persona.name} ${persona.emoji}`
      expect(botTickDelayMs(name, () => 1)).toBe(persona.tempoMaxMs)
      expect(botTickDelayMs(name, () => 0.999)).toBeLessThanOrEqual(persona.tempoMaxMs)
    }
  })
})
