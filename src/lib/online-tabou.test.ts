import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Lanceur du Tabou Vocal : le jeu ne se complète plus par des bots, et un
 * botsCount resté dans les réglages (un PUT /settings l'accepte pour tout jeu)
 * ne doit pas en asseoir au-delà des humains. Seule exception, contrainte du
 * moteur : une équipe sous 2 est comblée — filet de sécurité, lancement et
 * relance refusant déjà une telle table (tabouHasTwoHumansPerTeam).
 */

const { updateMock } = vi.hoisted(() => ({ updateMock: vi.fn() }))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: { update: updateMock } } }))

import { launchTabouRoom, tabouHasTwoHumansPerTeam } from './online-tabou'

type SeatedPlayer = { id: string; team: 'A' | 'B'; isBot: boolean }

const members = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ userId: `p${i + 1}`, user: { displayName: `Joueur ${i + 1}` } }))

const launchedPlayers = (): SeatedPlayer[] =>
  JSON.parse(updateMock.mock.calls.at(-1)?.[0].data.gameStateJson).players

beforeEach(() => {
  updateMock.mockReset()
  updateMock.mockResolvedValue({})
})

describe('tabouHasTwoHumansPerTeam', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, i) => `p${i + 1}`)

  it('2 contre 2 humains : table valide', () => {
    expect(tabouHasTwoHumansPerTeam(ids(4), JSON.stringify({ tabouTeams: { p1: 'A', p2: 'A', p3: 'B', p4: 'B' } }))).toBe(true)
  })

  it('3 humains : une équipe n en compte qu un, table refusée', () => {
    expect(tabouHasTwoHumansPerTeam(ids(3), null)).toBe(false)
  })

  it('4 humains tous en A : la répartition du lancement les ramène à 4 contre 0, refusée', () => {
    expect(tabouHasTwoHumansPerTeam(ids(4), JSON.stringify({ tabouTeams: { p1: 'A', p2: 'A', p3: 'A', p4: 'A' } }))).toBe(false)
  })
})

describe('launchTabouRoom', () => {
  it('ignore le botsCount des réglages : 2 contre 2 humains, aucun bot', async () => {
    await launchTabouRoom('room-1', {
      settingsJson: JSON.stringify({ lang: 'fr', botsCount: 6, tabouTeams: { p1: 'A', p2: 'A', p3: 'B', p4: 'B' } }),
      members: members(4),
    })

    const players = launchedPlayers()
    expect(players).toHaveLength(4)
    expect(players.filter((p) => p.isBot)).toEqual([])
    expect(updateMock.mock.calls[0][0].data.status).toBe('playing')
  })

  it('comble seulement une équipe sous 2 (filet de sécurité du moteur)', async () => {
    await launchTabouRoom('room-1', {
      settingsJson: JSON.stringify({ lang: 'fr', botsCount: 6, tabouTeams: { p1: 'A', p2: 'A', p3: 'B' } }),
      members: members(3),
    })

    const bots = launchedPlayers().filter((p) => p.isBot)
    expect(bots).toHaveLength(1)
    expect(bots[0].team).toBe('B')
  })
})
