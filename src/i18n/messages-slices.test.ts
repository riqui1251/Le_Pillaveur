import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { AbstractIntlMessages } from 'next-intl'
import { GAMES } from '@/lib/games'
import {
  GAME_IDS,
  coreMessages,
  gameMessages,
  gameSlice,
  mergeMessages,
  supervisionMessages,
  supervisionSlice,
  tvMessages,
  tvSlice,
} from './messages-slices'

/**
 * Découpage du catalogue par segment (src/i18n/messages-slices.ts).
 *
 * Deux jeux d'essai : un catalogue MINIATURE, lisible d'un coup d'œil, pour la
 * forme exacte de chaque tranche ; et le vrai `messages/fr.json`, pour ce qui
 * ne se voit qu'en grandeur nature — un enfant de `games` qui ne serait ni un
 * jeu ni un sous-arbre partagé, un socle qui regonflerait.
 */

const FR: AbstractIntlMessages = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../messages/fr.json', import.meta.url)), 'utf8')
)

/** Enfants de `games` qui ne sont pas des jeux et restent dans le socle. */
const SHARED_GAMES_CHILDREN = ['catalog', 'meta']

const ONLINE_GAME = GAMES.find((game) => game.onlineReady && game.id !== 'purple' && game.id !== 'petit-buveur')!
const LOCAL_GAME = GAMES.find((game) => !game.onlineReady)!

function miniature(): AbstractIntlMessages {
  return {
    common: { ok: 'OK' },
    hub: { title: 'Les jeux' },
    supervision: { title: 'Supervision', accounts: { total: '{total} comptes' } },
    games: {
      catalog: { purple: { title: 'Purple' }, [ONLINE_GAME.id]: { title: 'En ligne' } },
      meta: { purple: { title: 'Purple — jouer' } },
      purple: { title: 'Purple', bets: { red: 'Rouge' } },
      '1220': { title: '1220', backToGames: 'Retour aux jeux', lobby: { should: 'not leak' } },
      [ONLINE_GAME.id]: { page: { title: 'Page' }, lobby: { rounds: 'Manches' }, game: { go: 'Go' } },
      'petit-buveur': { page: { difficulty: 'Difficulté' }, game: { roll: 'Lance' } },
      [LOCAL_GAME.id]: { title: 'Local', lobby: { never: 'read online' } },
    },
  }
}

describe('coreMessages', () => {
  it('garde tout sauf la supervision et les textes des jeux', () => {
    const core = coreMessages(miniature())
    expect(Object.keys(core).sort()).toEqual(['common', 'games', 'hub'])
    expect(Object.keys(core.games as AbstractIntlMessages).sort()).toEqual(['catalog', 'meta'])
  })

  it('garde, sous games, tout enfant qui n’est pas un identifiant de jeu', () => {
    const all = miniature()
    ;(all.games as AbstractIntlMessages).futur = { title: 'Pas encore dans GAMES' }
    expect((coreMessages(all).games as AbstractIntlMessages).futur).toEqual({ title: 'Pas encore dans GAMES' })
  })

  it('ne modifie pas le catalogue reçu', () => {
    const all = miniature()
    const before = JSON.stringify(all)
    coreMessages(all)
    gameSlice(all, 'purple')
    gameMessages(all, ONLINE_GAME.id)
    supervisionMessages(all)
    tvMessages(all)
    expect(JSON.stringify(all)).toBe(before)
  })
})

