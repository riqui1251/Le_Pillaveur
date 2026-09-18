import { describe, expect, it, vi } from 'vitest'

// `summarizeLiveGames` est pure, mais le module importe prisma (et sa chaîne
// d'adaptateurs) au chargement : on le neutralise pour tester la seule règle
// métier — ce qui a le droit de sortir du serveur, et ce qui ne compte que.
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { summarizeLiveGames, type LiveRoomRow } from '@/lib/online-room'

const NOW = new Date('2026-09-10T12:00:00Z').getTime()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)

/** Salle candidate par défaut : publique, en jeu, avec ses pseudos chargés. */
const room = (over: Partial<LiveRoomRow> = {}): LiveRoomRow => ({
  id: 'r1',
  gameId: 'menteur',
  status: 'playing',
  visibility: 'public',
  createdAt: minutesAgo(3),
  playerCount: 2,
  names: ['Alice', 'Bob'],
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
        isPrivate: false,
        playerNames: ['Alice', 'Bob'],
        playerCount: 2,
        openedAgoMinutes: 3,
      },
    ])
  })

  it('annonce le jeu d’une table privée ou sur invitation, JAMAIS ses pseudos', () => {
    const rows = [
      room({ id: 'pub', visibility: 'public' }),
      room({ id: 'priv', visibility: 'private', gameId: 'president', playerCount: 6 }),
      // Cas du serveur prudent qui aurait quand même chargé des pseudos :
      // la visibilité décide, pas l'appelant.
      room({ id: 'inv', visibility: 'invite', gameId: 'quiz', names: ['Chloé'] }),
    ]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)

    expect(liveGamesTotal).toBe(3)
    expect(liveGames.map((g) => g.id).sort()).toEqual(['inv', 'priv', 'pub'])
    expect(liveGames.filter((g) => g.isPrivate).map((g) => g.gameId).sort()).toEqual([
      'president',
      'quiz',
    ])
    // L'effectif d'une table fermée sort (c'est un nombre), ses pseudos non.
    expect(liveGames.find((g) => g.id === 'priv')).toMatchObject({
      playerCount: 6,
      playerNames: [],
    })
    expect(JSON.stringify(liveGames)).not.toContain('Chloé')
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

  it('affiche une table publique dont les pseudos n’ont pas été chargés, sans pseudo', () => {
    // Garde de coût : les pseudos ne sont chargés que pour un sous-ensemble
    // borné de salles ; celles qui débordent gardent leur jeu et leur effectif.
    const rows = [room({ id: 'sansNoms', names: undefined }), room({ id: 'avecNoms' })]
    const { liveGames, liveGamesTotal } = summarizeLiveGames(rows, NOW)
    expect(liveGamesTotal).toBe(2)
    expect(liveGames.map((g) => g.id).sort()).toEqual(['avecNoms', 'sansNoms'])
    expect(liveGames.find((g) => g.id === 'sansNoms')).toMatchObject({
      playerNames: [],
      playerCount: 2,
    })
  })
})
