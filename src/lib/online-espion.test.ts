import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lanceur de Qui est l'Espion ? : la durée de la discussion. Seul face aux
 * bots, 5 min laissaient un tunnel en fin de manche une fois les questions
 * posées — une table solo part donc sur 3 min, sauf choix explicite de
 * l'hôte au lobby, qui prime toujours. Les tables à plusieurs humains gardent
 * 5 min par défaut.
 */

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: { update: updateMock } } }))

import { launchEspionRoom } from './online-espion'
import { ESPION_DEFAULT_DISCUSSION_MS } from './espion/engine'

const members = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ userId: `p${i + 1}`, user: { displayName: `Joueur ${i + 1}` } }))

type LaunchedState = { discussionMs: number; roundsToWin: number; players: { id: string; isBot: boolean }[] }

const launched = (): LaunchedState => JSON.parse(updateMock.mock.calls.at(-1)?.[0].data.gameStateJson)

beforeEach(() => {
  updateMock.mockReset()
  updateMock.mockResolvedValue({})
})

describe('launchEspionRoom — durée de la discussion', () => {
  it('un humain + 4 bots (« Essayer avec des bots »), sans choix : 3 min', async () => {
    await launchEspionRoom('room-1', { settingsJson: JSON.stringify({ botsCount: 4 }), members: members(1) })

    const state = launched()
    expect(state.players.filter((p) => !p.isBot)).toHaveLength(1)
    expect(state.players.filter((p) => p.isBot)).toHaveLength(4)
    expect(state.discussionMs).toBe(180_000)
    expect(updateMock.mock.calls[0][0].data.status).toBe('playing')
  })

  it('un humain seul sans réglage du tout (salle neuve) : 3 min aussi', async () => {
    await launchEspionRoom('room-1', { settingsJson: null, members: members(1) })
    expect(launched().discussionMs).toBe(180_000)
  })

  it("un humain seul mais l'hôte a choisi 7 min : 7 min", async () => {
    await launchEspionRoom('room-1', {
      settingsJson: JSON.stringify({ botsCount: 4, espionDiscussionMin: 7 }),
      members: members(1),
    })
    expect(launched().discussionMs).toBe(420_000)
  })

  it("un humain seul qui a choisi explicitement 5 min : 5 min, pas 3", async () => {
    await launchEspionRoom('room-1', {
      settingsJson: JSON.stringify({ botsCount: 4, espionDiscussionMin: 5 }),
      members: members(1),
    })
    expect(launched().discussionMs).toBe(300_000)
  })

  it('deux humains + bots, sans choix : la durée par défaut (5 min)', async () => {
    await launchEspionRoom('room-1', { settingsJson: JSON.stringify({ botsCount: 2 }), members: members(2) })
    expect(launched().discussionMs).toBe(ESPION_DEFAULT_DISCUSSION_MS)
  })

  it('table de 5 humains avec un choix à 3 min : 3 min, et les manches à gagner suivent le réglage', async () => {
    await launchEspionRoom('room-1', {
      settingsJson: JSON.stringify({ espionDiscussionMin: 3, espionRoundsToWin: 5 }),
      members: members(5),
    })
    const state = launched()
    expect(state.discussionMs).toBe(180_000)
    expect(state.roundsToWin).toBe(5)
  })
})
