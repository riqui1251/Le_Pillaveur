import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import {
  EMPTY_GAME_CATALOG,
  POPULAR_LIMIT,
  STAFF_TOGGLEABLE_GAME_IDS,
  isGameListed,
  isPlayableIn,
  parseGameCatalogState,
  parseHiddenGameIds,
  featuredGameIds,
  rankPopularGames,
  totalPlays,
} from './game-catalog'

const retired = GAMES.find((g) => g.hidden)!
const localOnly = GAMES.find((g) => !g.hidden && !g.onlineReady)!
const onlineAndLocal = GAMES.filter((g) => !g.hidden && g.onlineReady && !g.onlineOnly)
const onlineOnly = GAMES.find((g) => !g.hidden && g.onlineOnly)

describe('STAFF_TOGGLEABLE_GAME_IDS', () => {
  it("ne contient que des jeux que le code n'a pas retirés, dans l'ordre du catalogue", () => {
    expect(STAFF_TOGGLEABLE_GAME_IDS).toEqual(GAMES.filter((g) => !g.hidden).map((g) => g.id))
    expect(STAFF_TOGGLEABLE_GAME_IDS).not.toContain(retired.id)
  })
})

describe('parseHiddenGameIds', () => {
  const [a, b, c] = STAFF_TOGGLEABLE_GAME_IDS

  it("lit un texte JSON ou un tableau, sans doublon, dans l'ordre du catalogue", () => {
    expect(parseHiddenGameIds(JSON.stringify([c, a, a]))).toEqual([a, c])
    expect(parseHiddenGameIds([b, a])).toEqual([a, b])
  })

  it('écarte les ids inconnus, retirés du code ou mal typés', () => {
    expect(parseHiddenGameIds(JSON.stringify(['nope', retired.id, 7, null, a]))).toEqual([a])
  })

  it('rend une liste vide pour une valeur illisible', () => {
    for (const raw of ['{pas du json', '"texte"', '{"a":1}', 'null', null, undefined, 42]) {
      expect(parseHiddenGameIds(raw), String(raw)).toEqual([])
    }
  })
})

describe('isGameListed / isPlayableIn', () => {
  it("un jeu caché par l'équipe ou retiré du code n'est pas listé", () => {
    const [id] = STAFF_TOGGLEABLE_GAME_IDS
    expect(isGameListed({ id, hidden: false }, [])).toBe(true)
    expect(isGameListed({ id, hidden: false }, [id])).toBe(false)
    expect(isGameListed({ id, hidden: true }, [])).toBe(false)
  })

  it('en ligne = écran en ligne ; local = pas réservé au multi-écrans', () => {
    expect(isPlayableIn({ onlineReady: true }, 'online')).toBe(true)
    expect(isPlayableIn({}, 'online')).toBe(false)
    expect(isPlayableIn({ onlineOnly: true, onlineReady: true }, 'local')).toBe(false)
    expect(isPlayableIn({}, 'local')).toBe(true)
  })
})

describe('totalPlays', () => {
  it('additionne en ligne et local, jamais de négatif, 0 pour un jeu absent', () => {
    expect(totalPlays({ x: { online: 3, local: 4 } }, 'x')).toBe(7)
    expect(totalPlays({ x: { online: -3, local: 4 } }, 'x')).toBe(4)
    expect(totalPlays({}, 'x')).toBe(0)
  })
})

