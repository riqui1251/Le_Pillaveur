import { describe, expect, it } from 'vitest'
import { GAMES, hasContentIn, type GameMeta } from '@/lib/games'
import { FEATURED_LIMIT, POPULAR_LIMIT, POPULAR_RANKED_LIMIT, isGameListed, isPlayableIn } from '@/lib/game-catalog'
import { buildFeaturedRow, buildPopularRow, orderLandingGames } from './popular-row'

function game(overrides: Partial<GameMeta> & { id: string }): GameMeta {
  return {
    title: overrides.id,
    description: 'x',
    path: `/games/${overrides.id}`,
    emoji: '🎲',
    gradient: '',
    fallbackColor: '#000',
    difficulty: 1,
    drinkLevel: 2,
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

describe('buildPopularRow : jeux déjà à la une', () => {
  it('ne répète pas un jeu exclu et laisse la place au suivant', () => {
    const row = buildPopularRow({
      candidates: FAKE,
      popularIds: ['a', 'b', 'g'],
      hiddenIds: [],
      mode: 'online',
      locale: 'fr',
      limit: 2,
      excludeIds: ['a'],
    })
    expect(ids(row.games)).toEqual(['b', 'g'])
    expect(row.ranked).toBe(true)
  })

  it('avec le classement du serveur (POPULAR_RANKED_LIMIT ids), la rangée garde POPULAR_LIMIT jeux même si tous les jeux à la une sont populaires', () => {
    const many = Array.from({ length: POPULAR_RANKED_LIMIT }, (_, i) => game({ id: `p${i}`, onlineReady: true }))
    const featured = many.slice(0, FEATURED_LIMIT).map((g) => g.id)
    const row = buildPopularRow({
      candidates: many,
      popularIds: ids(many),
      hiddenIds: [],
      mode: 'online',
      locale: 'fr',
      excludeIds: featured,
    })
    expect(ids(row.games)).toEqual(ids(many.slice(FEATURED_LIMIT)))
    expect(row.games).toHaveLength(POPULAR_LIMIT)
    expect(row.ranked).toBe(true)
  })

  it('le repli sur les phares n’y répète pas non plus les jeux à la une', () => {
    const row = buildPopularRow({ candidates: FAKE, popularIds: [], hiddenIds: [], mode: 'online', locale: 'fr', excludeIds: ['b'] })
    expect(ids(row.games)).toEqual(['c'])
    const all = buildPopularRow({ candidates: FAKE, popularIds: [], hiddenIds: [], mode: 'online', locale: 'fr', excludeIds: ['b', 'c'] })
    expect(all.games).toEqual([])
  })
})

describe('buildFeaturedRow', () => {
  const row = (featuredIds: string[], extra: Partial<Parameters<typeof buildFeaturedRow<GameMeta>>[0]> = {}) =>
    ids(buildFeaturedRow({ candidates: FAKE, featuredIds, hiddenIds: [], mode: 'online', locale: 'fr', ...extra }))

  it('suit l’ordre de mise à la une de l’équipe, pas celui du catalogue ni du classement', () => {
    expect(row(['g', 'a', 'b'])).toEqual(['g', 'a', 'b'])
  })

  it('rien à la une : pas de rangée', () => {
    expect(row([])).toEqual([])
  })

  it('applique les mêmes filtres que « Les plus joués » : caché, retiré du code, hors du mode, hors de la langue', () => {
    // a : caché par l'équipe ; f : retiré du code ; d : pas de table en ligne ; c : cartes en français seulement.
    expect(row(['a', 'f', 'd', 'g'], { hiddenIds: ['a'] })).toEqual(['g'])
    expect(row(['c', 'g'], { locale: 'en' })).toEqual(['g'])
    expect(row(['e', 'd', 'a'], { mode: 'local' })).toEqual(['d', 'a'])
  })

  it('ne ressort pas un jeu que la page écarte déjà (candidats filtrés par la recherche ou le mode Sans alcool)', () => {
    expect(ids(buildFeaturedRow({ candidates: FAKE.filter((g) => g.id !== 'b'), featuredIds: ['b', 'a'], hiddenIds: [], mode: 'online', locale: 'fr' }))).toEqual(['a'])
  })

  it('ignore les doublons et les ids inconnus, et ne dépasse pas la limite', () => {
    expect(row(['a', 'a', 'zzz', 'b'])).toEqual(['a', 'b'])
    expect(row(['a', 'b', 'g'], { limit: 2 })).toEqual(['a', 'b'])
    expect(FEATURED_LIMIT).toBeGreaterThanOrEqual(POPULAR_LIMIT)
  })

  it('une rangée à la une et une rangée « les plus joués » ne partagent aucun jeu', () => {
    const featured = buildFeaturedRow({ candidates: FAKE, featuredIds: ['a', 'g'], hiddenIds: [], mode: 'online', locale: 'fr' })
    const popular = buildPopularRow({
      candidates: FAKE,
      popularIds: ['a', 'b', 'g', 'c'],
      hiddenIds: [],
      mode: 'online',
      locale: 'fr',
      excludeIds: ids(featured),
    })
    expect(ids(popular.games)).toEqual(['b', 'c'])
    expect(ids(featured).filter((id) => ids(popular.games).includes(id))).toEqual([])
  })
})

describe('orderLandingGames : jeux à la une', () => {
  const popular = { local: ['d', 'a'], online: ['a', 'b'] }
  const none = { local: [], online: [] }

  it('passent avant les jeux populaires, dans l’ordre de l’équipe, sans doublon', () => {
    const { games, highlightedIds, teamFeaturedIds } = orderLandingGames({
      games: FAKE,
      hiddenIds: [],
      popular,
      fallback: none,
      featuredIds: ['b', 'g', 'b'],
    })
    expect(ids(games)).toEqual(['b', 'g', 'd', 'a', 'c', 'e', 'f'].filter((id) => id !== 'f'))
    expect([...teamFeaturedIds]).toEqual(['b', 'g'])
    // « b » garde sa pastille « À la une » : il n'est pas aussi « populaire ».
    expect([...highlightedIds]).toEqual(['d', 'a'])
  })

  it('écartent un jeu caché ou retiré du code, et se limitent à FEATURED_LIMIT', () => {
    const { games, teamFeaturedIds } = orderLandingGames({
      games: FAKE,
      hiddenIds: ['a'],
      popular: none,
      fallback: none,
      featuredIds: ['a', 'f', 'g'],
    })
    expect([...teamFeaturedIds]).toEqual(['g'])
    expect(ids(games)[0]).toBe('g')
    expect(ids(games)).not.toContain('a')

    const many = Array.from({ length: FEATURED_LIMIT + 3 }, (_, i) => game({ id: `x${i}` }))
    const out = orderLandingGames({ games: many, hiddenIds: [], popular: none, fallback: none, featuredIds: many.map((g) => g.id) })
    expect(out.teamFeaturedIds.size).toBe(FEATURED_LIMIT)
    expect(out.games).toHaveLength(many.length)
  })

  it('les jeux à la une populaires ne vident pas les jeux populaires : coupe à POPULAR_LIMIT après exclusion', () => {
    const many = Array.from({ length: POPULAR_RANKED_LIMIT }, (_, i) => game({ id: `p${i}` }))
    const featuredIds = many.slice(0, FEATURED_LIMIT).map((g) => g.id)
    const { highlightedIds, teamFeaturedIds, ranked } = orderLandingGames({
      games: many,
      hiddenIds: [],
      popular: { local: ids(many), online: ids(many) },
      fallback: none,
      featuredIds,
    })
    expect([...teamFeaturedIds]).toEqual(featuredIds)
    expect([...highlightedIds]).toEqual(ids(many.slice(FEATURED_LIMIT, FEATURED_LIMIT + POPULAR_LIMIT)))
    expect(highlightedIds.size).toBe(POPULAR_LIMIT)
    expect(ranked).toBe(true)
  })

  it('sans mise à la une, rien ne change', () => {
    const base = orderLandingGames({ games: FAKE, hiddenIds: [], popular, fallback: none })
    expect(base.teamFeaturedIds.size).toBe(0)
    expect(ids(base.games)).toEqual(ids(orderLandingGames({ games: FAKE, hiddenIds: [], popular, fallback: none, featuredIds: [] }).games))
  })
})
