import { describe, expect, it } from 'vitest'
import { GAMES, hasContentIn, type GameMeta } from '@/lib/games'
import { POPULAR_LIMIT, isGameListed, isPlayableIn } from '@/lib/game-catalog'
import { buildPopularRow, orderLandingGames } from './popular-row'

function game(overrides: Partial<GameMeta> & { id: string }): GameMeta {
  return {
    title: overrides.id,
    description: 'x',
    path: `/games/${overrides.id}`,
    emoji: '🎲',
    gradient: '',
    fallbackColor: '#000',
    difficulty: 1,
    ...overrides,
  }
}

const ids = (games: readonly GameMeta[]) => games.map((g) => g.id)

const FAKE: GameMeta[] = [
  game({ id: 'a', onlineReady: true }),
  game({ id: 'b', onlineReady: true, featured: true }),
  game({ id: 'c', onlineReady: true, featured: true, contentLangs: ['fr'] }),
  game({ id: 'd' }),
  game({ id: 'e', onlineReady: true, onlineOnly: true }),
  game({ id: 'f', onlineReady: true, hidden: true }),
  game({ id: 'g', onlineReady: true }),
]

describe('buildPopularRow', () => {
  it("suit l'ordre de popularité du serveur, sans dépasser la limite", () => {
    const row = buildPopularRow({
      candidates: FAKE,
      popularIds: ['g', 'a', 'b', 'd', 'c'],
      hiddenIds: [],
      mode: 'online',
      locale: 'fr',
      limit: 3,
    })
    expect(ids(row.games)).toEqual(['g', 'a', 'b'])
    expect(row.ranked).toBe(true)
  })

  it('écarte un jeu caché par l’équipe, retiré du code, ou hors du mode', () => {
    const online = buildPopularRow({
      candidates: FAKE,
      popularIds: ['f', 'a', 'd', 'b'],
      hiddenIds: ['a'],
      mode: 'online',
      locale: 'fr',
    })
    // f : retiré du code ; a : caché par l'équipe ; d : pas de table en ligne.
    expect(ids(online.games)).toEqual(['b'])
    expect(online.ranked).toBe(true)

    const local = buildPopularRow({
      candidates: FAKE,
      popularIds: ['e', 'd', 'a'],
      hiddenIds: [],
      mode: 'local',
      locale: 'fr',
    })
    // e : réservé au multi-écrans, absent d'un mode local.
    expect(ids(local.games)).toEqual(['d', 'a'])
  })

  it("ne ressort jamais un jeu que la page écarte (candidats déjà filtrés, langue sans cartes)", () => {
    const row = buildPopularRow({
      candidates: FAKE.filter((g) => g.id !== 'b'),
      popularIds: ['b', 'c', 'a'],
      hiddenIds: [],
      mode: 'online',
      locale: 'en',
    })
    // b : filtré par la page (ex. Sans alcool) ; c : cartes en français seulement.
    expect(ids(row.games)).toEqual(['a'])
    expect(row.ranked).toBe(true)
  })

  it('ignore les doublons et les ids inconnus', () => {
    const row = buildPopularRow({
      candidates: FAKE,
      popularIds: ['a', 'a', 'zzz', 'b'],
      hiddenIds: [],
      mode: 'online',
      locale: 'fr',
    })
    expect(ids(row.games)).toEqual(['a', 'b'])
  })

  it('un seul jeu classé ne se complète pas avec des phares', () => {
    const row = buildPopularRow({ candidates: FAKE, popularIds: ['a'], hiddenIds: [], mode: 'online', locale: 'fr' })
    expect(ids(row.games)).toEqual(['a'])
    expect(row.ranked).toBe(true)
  })

  it('se replie sur les jeux phares, non classés, quand le serveur ne dit rien (catalogue pas encore lu)', () => {
    const row = buildPopularRow({ candidates: FAKE, popularIds: [], hiddenIds: [], mode: 'online', locale: 'fr' })
    expect(ids(row.games)).toEqual(['b', 'c'])
    expect(row.ranked).toBe(false)
  })

  it('se replie aussi, non classé, quand le filtre vide la liste du serveur', () => {
    const row = buildPopularRow({ candidates: FAKE, popularIds: ['f', 'e'], hiddenIds: [], mode: 'local', locale: 'fr' })
    expect(ids(row.games)).toEqual(['b', 'c'])
    expect(row.ranked).toBe(false)
  })

  it('sans phare à montrer, la rangée est vide : jamais les premiers jeux du catalogue', () => {
    const row = buildPopularRow({
      candidates: FAKE.filter((g) => !g.featured),
      popularIds: [],
      hiddenIds: [],
      mode: 'online',
      locale: 'fr',
      limit: 2,
    })
    expect(row.games).toEqual([])
    expect(row.ranked).toBe(false)
  })

  it('reste vide s’il n’existe aucun jeu à montrer', () => {
    expect(buildPopularRow({ candidates: [], popularIds: ['a'], hiddenIds: [], mode: 'online', locale: 'fr' })).toEqual({
      games: [],
      ranked: false,
    })
  })
})