describe('gameSlice / gameMessages', () => {
  it('un jeu local : son sous-arbre seul, rien des autres jeux', () => {
    const slice = gameSlice(miniature(), LOCAL_GAME.id)
    expect(Object.keys(slice)).toEqual(['games'])
    expect(Object.keys(slice.games as AbstractIntlMessages)).toEqual([LOCAL_GAME.id])
  })

  it('un jeu en ligne : son sous-arbre, plus les réglages de lobby des autres jeux', () => {
    const games = gameSlice(miniature(), ONLINE_GAME.id).games as AbstractIntlMessages
    expect(games[ONLINE_GAME.id]).toEqual(miniature().games!.valueOf()[ONLINE_GAME.id as never])
    // Le lobby commun lit `lobby` chez chacun, `page` chez le Petit Buveur…
    expect(games['1220']).toEqual({ lobby: { should: 'not leak' } })
    expect(games['petit-buveur']).toEqual({ page: { difficulty: 'Difficulté' } })
    expect(games[LOCAL_GAME.id]).toEqual({ lobby: { never: 'read online' } })
    // … et rien d'autre : ni les textes de partie, ni le catalogue (déjà au socle).
    expect(games.purple).toBeUndefined()
    expect(games.catalog).toBeUndefined()
    expect((games['petit-buveur'] as AbstractIntlMessages).game).toBeUndefined()
  })

  it('un jeu sans lobby chez les autres n’ajoute rien pour eux', () => {
    const all = miniature()
    delete (all.games as AbstractIntlMessages)[LOCAL_GAME.id]
    const games = gameSlice(all, ONLINE_GAME.id).games as AbstractIntlMessages
    expect(games[LOCAL_GAME.id]).toBeUndefined()
  })

  it('Purple emprunte games.1220 en entier (« retour aux jeux »)', () => {
    const games = gameSlice(miniature(), 'purple').games as AbstractIntlMessages
    expect(games['1220']).toEqual(miniature().games!.valueOf()['1220' as never])
    expect(games.purple).toBeDefined()
  })

  it('gameMessages = socle + tranche, sans la supervision ni les autres jeux', () => {
    const effective = gameMessages(miniature(), 'purple')
    expect(effective.common).toEqual({ ok: 'OK' })
    expect(effective.supervision).toBeUndefined()
    const games = effective.games as AbstractIntlMessages
    expect(games.catalog).toBeDefined()
    expect(games.purple).toEqual({ title: 'Purple', bets: { red: 'Rouge' } })
    expect((games[ONLINE_GAME.id] as AbstractIntlMessages).game).toBeUndefined()
  })

  it('un identifiant inconnu donne une tranche vide, pas une erreur', () => {
    expect(gameSlice(miniature(), 'inexistant')).toEqual({ games: {} })
  })
})

describe('supervisionSlice / tvSlice', () => {
  it('supervision : le sous-arbre seul, puis socle + supervision', () => {
    expect(supervisionSlice(miniature())).toEqual({ supervision: miniature().supervision })
    const effective = supervisionMessages(miniature())
    expect(effective.supervision).toEqual(miniature().supervision)
    expect((effective.games as AbstractIntlMessages).purple).toBeUndefined()
  })

  it('tv : tous les jeux, puis socle + tous les jeux', () => {
    const slice = tvSlice(miniature()).games as AbstractIntlMessages
    expect(Object.keys(slice).sort()).toEqual(['1220', LOCAL_GAME.id, ONLINE_GAME.id, 'petit-buveur', 'purple'].sort())
    const games = tvMessages(miniature()).games as AbstractIntlMessages
    expect(games.catalog).toBeDefined()
    expect(games.purple).toBeDefined()
    expect(tvMessages(miniature()).supervision).toBeUndefined()
  })
})

describe('mergeMessages', () => {
  it('fusionne nœud par nœud, le supplément l’emporte, les tableaux se remplacent', () => {
    const base: AbstractIntlMessages = { a: { x: '1', y: '2' }, list: ['a', 'b'] as never, s: 'base' }
    const extra: AbstractIntlMessages = { a: { y: '20', z: '30' }, list: ['c'] as never, s: 'extra' }
    expect(mergeMessages(base, extra)).toEqual({ a: { x: '1', y: '20', z: '30' }, list: ['c'], s: 'extra' })
  })

  it('ne modifie ni la base ni le supplément', () => {
    const base: AbstractIntlMessages = { a: { x: '1' } }
    const extra: AbstractIntlMessages = { a: { y: '2' } }
    mergeMessages(base, extra)
    expect(base).toEqual({ a: { x: '1' } })
    expect(extra).toEqual({ a: { y: '2' } })
  })
})

describe('sur le vrai catalogue français', () => {
  it('chaque enfant de games est un jeu de GAMES ou un sous-arbre partagé connu', () => {
    // Un `games.<nouveau-jeu>` ajouté aux messages avant d'être inscrit dans
    // src/lib/games.ts resterait dans le socle, servi à toutes les pages.
    const children = Object.keys(FR.games as AbstractIntlMessages)
    const inconnus = children.filter((key) => !GAME_IDS.includes(key) && !SHARED_GAMES_CHILDREN.includes(key))
    expect(inconnus).toEqual([])
  })

  it('le socle pèse moins du tiers du catalogue', () => {
    const all = JSON.stringify(FR).length
    const core = JSON.stringify(coreMessages(FR)).length
    expect(core).toBeLessThan(all / 3)
  })

  it('une page de jeu en ligne pèse moins de la moitié du catalogue', () => {
    const all = JSON.stringify(FR).length
    for (const game of GAMES) {
      expect(JSON.stringify(gameMessages(FR, game.id)).length, game.id).toBeLessThan(all / 2)
    }
  })

  it('socle + tranche TV + supervision = le catalogue entier', () => {
    // Rien ne tombe entre les tranches : tout ce qui existe est servi quelque part.
    const rebuilt = mergeMessages(tvMessages(FR), supervisionSlice(FR))
    expect(rebuilt).toEqual(FR)
  })
})
