import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { SOIREE_CANDIDATE_IDS, SOIREE_GAME_IDS } from '@/lib/soiree/catalog'
import { defaultVibesForLevel } from '@/lib/soiree/vibes'
import {
  EMPTY_GAME_CATALOG,
  FEATURED_LIMIT,
  GAME_CATEGORY_LIMITS,
  POPULAR_LIMIT,
  POPULAR_RANKED_LIMIT,
  STAFF_TOGGLEABLE_GAME_IDS,
  categoryName,
  cleanCategoryName,
  gameDifficulty,
  gameDrinkLevel,
  gameVibes,
  isGameCategoryId,
  isGameDrinkLevel,
  isGameListed,
  isPlayableIn,
  normalizeCategoryNames,
  parseDifficultyOverrides,
  parseDrinkLevelOverrides,
  parseFeaturedGameIds,
  parseGameCatalogState,
  parseGameCategories,
  parseHiddenGameIds,
  parseSoireeOverrides,
  parseVibeOverrides,
  VIBE_GAME_IDS,
  featuredGameIds,
  rankPopularGames,
  totalPlays,
} from './game-catalog'

const retired = GAMES.find((g) => g.hidden)!
const codeLevel = (id: string) => GAMES.find((g) => g.id === id)!.difficulty
const otherLevel = (id: string): 1 | 2 | 3 => (codeLevel(id) === 3 ? 1 : ((codeLevel(id) + 1) as 2 | 3))
const codeDrink = (id: string) => GAMES.find((g) => g.id === id)!.drinkLevel
const otherDrink = (id: string): 1 | 2 | 3 => (codeDrink(id) === 3 ? 1 : ((codeDrink(id) + 1) as 2 | 3))
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
    expect(rankPopularGames(counts, [], 'online', POPULAR_RANKED_LIMIT).length).toBe(
      Math.min(POPULAR_RANKED_LIMIT, onlineAndLocal.length)
    )
    expect(POPULAR_RANKED_LIMIT).toBe(POPULAR_LIMIT + FEATURED_LIMIT)
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
    ).toEqual({ hiddenIds: [b], difficulty: {}, drinkLevel: {}, categories: [], vibes: {}, soiree: {}, featured: [], popular: { local: [a], online: [b] } })
  })

  it('le champ difficulty est facultatif : absent ou illisible, il vaut {} sans rendre null', () => {
    const base = { hiddenIds: [], popular: { local: [], online: [] } }
    expect(parseGameCatalogState(base)?.difficulty).toEqual({})
    expect(parseGameCatalogState({ ...base, difficulty: 'dur' })?.difficulty).toEqual({})
    expect(parseGameCatalogState({ ...base, difficulty: [a] })?.difficulty).toEqual({})
  })

  it('relit les difficultés réglées en écartant ce qui est invalide', () => {
    const level = otherLevel(a)
    const state = parseGameCatalogState({
      hiddenIds: [],
      difficulty: { [a]: level, nope: 3, [retired.id]: 3 },
      popular: { local: [], online: [] },
    })
    expect(state?.difficulty).toEqual({ [a]: level })
  })

  it('drinkLevel et categories sont facultatifs : absents ou illisibles, ils valent {} et [] sans rendre null', () => {
    const base = { hiddenIds: [], popular: { local: [], online: [] } }
    const old = parseGameCatalogState(base)
    expect(old?.drinkLevel).toEqual({})
    expect(old?.categories).toEqual([])
    const garbled = parseGameCatalogState({ ...base, drinkLevel: 'beaucoup', categories: 'rubriques' })
    expect(garbled?.drinkLevel).toEqual({})
    expect(garbled?.categories).toEqual([])
  })

  it('relit les niveaux « fait boire » et les catégories, en écartant ce qui est invalide', () => {
    const level = otherDrink(a)
    const state = parseGameCatalogState({
      hiddenIds: [],
      drinkLevel: { [a]: level, [b]: codeDrink(b), nope: 3 },
      categories: [
        { id: 'chaud', names: { fr: 'Chaud' }, gameIds: [b, 'nope', a] },
        { id: 'MAUVAIS ID', names: { fr: 'x' }, gameIds: [] },
      ],
      popular: { local: [], online: [] },
    })
    expect(state?.drinkLevel).toEqual({ [a]: level })
    expect(state?.categories).toEqual([{ id: 'chaud', names: { fr: 'Chaud' }, gameIds: [a, b] }])
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

describe('parseDifficultyOverrides', () => {
  const [a, b, c] = STAFF_TOGGLEABLE_GAME_IDS

  it('relit un objet JSON (texte ou déjà lu), clés dans l’ordre du catalogue', () => {
    const wanted = { [c]: otherLevel(c), [a]: otherLevel(a) }
    for (const raw of [JSON.stringify(wanted), wanted]) {
      const result = parseDifficultyOverrides(raw)
      expect(result).toEqual({ [a]: otherLevel(a), [c]: otherLevel(c) })
      expect(Object.keys(result)).toEqual([a, c])
    }
  })

  it('écarte une valeur égale au niveau du code', () => {
    expect(parseDifficultyOverrides({ [a]: codeLevel(a), [b]: otherLevel(b) })).toEqual({ [b]: otherLevel(b) })
  })

  it('écarte les ids inconnus ou retirés du code', () => {
    expect(parseDifficultyOverrides({ nope: 3, [retired.id]: otherLevel(retired.id) })).toEqual({})
  })

  it('écarte les niveaux hors 1, 2, 3 (0, 4, 1.5, texte, null, objet)', () => {
    const bad = [0, 4, 1.5, -1, '2', null, true, {}, [], NaN]
    for (const level of bad) {
      expect(parseDifficultyOverrides({ [a]: level }), JSON.stringify(level)).toEqual({})
    }
  })

  it('illisible : {}', () => {
    for (const raw of ['{pas du json', '', 'null', '[1,2]', '3', null, undefined, 7, [a]]) {
      expect(parseDifficultyOverrides(raw), String(raw)).toEqual({})
    }
  })
})

describe('gameDifficulty', () => {
  const [a] = STAFF_TOGGLEABLE_GAME_IDS

  it('le réglage de l’équipe l’emporte', () => {
    expect(gameDifficulty(a, { [a]: otherLevel(a) })).toBe(otherLevel(a))
  })

  it('sans réglage : le niveau du code', () => {
    expect(gameDifficulty(a, {})).toBe(codeLevel(a))
    expect(gameDifficulty(retired.id, {})).toBe(codeLevel(retired.id))
  })

  it('jeu inconnu : Moyen', () => {
    expect(gameDifficulty('nope', {})).toBe(2)
  })
})

describe('barème « fait boire » du code', () => {
  it('chaque jeu, retirés compris, porte un niveau 1, 2 ou 3', () => {
    for (const game of GAMES) {
      expect(isGameDrinkLevel(game.drinkLevel), game.id).toBe(true)
    }
  })

  it('les jeux du Mode Soirée gardent leur intensité d’origine', () => {
    const heat: Record<string, 1 | 2 | 3> = {
      'vue-de-nez': 1, 'pile-poil': 1, purple: 1, blackjack: 1,
      'hi-lo': 2, 'chiffre-piege': 2, '1220': 2, plinko: 2, 'monsieur-3': 2, pmu: 2, 'front-colle': 2, 'doigt-du-destin': 2,
      'patate-chaude': 3, 'cap-ou-pas-cap': 3, 'coupe-du-roi': 3, 'petit-buveur': 3,
    }
    for (const [id, level] of Object.entries(heat)) {
      expect(codeDrink(id), id).toBe(level)
    }
  })

  it('isGameDrinkLevel n’accepte que les entiers 1 à 3', () => {
    expect([1, 2, 3].every(isGameDrinkLevel)).toBe(true)
    for (const bad of [0, 4, 1.5, '2', null, undefined, NaN, {}]) expect(isGameDrinkLevel(bad)).toBe(false)
  })
})

describe('parseDrinkLevelOverrides', () => {
  const [a, b, c] = STAFF_TOGGLEABLE_GAME_IDS

  it('relit un objet JSON (texte ou déjà lu), clés dans l’ordre du catalogue', () => {
    const wanted = { [c]: otherDrink(c), [a]: otherDrink(a) }
    for (const raw of [JSON.stringify(wanted), wanted]) {
      const result = parseDrinkLevelOverrides(raw)
      expect(result).toEqual({ [a]: otherDrink(a), [c]: otherDrink(c) })
      expect(Object.keys(result)).toEqual([a, c])
    }
  })

  it('écarte une valeur égale au niveau du code, les ids inconnus ou retirés, les niveaux invalides', () => {
    expect(parseDrinkLevelOverrides({ [a]: codeDrink(a), [b]: otherDrink(b) })).toEqual({ [b]: otherDrink(b) })
    expect(parseDrinkLevelOverrides({ nope: 3, [retired.id]: 3 })).toEqual({})
    for (const level of [0, 4, 1.5, -1, '2', null, true, {}, [], NaN]) {
      expect(parseDrinkLevelOverrides({ [a]: level }), JSON.stringify(level)).toEqual({})
    }
  })

  it('illisible : {}', () => {
    for (const raw of ['{pas du json', '', 'null', '[1,2]', '3', null, undefined, 7, [a]]) {
      expect(parseDrinkLevelOverrides(raw), String(raw)).toEqual({})
    }
  })

  it('ne se mélange pas avec la difficulté : chacun compare à SON niveau du code', () => {
    const id = GAMES.find((g) => !g.hidden && g.difficulty !== g.drinkLevel)!.id
    expect(parseDrinkLevelOverrides({ [id]: codeLevel(id) })).toEqual({ [id]: codeLevel(id) })
    expect(parseDifficultyOverrides({ [id]: codeDrink(id) })).toEqual({ [id]: codeDrink(id) })
    expect(parseDrinkLevelOverrides({ [id]: codeDrink(id) })).toEqual({})
    expect(parseDifficultyOverrides({ [id]: codeLevel(id) })).toEqual({})
  })
})

describe('gameDrinkLevel', () => {
  const [a] = STAFF_TOGGLEABLE_GAME_IDS

  it('le réglage de l’équipe l’emporte, sinon le niveau du code, sinon Moyen', () => {
    expect(gameDrinkLevel(a, { [a]: otherDrink(a) })).toBe(otherDrink(a))
    expect(gameDrinkLevel(a, {})).toBe(codeDrink(a))
    expect(gameDrinkLevel(retired.id, {})).toBe(codeDrink(retired.id))
    expect(gameDrinkLevel('nope', {})).toBe(2)
  })
})

describe('noms de catégorie', () => {
  const MAX = GAME_CATEGORY_LIMITS.maxNameLength

  it('cleanCategoryName : espaces de bord retirés, espaces internes repliés, bornes 1 à 40', () => {
    expect(cleanCategoryName('  Soirée \t  chaude \n')).toBe('Soirée chaude')
    expect(cleanCategoryName('x'.repeat(MAX))).toHaveLength(MAX)
    for (const bad of ['', '   ', 'x'.repeat(MAX + 1), 7, null, undefined, {}]) {
      expect(cleanCategoryName(bad), String(bad)).toBeNull()
    }
  })

  it('la limite se mesure après nettoyage : 40 lettres entourées d’espaces passent', () => {
    expect(cleanCategoryName(` ${'x'.repeat(MAX)} `)).toBe('x'.repeat(MAX))
  })

  it('cleanCategoryName : invisibles retirés, au moins un caractère visible exigé', () => {
    expect(cleanCategoryName('So\u200Bir\u200Fée\uFEFF \u2060chaude')).toBe('Soirée chaude')
    expect(cleanCategoryName('\u202EChaud\u202C')).toBe('Chaud')
    expect(cleanCategoryName('Chaud\u2066\u2069')).toBe('Chaud')
    expect(cleanCategoryName('a\u0007b')).toBe('ab')
    expect(cleanCategoryName('un\tdeux')).toBe('un deux')
    expect(cleanCategoryName('🍻')).toBe('🍻')
    expect(cleanCategoryName('18+')).toBe('18+')
    const invisibles = ['\u200B', '\u200E\u200F', '\u2060', '\uFEFF', '\u2800', '\u2800 \u2800', '\u202A\u202E', '\u2066\u2069', '\u0007', '...', '---', ' - ']
    for (const bad of invisibles) {
      expect(cleanCategoryName(bad), JSON.stringify(bad)).toBeNull()
    }
    expect(cleanCategoryName('\u200B'.repeat(10) + 'x'.repeat(MAX))).toBe('x'.repeat(MAX))
  })

  it('normalizeCategoryNames : français obligatoire, autres langues omises si vides ou trop longues', () => {
    expect(normalizeCategoryNames({ fr: ' Chaud ', en: ' Hot  stuff', es: '', it: 'x'.repeat(MAX + 1), de: 'Heiss' })).toEqual({
      fr: 'Chaud',
      en: 'Hot stuff',
    })
    for (const bad of [{}, { fr: '' }, { fr: 'x'.repeat(MAX + 1) }, { en: 'Hot' }, { fr: 3 }, 'Chaud', null, [], undefined]) {
      expect(normalizeCategoryNames(bad), JSON.stringify(bad)).toBeNull()
    }
  })

  it('isGameCategoryId : 1 à 40 caractères parmi a-z, 0-9 et -', () => {
    for (const ok of ['a', 'cat-1a2b3c4d', 'x'.repeat(40)]) expect(isGameCategoryId(ok), ok).toBe(true)
    for (const bad of ['', 'x'.repeat(41), 'Majuscule', 'sous_tiret', 'espace ici', 'é', 7, null]) {
      expect(isGameCategoryId(bad), String(bad)).toBe(false)
    }
  })
})

describe('parseGameCategories', () => {
  const [a, b, c] = STAFF_TOGGLEABLE_GAME_IDS
  const cat = (id: string, fr = 'Nom', gameIds: unknown[] = []) => ({ id, names: { fr }, gameIds })

  it('relit un texte JSON ou un tableau, dans l’ordre stocké', () => {
    const stored = [cat('zeta', 'Zeta', [a]), cat('alpha', 'Alpha', [b])]
    for (const raw of [JSON.stringify(stored), stored]) {
      expect(parseGameCategories(raw).map((x) => x.id)).toEqual(['zeta', 'alpha'])
    }
  })

  it('range les jeux dans l’ordre du catalogue, sans doublon, en écartant inconnus, retirés et mal typés', () => {
    const [category] = parseGameCategories([cat('x', 'X', [c, a, a, b, 'nope', retired.id, 7, null])])
    expect(category.gameIds).toEqual([a, b, c])
  })

  it('un jeu peut figurer dans plusieurs catégories', () => {
    const result = parseGameCategories([cat('un', 'Un', [a]), cat('deux', 'Deux', [a])])
    expect(result.map((x) => x.gameIds)).toEqual([[a], [a]])
  })

  it('écarte seulement l’entrée fautive : id invalide, id dupliqué, nom français absent, mal formée', () => {
    const result = parseGameCategories([
      cat('bon', 'Bon'),
      cat('Mauvais Id', 'Autre'),
      cat('bon', 'Doublon'),
      { id: 'sans-nom', names: { en: 'No fr' }, gameIds: [] },
      { id: 'nom-vide', names: { fr: '   ' }, gameIds: [] },
      { id: 'nom-long', names: { fr: 'x'.repeat(41) }, gameIds: [] },
      { id: 'sans-noms', gameIds: [] },
      'texte',
      null,
      [],
      cat('autre', 'Autre'),
    ])
    expect(result.map((x) => x.id)).toEqual(['bon', 'autre'])
    expect(result[0].names.fr).toBe('Bon')
  })

  it('nettoie les noms (espaces) et omet une autre langue illisible', () => {
    const [category] = parseGameCategories([
      { id: 'x', names: { fr: '  Soirée   chaude ', en: '', es: 'x'.repeat(41), it: 'Calda' }, gameIds: [] },
    ])
    expect(category.names).toEqual({ fr: 'Soirée chaude', it: 'Calda' })
  })

  it('un gameIds absent ou illisible vaut []', () => {
    const result = parseGameCategories([{ id: 'x', names: { fr: 'X' } }, { id: 'y', names: { fr: 'Y' }, gameIds: 'pmu' }])
    expect(result.map((x) => x.gameIds)).toEqual([[], []])
  })

  it('s’arrête à la limite de catégories', () => {
    const max = GAME_CATEGORY_LIMITS.maxCategories
    const many = Array.from({ length: max + 6 }, (_, i) => cat(`c${i}`, `C${i}`))
    const result = parseGameCategories(many)
    expect(result).toHaveLength(max)
    expect(result[0].id).toBe('c0')
    expect(result.at(-1)!.id).toBe(`c${max - 1}`)
  })

  it('la limite compte les entrées VALIDES : une entrée fautive n’occupe pas de place', () => {
    const max = GAME_CATEGORY_LIMITS.maxCategories
    const many = [cat('Mauvais'), ...Array.from({ length: max }, (_, i) => cat(`c${i}`))]
    expect(parseGameCategories(many)).toHaveLength(max)
  })

  it('illisible : []', () => {
    for (const raw of ['{pas du json', '', 'null', '{"a":1}', '"texte"', '3', null, undefined, 7, {}]) {
      expect(parseGameCategories(raw), String(raw)).toEqual([])
    }
  })
})

describe('categoryName', () => {
  const category = { id: 'x', names: { fr: 'Chaud', en: 'Hot' }, gameIds: [] }

  it('la langue demandée, sinon le français', () => {
    expect(categoryName(category, 'en')).toBe('Hot')
    expect(categoryName(category, 'fr')).toBe('Chaud')
    expect(categoryName(category, 'es')).toBe('Chaud')
    expect(categoryName(category, 'it')).toBe('Chaud')
  })

  it('une langue inconnue, ou une clé qui n’est pas une langue, retombe sur le français', () => {
    for (const locale of ['de', '', 'EN', 'en-GB', '__proto__', 'constructor']) {
      expect(categoryName(category, locale), locale).toBe('Chaud')
    }
  })
})

describe('parseVibeOverrides', () => {
  const [a, b] = SOIREE_GAME_IDS

  it('VIBE_GAME_IDS : tous les candidats du Mode Soirée que l’équipe peut basculer, dans l’ordre du catalogue', () => {
    expect(VIBE_GAME_IDS).toEqual(STAFF_TOGGLEABLE_GAME_IDS.filter((id) => SOIREE_CANDIDATE_IDS.includes(id)))
    expect(VIBE_GAME_IDS.length).toBeGreaterThan(SOIREE_GAME_IDS.length)
    for (const id of SOIREE_GAME_IDS) expect(VIBE_GAME_IDS).toContain(id)
  })

  it('relit un objet ou son texte JSON, dans l’ordre de SOIREE_VIBES et sans doublon', () => {
    const stored = { [a]: ['grosse', 'apero', 'apero'], [b]: ['monte'] }
    const expected = { [a]: ['apero', 'grosse'], [b]: ['monte'] }
    expect(parseVibeOverrides(stored)).toEqual(expected)
    expect(parseVibeOverrides(JSON.stringify(stored))).toEqual(expected)
  })

  it('garde la liste vide : « aucune ambiance » est un choix', () => {
    expect(parseVibeOverrides({ [a]: [] })).toEqual({ [a]: [] })
  })

  it('écarte les ambiances inconnues sans écarter le jeu', () => {
    expect(parseVibeOverrides({ [a]: ['soiree-folle', 3, null, 'monte'] })).toEqual({ [a]: ['monte'] })
  })

  it('écarte les ids inconnus, retirés du code ou qui ne sont pas candidats au Mode Soirée', () => {
    const outside = STAFF_TOGGLEABLE_GAME_IDS.find((id) => !SOIREE_CANDIDATE_IDS.includes(id))
    const ids = { nope: ['apero'], [retired.id]: ['apero'], ...(outside ? { [outside]: ['apero'] } : {}), [a]: ['apero'] }
    expect(parseVibeOverrides(ids)).toEqual({ [a]: ['apero'] })
  })

  it('écarte une entrée qui n’est pas une liste', () => {
    expect(parseVibeOverrides({ [a]: 'apero', [b]: { apero: true } })).toEqual({})
  })

  it('illisible ou absent : {}', () => {
    for (const raw of ['{pas du json', '"texte"', '[]', '[["apero"]]', 12, true, null, undefined, '']) {
      expect(parseVibeOverrides(raw), String(raw)).toEqual({})
    }
  })
})

describe('gameVibes', () => {
  const [a, b] = SOIREE_GAME_IDS

  it('sans réglage : les ambiances du niveau « fait boire » du code', () => {
    expect(gameVibes(a, {}, {})).toEqual(defaultVibesForLevel(codeDrink(a)))
  })

  it('le défaut suit le niveau « fait boire » réglé par l’équipe', () => {
    const level = otherDrink(a)
    expect(gameVibes(a, {}, { [a]: level })).toEqual(defaultVibesForLevel(level))
  })

  it('un réglage de l’équipe remplace le défaut, même vide, et reste le même quand le niveau change', () => {
    expect(gameVibes(a, { [a]: ['grosse'] }, {})).toEqual(['grosse'])
    expect(gameVibes(a, { [a]: [] }, {})).toEqual([])
    expect(gameVibes(a, { [a]: ['grosse'] }, { [a]: otherDrink(a) })).toEqual(['grosse'])
    expect(gameVibes(b, { [a]: ['grosse'] }, {})).toEqual(defaultVibesForLevel(codeDrink(b)))
  })

  it('rend une copie : la modifier ne touche pas au réglage', () => {
    const overrides = { [a]: ['apero' as const] }
    gameVibes(a, overrides, {}).push('grosse')
    expect(overrides[a]).toEqual(['apero'])
  })
})

describe('parseGameCatalogState : ambiances', () => {
  const [a] = SOIREE_GAME_IDS
  const base = { hiddenIds: [], popular: { local: [], online: [] } }

  it('vibes est facultatif : absent ou illisible, il vaut {} sans rendre null', () => {
    expect(parseGameCatalogState(base)?.vibes).toEqual({})
    expect(parseGameCatalogState({ ...base, vibes: 'toutes' })?.vibes).toEqual({})
    expect(parseGameCatalogState({ ...base, vibes: [a] })?.vibes).toEqual({})
  })

  it('relit les ambiances réglées en écartant ce qui est invalide', () => {
    const state = parseGameCatalogState({ ...base, vibes: { [a]: ['grosse', 'apero', 'nope'], nope: ['apero'] } })
    expect(state?.vibes).toEqual({ [a]: ['apero', 'grosse'] })
  })

  it('EMPTY_GAME_CATALOG.vibes vaut {}', () => {
    expect(EMPTY_GAME_CATALOG.vibes).toEqual({})
  })
})

describe('parseSoireeOverrides', () => {
  const [a, b] = SOIREE_GAME_IDS
  const added = SOIREE_CANDIDATE_IDS.find((id) => !SOIREE_GAME_IDS.includes(id))!
  const onlineOnly = GAMES.find((g) => !g.hidden && g.onlineOnly)

  it('garde les écarts au défaut : un jeu du code sorti (false), un candidat ajouté (true)', () => {
    expect(parseSoireeOverrides({ [a]: false, [added]: true })).toEqual({ [a]: false, [added]: true })
  })

  it('relit le texte JSON, dans l’ordre du catalogue', () => {
    const stored = { [added]: true, [a]: false }
    const result = parseSoireeOverrides(JSON.stringify(stored))
    expect(Object.keys(result)).toEqual(SOIREE_CANDIDATE_IDS.filter((id) => id in stored))
  })

  it('écarte une entrée égale au défaut du code', () => {
    expect(parseSoireeOverrides({ [a]: true, [added]: false })).toEqual({})
  })

  it('écarte les ids inconnus, retirés du code, en ligne uniquement, et les valeurs qui ne sont pas des booléens', () => {
    const ids = {
      nope: true,
      [retired.id]: true,
      ...(onlineOnly ? { [onlineOnly.id]: true } : {}),
      [a]: 'false',
      [b]: 0,
      [added]: true,
    }
    expect(parseSoireeOverrides(ids)).toEqual({ [added]: true })
  })

  it('illisible, tableau ou absent : {}', () => {
    for (const raw of ['{pas du json', '[1]', 'null', '"x"', [a], null, undefined, 3]) {
      expect(parseSoireeOverrides(raw), String(raw)).toEqual({})
    }
  })
})

describe('parseFeaturedGameIds', () => {
  const [a, b, c] = STAFF_TOGGLEABLE_GAME_IDS

  it('garde l’ordre de mise à la une (pas celui du catalogue), objet ou texte JSON', () => {
    expect(parseFeaturedGameIds([c, a, b])).toEqual([c, a, b])
    expect(parseFeaturedGameIds(JSON.stringify([b, a]))).toEqual([b, a])
  })

  it('écarte doublons, inconnus, retirés du code et non-textes, en gardant la première place', () => {
    expect(parseFeaturedGameIds([b, 'nope', b, retired.id, 3, null, a, b])).toEqual([b, a])
  })

  it(`tronque à FEATURED_LIMIT (${FEATURED_LIMIT})`, () => {
    const many = STAFF_TOGGLEABLE_GAME_IDS.slice(0, FEATURED_LIMIT + 3)
    expect(FEATURED_LIMIT).toBe(8)
    expect(parseFeaturedGameIds(many)).toEqual(many.slice(0, FEATURED_LIMIT))
  })

  it('illisible, objet ou absent : []', () => {
    for (const raw of ['{pas du json', '{"a":1}', 'null', { [a]: true }, null, undefined, 12]) {
      expect(parseFeaturedGameIds(raw), String(raw)).toEqual([])
    }
  })
})

describe('parseGameCatalogState : Mode Soirée et à la une', () => {
  const base = { hiddenIds: [], popular: { local: [], online: [] } }
  const added = SOIREE_CANDIDATE_IDS.find((id) => !SOIREE_GAME_IDS.includes(id))!
  const [a, b] = STAFF_TOGGLEABLE_GAME_IDS

  it('soiree et featured sont facultatifs : absents ou abîmés, ils valent {} et []', () => {
    expect(parseGameCatalogState(base)).toMatchObject({ soiree: {}, featured: [] })
    expect(parseGameCatalogState({ ...base, soiree: 'x', featured: 'y' })).toMatchObject({ soiree: {}, featured: [] })
  })

  it('relit les deux champs en les nettoyant', () => {
    const state = parseGameCatalogState({ ...base, soiree: { [added]: true, nope: true }, featured: [b, a, 'nope', b] })
    expect(state?.soiree).toEqual({ [added]: true })
    expect(state?.featured).toEqual([b, a])
  })

  it('EMPTY_GAME_CATALOG a soiree {} et featured []', () => {
    expect(EMPTY_GAME_CATALOG.soiree).toEqual({})
    expect(EMPTY_GAME_CATALOG.featured).toEqual([])
  })
})