describe('buildPopularRow sur le vrai registre', () => {
  for (const mode of ['local', 'online'] as const) {
    for (const locale of ['fr', 'en', 'es', 'it']) {
      it(`${mode}/${locale} : repli sur les phares seulement, jamais plus de ${POPULAR_LIMIT} jeux, que des jeux listés et jouables`, () => {
        const row = buildPopularRow({ candidates: GAMES, popularIds: [], hiddenIds: [], mode, locale })
        expect(row.ranked).toBe(false)
        // Les phares du code sont tous réservés au multi-écrans : en local, la rangée reste vide.
        if (mode === 'online' && locale === 'fr') expect(row.games.length).toBeGreaterThan(0)
        expect(row.games.length).toBeLessThanOrEqual(POPULAR_LIMIT)
        for (const g of row.games) {
          expect(g.featured).toBe(true)
          expect(isGameListed(g, [])).toBe(true)
          expect(isPlayableIn(g, mode)).toBe(true)
          expect(hasContentIn(g, locale)).toBe(true)
        }
      })
    }
  }

  it('cacher tous les jeux phares vide la rangée au lieu de la remplir de jeux sans partie', () => {
    const featuredIds = GAMES.filter((g) => g.featured).map((g) => g.id)
    const row = buildPopularRow({ candidates: GAMES, popularIds: [], hiddenIds: featuredIds, mode: 'online', locale: 'fr' })
    expect(row).toEqual({ games: [], ranked: false })
  })
})

describe('orderLandingGames', () => {
  const popular = { local: ['d', 'a'], online: ['a', 'b'] }
  const none = { local: [], online: [] }

  it('écarte les jeux cachés, met les jeux populaires en tête (local puis en ligne, sans doublon)', () => {
    const { games, highlightedIds, ranked } = orderLandingGames({ games: FAKE, hiddenIds: ['g'], popular, fallback: none })
    expect(ids(games)).toEqual(['d', 'a', 'b', 'c', 'e'])
    expect([...highlightedIds]).toEqual(['d', 'a', 'b'])
    expect(ranked).toBe(true)
  })

  it('un jeu populaire caché depuis ne reste ni en tête ni dans la grille', () => {
    const { games, highlightedIds } = orderLandingGames({ games: FAKE, hiddenIds: ['a', 'd'], popular, fallback: none })
    expect(ids(games)).toEqual(['b', 'c', 'e', 'g'])
    expect([...highlightedIds]).toEqual(['b'])
  })

  it('serveur muet : les jeux phares du fallback font la mise en avant, sans passer pour classés', () => {
    const { games, highlightedIds, ranked } = orderLandingGames({
      games: FAKE,
      hiddenIds: [],
      popular: none,
      fallback: { local: ['c'], online: ['b', 'c'] },
    })
    expect(ids(games).slice(0, 2)).toEqual(['c', 'b'])
    expect(highlightedIds.has('c') && highlightedIds.has('b')).toBe(true)
    expect(ranked).toBe(false)
  })

  it('un classement présent écarte le fallback : la pastille « Populaire » reste réservée aux jeux classés', () => {
    const { highlightedIds, ranked } = orderLandingGames({
      games: FAKE,
      hiddenIds: [],
      popular: { local: ['a'], online: [] },
      fallback: { local: ['c'], online: ['b'] },
    })
    expect([...highlightedIds]).toEqual(['a'])
    expect(ranked).toBe(true)
  })

  it('ne met en avant aucun jeu caché ou retiré du code', () => {
    const { games, highlightedIds, ranked } = orderLandingGames({
      games: FAKE,
      hiddenIds: [],
      popular: { local: ['f'], online: [] },
      fallback: none,
    })
    expect(highlightedIds.size).toBe(0)
    expect(ranked).toBe(false)
    expect(ids(games)).not.toContain('f')
  })
})
