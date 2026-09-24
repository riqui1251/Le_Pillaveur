import { describe, expect, it } from 'vitest'
import { GAMES, type GameMeta } from './games'
import { COLLECTION_SLUGS, LARGE_GROUP_MIN_PLAYERS, gamesInCollection, isCollectionSlug } from './collections'

/**
 * Les collections sont des filtres sur le registre : on vérifie le critère de
 * chacune sur un registre factice (chaque champ isolé), puis les invariants
 * sur le VRAI registre — aucune collection vide, aucun jeu masqué, et les
 * slugs figés (contrat avec le sitemap et les alternates).
 */

function game(overrides: Partial<GameMeta> & { id: string }): GameMeta {
  return {
    title: overrides.id,
    description: 'x',
    path: `/games/${overrides.id}`,
    emoji: '🎲',
    gradient: '',
    fallbackColor: '#000',
    ...overrides,
  }
}

const FAKE: GameMeta[] = [
  game({ id: 'local-2', localMinPlayers: 2 }),
  game({ id: 'local-3', localMinPlayers: 3 }),
  game({ id: 'online-2', onlineReady: true, minPlayers: 2, maxPlayers: 6 }),
  game({ id: 'online-3-bots', onlineReady: true, minPlayers: 3, maxPlayers: 16, botsFillable: true }),
  game({ id: 'online-soft', onlineReady: true, minPlayers: 4, maxPlayers: 8, softModeReady: true }),
  game({ id: 'bots-sans-online', botsFillable: true }),
  game({ id: 'grand-groupe', onlineReady: true, minPlayers: 4, maxPlayers: LARGE_GROUP_MIN_PLAYERS }),
  game({ id: 'masque', hidden: true, localMinPlayers: 2, onlineReady: true, minPlayers: 2, maxPlayers: 16, botsFillable: true, softModeReady: true }),
]

const ids = (games: GameMeta[]) => games.map((g) => g.id)

describe('critères des collections (registre factice)', () => {
  it('« à 2 joueurs » : minimum en ligne OU minimum local ≤ 2', () => {
    expect(ids(gamesInCollection('a-2-joueurs', FAKE))).toEqual(['local-2', 'online-2'])
  })

  it('« sans alcool » : le mode Soft seul compte', () => {
    expect(ids(gamesInCollection('sans-alcool', FAKE))).toEqual(['online-soft'])
  })

  it('« seul avec des bots » : bots ET jeu en ligne', () => {
    expect(ids(gamesInCollection('seul-avec-des-bots', FAKE))).toEqual(['online-3-bots'])
  })

  it(`« en grand groupe » : plafond en ligne ≥ ${LARGE_GROUP_MIN_PLAYERS}`, () => {
    expect(ids(gamesInCollection('en-grand-groupe', FAKE))).toEqual(['online-3-bots', 'grand-groupe'])
  })

  it('écarte les jeux masqués de toutes les collections', () => {
    for (const slug of COLLECTION_SLUGS) {
      expect(ids(gamesInCollection(slug, FAKE))).not.toContain('masque')
    }
  })

  it("garde l'ordre du registre", () => {
    const reversed = [...FAKE].reverse()
    expect(ids(gamesInCollection('a-2-joueurs', reversed))).toEqual(['online-2', 'local-2'])
  })
})

describe('collections sur le vrai registre', () => {
  it('les slugs sont figés (contrat sitemap / hreflang)', () => {
    expect([...COLLECTION_SLUGS]).toEqual(['a-2-joueurs', 'sans-alcool', 'seul-avec-des-bots', 'en-grand-groupe'])
    expect(isCollectionSlug('sans-alcool')).toBe(true)
    expect(isCollectionSlug('sans-alcool/')).toBe(false)
    expect(isCollectionSlug('a-deux')).toBe(false)
  })

  it('aucune collection n’est vide, aucune ne contient de jeu masqué', () => {
    for (const slug of COLLECTION_SLUGS) {
      const games = gamesInCollection(slug)
      expect(games.length, slug).toBeGreaterThan(0)
      expect(games.some((g) => g.hidden), slug).toBe(false)
    }
  })

  it('les cinq jeux passe-et-joue sont « à 2 joueurs » par leur borne locale', () => {
    const twoPlayers = ids(gamesInCollection('a-2-joueurs'))
    for (const id of ['monsieur-3', 'pmu', 'hi-lo', 'pyramide', 'plinko']) {
      const game = GAMES.find((g) => g.id === id)
      expect(game?.localMinPlayers, id).toBe(2)
      expect(twoPlayers, id).toContain(id)
    }
  })

  it('« seul avec des bots » = exactement les jeux que le filtre ?solo=1 du hub affiche', () => {
    // Même définition que GamesGrid (botsFillable && onlineReady, hors masqués) :
    // la collection et le funnel « jouer seul » doivent promettre la même liste.
    const expected = GAMES.filter((g) => !g.hidden && g.botsFillable && g.onlineReady).map((g) => g.id)
    expect(ids(gamesInCollection('seul-avec-des-bots'))).toEqual(expected)
  })
})
