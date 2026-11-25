import { describe, expect, it } from 'vitest'
import { GAMES, hasContentIn, type GameMeta } from './games'
import { COLLECTION_SLUGS, LARGE_GROUP_MIN_PLAYERS, gamesInCollection, isCollectionSlug } from './collections'
import fr from '../../messages/fr.json'
import en from '../../messages/en.json'
import es from '../../messages/es.json'
import it_ from '../../messages/it.json'

const CATALOGUES: Record<string, { games: Record<string, unknown> }> = { fr, en, es, it: it_ }

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
    difficulty: 1,
    drinkLevel: 1,
    ...overrides,
  }
}

const FAKE: GameMeta[] = [
  game({ id: 'local-2', localMinPlayers: 2 }),
  game({ id: 'local-3', localMinPlayers: 3 }),
  game({ id: 'online-2', onlineReady: true, minPlayers: 2, maxPlayers: 6 }),
  game({ id: 'online-3-bots', onlineReady: true, minPlayers: 3, maxPlayers: 16, botsFillable: true }),
  game({ id: 'online-soft', onlineReady: true, minPlayers: 4, maxPlayers: 8, softModeReady: true }),
  game({ id: 'local-soft', localMinPlayers: 3, localSoftReady: true }),
  game({ id: 'bots-sans-online', botsFillable: true }),
  game({ id: 'grand-groupe', onlineReady: true, minPlayers: 4, maxPlayers: LARGE_GROUP_MIN_PLAYERS }),
  game({ id: 'des', suit: 'diamond' }),
  game({ id: 'cul-sec', suit: 'heart', drinkLevel: 3 }),
  game({ id: 'ambiance', suit: 'heart', drinkLevel: 2 }),
  game({ id: 'masque', hidden: true, suit: 'diamond', drinkLevel: 3, localMinPlayers: 2, onlineReady: true, minPlayers: 2, maxPlayers: 16, botsFillable: true, softModeReady: true }),
]

const ids = (games: GameMeta[]) => games.map((g) => g.id)

describe('critères des collections (registre factice)', () => {
  it('« jeux à boire » : enseigne ♦ à tout niveau, sinon niveau Fait boire 3', () => {
    expect(ids(gamesInCollection('jeux-a-boire', FAKE))).toEqual(['des', 'cul-sec'])
  })

  it('« à 2 joueurs » : minimum en ligne OU minimum local ≤ 2', () => {
    expect(ids(gamesInCollection('a-2-joueurs', FAKE))).toEqual(['local-2', 'online-2'])
  })

  it('« sans alcool » : le mode Soft en ligne ou la variante locale sans alcool', () => {
    expect(ids(gamesInCollection('sans-alcool', FAKE))).toEqual(['online-soft', 'local-soft'])
  })

  it('« seul avec des bots » : bots ET jeu en ligne', () => {
    expect(ids(gamesInCollection('seul-avec-des-bots', FAKE))).toEqual(['online-3-bots'])
  })

  it('« seul avec des bots » : hors fr, pas de jeu dont les cartes n existent qu en français', () => {
    const withFrOnly = [...FAKE, game({ id: 'bots-fr', onlineReady: true, botsFillable: true, contentLangs: ['fr'] })]
    expect(ids(gamesInCollection('seul-avec-des-bots', withFrOnly, 'fr'))).toEqual(['online-3-bots', 'bots-fr'])
    expect(ids(gamesInCollection('seul-avec-des-bots', withFrOnly, 'en'))).toEqual(['online-3-bots'])
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
    expect([...COLLECTION_SLUGS]).toEqual(['jeux-a-boire', 'a-2-joueurs', 'sans-alcool', 'seul-avec-des-bots', 'en-grand-groupe'])
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

  it('« jeux à boire » garde les classiques et laisse les jeux d’ambiance', () => {
    const drinking = ids(gamesInCollection('jeux-a-boire'))
    for (const id of ['pyramide', 'coupe-du-roi', 'pmu', 'purple', 'hi-lo', 'cap-ou-pas-cap', '1220', 'petit-buveur']) {
      expect(drinking, id).toContain(id)
    }
    for (const id of ['quiz', 'dilemmes', 'front-colle', 'loup-garou']) {
      expect(drinking, id).not.toContain(id)
    }
  })

  it('« sans alcool » : les jeux locaux à variante sans alcool, pas les jeux de dés', () => {
    const soft = ids(gamesInCollection('sans-alcool'))
    for (const id of ['coupe-du-roi', 'cap-ou-pas-cap', 'front-colle', 'pile-poil', 'degaine', 'doigt-du-destin']) {
      expect(soft, id).toContain(id)
    }
    for (const id of ['monsieur-3', 'pyramide', 'pmu', 'hi-lo', 'plinko', 'petit-buveur', 'purple', '1220']) {
      expect(soft, id).not.toContain(id)
    }
  })

  it('localSoftReady : un jeu local dont chaque catalogue porte des textes sans alcool', () => {
    for (const game of GAMES.filter((g) => g.localSoftReady)) {
      expect(game.onlineOnly, game.id).toBeFalsy()
      expect(game.localMinPlayers, game.id).toBeDefined()
      for (const [locale, catalogue] of Object.entries(CATALOGUES)) {
        expect(JSON.stringify(catalogue.games[game.id] ?? {}), `${game.id} (${locale})`).toMatch(/"soft[A-Z"]/)
      }
    }
  })

  it('« seul avec des bots » = exactement les jeux que le filtre ?solo=1 du hub affiche', () => {
    // Même définition que GamesGrid (botsFillable && onlineReady && cartes dans
    // la langue de la page, hors masqués) : la collection et le funnel « jouer
    // seul » doivent promettre la même liste, dans chaque langue.
    for (const locale of ['fr', 'en', 'es', 'it']) {
      const expected = GAMES.filter(
        (g) => !g.hidden && g.botsFillable && g.onlineReady && hasContentIn(g, locale)
      ).map((g) => g.id)
      expect(ids(gamesInCollection('seul-avec-des-bots', GAMES, locale)), locale).toEqual(expected)
    }
  })
})

describe('jeux cachés par l’équipe (hiddenIds)', () => {
  it('sort le jeu caché de chaque collection, les autres gardent leur ordre', () => {
    for (const slug of COLLECTION_SLUGS) {
      const all = ids(gamesInCollection(slug, FAKE))
      const [first] = all
      if (!first) continue
      expect(ids(gamesInCollection(slug, FAKE, undefined, [first])), slug).toEqual(all.slice(1))
    }
  })

  it('sans hiddenIds, rien ne change', () => {
    expect(ids(gamesInCollection('a-2-joueurs', FAKE, undefined, []))).toEqual(ids(gamesInCollection('a-2-joueurs', FAKE)))
  })

  it('sur le vrai registre : un jeu caché disparaît de toutes les collections qui le comptaient', () => {
    for (const slug of COLLECTION_SLUGS) {
      const [target] = gamesInCollection(slug)
      expect(gamesInCollection(slug, GAMES, 'fr', [target.id]).map((g) => g.id), slug).not.toContain(target.id)
    }
  })
})
