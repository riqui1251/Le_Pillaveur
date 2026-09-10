import { describe, expect, it, vi } from 'vitest'

// `summarizeLiveGames` est pure, mais le module importe prisma (et sa chaîne
// d'adaptateurs) au chargement : on le neutralise pour tester la seule règle
// métier — ce qui a le droit de sortir du serveur, et ce qui ne compte que.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { summarizeLiveGames, type LiveRoomRow } from '@/lib/online-room'

const NOW = new Date('2026-09-10T12:00:00Z').getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)

/** Salle candidate par défaut : publique, en jeu, avec son détail chargé. */
const room = (over: Partial<LiveRoomRow> = {}): LiveRoomRow => ({
  id: 'r1',
  gameId: 'menteur',
  status: 'playing',
  visibility: 'public',
  createdAt: minutesAgo(3),
  detail: { names: ['Alice', 'Bob'], playerCount: 2 },
  ...over,
})

describe('summarizeLiveGames', () => {
  it('détaille une table publique en cours', () => {
    const { liveGames, liveGamesTotal } = summarizeLiveGames([room()], NOW)
    expect(liveGamesTotal).toBe(1)
    expect(liveGames).toEqual([
      {
        id: 'r1',
        gameId: 'menteur',
        playerNames: ['Alice', 'Bob'],
        playerCount: 2,
        openedAgoMinutes: 3,
      },
    ])
  })

  it('ne laisse RIEN fuir d’une table privée ou sur invitation, mais la compte', () => {
    const rows = [
      room({ id: 'pub', visibility: 'public' }),
      room({ id: 'priv', visibility: 'private', gameId: 'president' }),
      room({ id: 'inv', visibility: 'invite', gameId: 'quiz' }),
    ]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)

    expect(liveGamesTotal).toBe(3)
    expect(liveGames.map((g) => g.id)).toEqual(['pub'])
    // Ni pseudo, ni jeu, ni identifiant des tables non publiques.
    const leaked = JSON.stringify(liveGames)
    expect(leaked).not.toContain('priv')
    expect(leaked).not.toContain('inv')
    expect(leaked).not.toContain('president')
    expect(leaked).not.toContain('quiz')
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

  it('ne détaille pas une table publique dont les joueurs n’ont pas été chargés', () => {
    // Garde de coût : le détail est chargé pour un sous-ensemble borné de
    // salles ; celles qui débordent restent dans le total, sans détail.
    const rows = [room({ id: 'sansDetail', detail: undefined }), room({ id: 'avecDetail' })]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)
    expect(liveGamesTotal).toBe(2)
    expect(liveGames.map((g) => g.id)).toEqual(['avecDetail'])
  })
})