describe('rankPopularGames', () => {
  it('classe du plus joué au moins joué, borné par la limite', () => {
    const [first, second, third] = onlineAndLocal.map((g) => g.id)
    const counts = {
      [first]: { online: 1, local: 1 },
      [second]: { online: 5, local: 5 },
      [third]: { online: 3, local: 0 },
    }
    expect(rankPopularGames(counts, [], 'local', 3)).toEqual([second, third, first])
    expect(rankPopularGames(counts, [], 'local', 1)).toEqual([second])
  })

  it("départage une égalité par l'ordre du catalogue", () => {
    const [first, second] = onlineAndLocal.map((g) => g.id)
    const counts = { [second]: { online: 2, local: 0 }, [first]: { online: 0, local: 2 } }
    expect(rankPopularGames(counts, [], 'local', 2)).toEqual([first, second])
  })

  it('écarte les jeux cachés, retirés du code et injouables dans le mode', () => {
    const [first] = onlineAndLocal.map((g) => g.id)
    const counts = {
      [first]: { online: 9, local: 9 },
      [retired.id]: { online: 99, local: 99 },
      [localOnly.id]: { online: 50, local: 50 },
    }
    expect(rankPopularGames(counts, [first], 'online')).not.toContain(first)
    expect(rankPopularGames(counts, [], 'online')).not.toContain(retired.id)
    expect(rankPopularGames(counts, [], 'online')).not.toContain(localOnly.id)
    expect(rankPopularGames(counts, [], 'local')).toContain(localOnly.id)
    if (onlineOnly) {
      expect(rankPopularGames({ [onlineOnly.id]: { online: 9, local: 9 } }, [], 'local')).not.toContain(onlineOnly.id)
    }
  })

  it('sans aucune partie, ne présente aucun jeu comme populaire', () => {
    expect(rankPopularGames({}, [], 'online')).toEqual([])
    expect(rankPopularGames({}, [], 'local')).toEqual([])
  })

  it('ne complète pas avec les jeux phares : un seul jeu joué = une rangée d’un jeu', () => {
    const played = onlineAndLocal.find((g) => !g.featured)!.id
    expect(rankPopularGames({ [played]: { online: 1, local: 0 } }, [], 'online')).toEqual([played])
    expect(rankPopularGames({ [played]: { online: 0, local: 1 } }, [], 'online')).toEqual([played])
  })

  it('un jeu joué mais caché ne laisse aucun phare prendre sa place', () => {
    const [first] = onlineAndLocal.map((g) => g.id)
    expect(rankPopularGames({ [first]: { online: 9, local: 0 } }, [first], 'online')).toEqual([])
  })

  it('ne dépasse jamais la limite', () => {
    const counts = Object.fromEntries(onlineAndLocal.map((g) => [g.id, { online: 1, local: 0 }]))
    expect(rankPopularGames(counts, [], 'online').length).toBeLessThanOrEqual(POPULAR_LIMIT)
  })
})

describe('featuredGameIds', () => {
  it('ne rend que des phares listés et jouables dans le mode', () => {
    for (const mode of ['local', 'online'] as const) {
      for (const id of featuredGameIds([], mode)) {
        const game = GAMES.find((g) => g.id === id)!
        expect(game.featured).toBe(true)
        expect(game.hidden).toBeFalsy()
        expect(isPlayableIn(game, mode)).toBe(true)
      }
    }
    expect(featuredGameIds([], 'online').length).toBeGreaterThan(0)
  })

  it('écarte un phare caché par l’équipe', () => {
    const [first] = featuredGameIds([], 'online')
    expect(featuredGameIds([first], 'online')).not.toContain(first)
  })
})

describe('parseGameCatalogState', () => {
  const [a, b] = STAFF_TOGGLEABLE_GAME_IDS

  it('relit une réponse valide en filtrant les ids inconnus', () => {
    expect(
      parseGameCatalogState({ hiddenIds: [b, 'nope'], popular: { local: [a, 'nope', 3], online: [b] } })
    ).toEqual({ hiddenIds: [b], popular: { local: [a], online: [b] } })
  })

  it('rend null pour une forme illisible', () => {
    const bodies = [null, 'x', [], {}, { hiddenIds: 'a', popular: {} }, { hiddenIds: [], popular: [] }, { hiddenIds: [] }]
    for (const body of bodies) {
      expect(parseGameCatalogState(body), JSON.stringify(body)).toBeNull()
    }
  })

  it('EMPTY_GAME_CATALOG est lisible tel quel', () => {
    expect(parseGameCatalogState(EMPTY_GAME_CATALOG)).toEqual(EMPTY_GAME_CATALOG)
  })
})
