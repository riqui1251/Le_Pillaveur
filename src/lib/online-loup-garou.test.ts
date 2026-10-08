import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lanceur du Loup-Garou : la durée du débat. Seul face aux bots, un humain
 * attendait 3 min par jour que des bots aux phrases toutes faites finissent
 * de « débattre » — une table solo part donc sur 1 min, sauf choix explicite
 * de l'hôte au lobby, qui prime toujours.
 */

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: { update: updateMock } } }))

import { launchLoupGarouRoom } from './online-loup-garou'
import { LG_SOLO_DEBATE_MIN, lgDebateMinutes } from './loup-garou/debate'
import { LG_DEBATE_CHOICES_MIN, LG_DEBATE_DEFAULT_MS } from './loup-garou/engine'

const members = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ userId: `p${i + 1}`, user: { displayName: `Joueur ${i + 1}` } }))

type LaunchedState = { debateMs: number; players: { id: string; isBot: boolean }[] }

const launched = (): LaunchedState => JSON.parse(updateMock.mock.calls.at(-1)?.[0].data.gameStateJson)

beforeEach(() => {
  updateMock.mockReset()
  updateMock.mockResolvedValue({})
})

describe('lgDebateMinutes', () => {
  it('un humain seul face aux bots, sans choix : 1 min', () => {
    expect(LG_SOLO_DEBATE_MIN).toBe(1)
    expect(lgDebateMinutes(undefined, 1)).toBe(1)
  })

  it('à plusieurs humains, sans choix : la durée par défaut (3 min)', () => {
    expect(lgDebateMinutes(undefined, 2)).toBe(LG_DEBATE_DEFAULT_MS / 60_000)
    expect(lgDebateMinutes(undefined, 6)).toBe(3)
  })

  it("le choix explicite de l'hôte prime, seul ou à plusieurs", () => {
    for (const choice of LG_DEBATE_CHOICES_MIN) {
      expect(lgDebateMinutes(choice, 1), `${choice} min en solo`).toBe(choice)
      expect(lgDebateMinutes(choice, 5), `${choice} min à 5`).toBe(choice)
    }
  })

  it('un réglage hors des choix proposés est ignoré, comme une absence de choix', () => {
    expect(lgDebateMinutes(7, 1)).toBe(1)
    expect(lgDebateMinutes(0, 4)).toBe(3)
    expect(lgDebateMinutes('3', 1)).toBe(1)
    expect(lgDebateMinutes(null, 3)).toBe(3)
  })
})

describe('launchLoupGarouRoom — durée du débat', () => {
  it('un humain + 3 bots, sans choix : débat de 1 min', async () => {
    await launchLoupGarouRoom('room-1', { settingsJson: JSON.stringify({ botsCount: 3 }), members: members(1) })

    const state = launched()
    expect(state.players.filter((p) => !p.isBot)).toHaveLength(1)
    expect(state.players.filter((p) => p.isBot)).toHaveLength(3)
    expect(state.debateMs).toBe(60_000)
    expect(updateMock.mock.calls[0][0].data.status).toBe('playing')
  })

  it('un humain seul sans réglage du tout (salle neuve) : 1 min aussi', async () => {
    await launchLoupGarouRoom('room-1', { settingsJson: null, members: members(1) })
    expect(launched().debateMs).toBe(60_000)
  })

  it("un humain seul mais l'hôte a choisi 4 min : 4 min", async () => {
    await launchLoupGarouRoom('room-1', {
      settingsJson: JSON.stringify({ botsCount: 3, lgDebateMin: 4 }),
      members: members(1),
    })
    expect(launched().debateMs).toBe(240_000)
  })

  it("un humain seul qui a choisi explicitement 3 min : 3 min, pas 1", async () => {
    await launchLoupGarouRoom('room-1', {
      settingsJson: JSON.stringify({ botsCount: 3, lgDebateMin: 3 }),
      members: members(1),
    })
    expect(launched().debateMs).toBe(180_000)
  })

  it('deux humains + bots, sans choix : la durée par défaut', async () => {
    await launchLoupGarouRoom('room-1', { settingsJson: JSON.stringify({ botsCount: 2 }), members: members(2) })
    expect(launched().debateMs).toBe(LG_DEBATE_DEFAULT_MS)
  })

  it('table de 5 humains avec un choix à 2 min : 2 min', async () => {
    await launchLoupGarouRoom('room-1', { settingsJson: JSON.stringify({ lgDebateMin: 2 }), members: members(5) })
    expect(launched().debateMs).toBe(120_000)
  })
})
