import { beforeEach, describe, expect, it, vi } from 'vitest'

// `summarizeLiveGames` est pure, mais le module importe prisma (et sa chaîne
// d'adaptateurs) au chargement : on le neutralise pour tester la seule règle
// métier — ce qui a le droit de sortir du serveur, et ce qui ne compte que.
// La présence, elle, s'observe par l'écriture demandée à la base.
const { memberMock } = vi.hoisted(() => ({
  memberMock: { updateMany: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoomMember: memberMock } }))

import {
  PRESENCE_WRITE_INTERVAL_MS,
  summarizeLiveGames,
  touchMemberPresence,
  type LiveRoomRow,
} from '@/lib/online-room'

const NOW = new Date('2026-09-10T12:00:00Z').getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)

/** Salle candidate par défaut : publique, en jeu, deux joueurs. */
const room = (over: Partial<LiveRoomRow> = {}): LiveRoomRow => ({
  id: 'r1',
  gameId: 'menteur',
  status: 'playing',
  visibility: 'public',
  createdAt: minutesAgo(3),
  playerCount: 2,
  ...over,
})

describe('summarizeLiveGames', () => {
  it('décrit une table publique en cours sans nommer personne', () => {
    const { liveGames, liveGamesTotal } = summarizeLiveGames([room()], NOW)
    expect(liveGamesTotal).toBe(1)
    expect(liveGames).toEqual([
      {
        id: 'r1',
        gameId: 'menteur',
        isPrivate: false,
        playerCount: 2,
        openedAgoMinutes: 3,
      },
    ])
  })

  it('annonce le jeu et l’effectif de toutes les tables, privées comprises', () => {
    const rows = [
      room({ id: 'pub', visibility: 'public' }),
      room({ id: 'priv', visibility: 'private', gameId: 'president', playerCount: 6 }),
      room({ id: 'inv', visibility: 'invite', gameId: 'quiz' }),
    ]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)

    expect(liveGamesTotal).toBe(3)
    expect(liveGames.map((g) => g.id).sort()).toEqual(['inv', 'priv', 'pub'])
    expect(liveGames.filter((g) => g.isPrivate).map((g) => g.gameId).sort()).toEqual([
      'president',
      'quiz',
    ])
    expect(liveGames.find((g) => g.id === 'priv')).toMatchObject({ playerCount: 6 })
  })

  it('ne peut PAS livrer de pseudo : la sortie n’en porte aucun champ', () => {
    // Garde-fou de forme : le guichet dit combien ils sont, jamais qui joue.
    // Une table publique n'y échappe pas — une table ouverte à tous n'est pas
    // une table dont on publie les noms.
    const [item] = summarizeLiveGames([room()], NOW).liveGames
    expect(Object.keys(item).sort()).toEqual([
      'gameId',
      'id',
      'isPrivate',
      'openedAgoMinutes',
      'playerCount',
    ])
  })

  it('exclut les salles « cast » (afficheur TV d’une partie locale)', () => {
    const rows = [room({ id: 'tv', status: 'cast' }), room({ id: 'jeu' })]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)

    expect(liveGamesTotal).toBe(1)
    expect(liveGames.map((g) => g.id)).toEqual(['jeu'])
  })

  it('compte le briefing comme une partie en cours', () => {
    const { liveGames, liveGamesTotal } = summarizeLiveGames([room({ status: 'briefing' })], NOW)
    expect(liveGamesTotal).toBe(1)
    expect(liveGames).toHaveLength(1)
  })

  it('ignore une salle en attente ou sans jeu choisi', () => {
    const rows = [room({ id: 'w', status: 'waiting' }), room({ id: 'nogame', gameId: null })]
    expect(summarizeLiveGames(rows, NOW)).toEqual({ liveGames: [], liveGamesTotal: 0 })
  })

  it('ne rend rien du tout quand personne ne joue', () => {
    // Rien à afficher ⇒ l’interface se tait (pas de « 0 partie en cours »).
    expect(summarizeLiveGames([], NOW)).toEqual({ liveGames: [], liveGamesTotal: 0 })
  })

  it('range la table la plus fraîche en tête', () => {
    const rows = [
      room({ id: 'vieille', createdAt: minutesAgo(40) }),
      room({ id: 'fraiche', createdAt: minutesAgo(1) }),
    ]
    expect(summarizeLiveGames(rows, NOW).liveGames.map((g) => g.id)).toEqual(['fraiche', 'vieille'])
  })

  it('garde une table dont l’effectif est vide (dernier membre parti)', () => {
    const rows = [room({ id: 'vide', playerCount: 0 }), room({ id: 'pleine' })]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)
    expect(liveGamesTotal).toBe(2)
    expect(liveGames.map((g) => g.id).sort()).toEqual(['pleine', 'vide'])
  })
})

describe('touchMemberPresence', () => {
  beforeEach(() => {
    memberMock.updateMany.mockReset()
    memberMock.updateMany.mockResolvedValue({ count: 0 })
  })

  it('ne réécrit la présence que si elle date de plus de 30 s — le filtre est dans le where', async () => {
    // Sondage jusqu'à toutes les 1,5-2 s (flux SSE mort) : sans ce filtre,
    // dix joueurs qui attendent font cinq transactions d'écriture par seconde
    // pour rien. La base tranche elle-même (un UPDATE sans ligne touchée,
    // aucune page écrite) : aucun aller-retour de plus.
    await touchMemberPresence('room-1', 'user-1', NOW)

    expect(PRESENCE_WRITE_INTERVAL_MS).toBe(30_000)
    expect(memberMock.updateMany).toHaveBeenCalledTimes(1)
    expect(memberMock.updateMany).toHaveBeenCalledWith({
      where: {
        roomId: 'room-1',
        userId: 'user-1',
        lastSeenAt: { lt: new Date(NOW - PRESENCE_WRITE_INTERVAL_MS) },
      },
      data: { lastSeenAt: new Date(NOW) },
    })
  })

  it('reste bien sous le seuil de purge le plus court lu sur lastSeenAt', () => {
    // Le plus court est celui des tables « figées » de Supervision (3 min, en
    // attente) ; la purge des tables ouvertes est à 5 min. Une présence en
    // retard d'au plus 30 s + un sondage ne doit jamais déclencher l'un ni l'autre.
    expect(PRESENCE_WRITE_INTERVAL_MS).toBeLessThan(3 * 60_000 / 2)
  })
})
