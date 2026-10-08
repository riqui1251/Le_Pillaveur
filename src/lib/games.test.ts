import { describe, expect, it } from 'vitest'
import { GAMES, getGameById, hasContentIn, soloAlternativeFor, splitBySoloFit, type GameMeta } from './games'
import { locales } from '@/i18n/routing'

/**
 * `games.ts` est la source unique du catalogue : le hub, la landing et le
 * sitemap en dépendent. Ces tests gardent les invariants dont le rendu ne se
 * remet pas (doublon d'id, jeu sans enseigne dans une grille de cartes à
 * jouer, rangée « incontournables » qui déborde ou pointe sur un jeu masqué).
 */

const visible = GAMES.filter((g) => !g.hidden)

describe('catalogue des jeux', () => {
  it("n'a aucun id en double", () => {
    const ids = GAMES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('renseigne les champs affichés pour chaque jeu', () => {
    for (const game of GAMES) {
      expect(game.title.trim(), `titre de ${game.id}`).not.toBe('')
      expect(game.description.trim(), `description de ${game.id}`).not.toBe('')
      expect(game.path, `chemin de ${game.id}`).toBe(`/games/${game.id}`)
    }
  })

  it('donne une enseigne et un rang à tout jeu visible (tuile carte à jouer)', () => {
    for (const game of visible) {
      expect(game.suit, `enseigne de ${game.id}`).toBeTruthy()
      expect(game.rank, `rang de ${game.id}`).toBeTruthy()
    }
  })

  it('retrouve un jeu par son id', () => {
    expect(getGameById('loup-garou')?.title).toBe('Loup-Garou')
    expect(getGameById('jeu-inexistant')).toBeUndefined()
  })
})

describe('rangée « les incontournables » (featured)', () => {
  const featured = GAMES.filter((g) => g.featured)

  it('met en avant entre 1 et 5 jeux — au-delà, la rangée ne met plus rien en avant', () => {
    expect(featured.length).toBeGreaterThan(0)
    expect(featured.length).toBeLessThanOrEqual(5)
  })

  it('ne met en avant aucun jeu masqué ni non jouable en ligne', () => {
    for (const game of featured) {
      expect(game.hidden, `${game.id} est masqué du hub`).toBeFalsy()
      expect(game.onlineReady, `${game.id} devrait être jouable en ligne`).toBe(true)
    }
  })

  it('ne met en avant que des jeux rattachés à une famille', () => {
    // La rangée double la famille par enseigne : un phare sans enseigne
    // disparaîtrait du hub dès qu'on cherche autre chose.
    for (const game of featured) {
      expect(game.suit, `enseigne de ${game.id}`).toBeTruthy()
    }
  })
})

describe('jeux en bêta', () => {
  it('un jeu en bêta est publié : visible au hub et jouable en ligne', () => {
    for (const game of GAMES.filter((g) => g.beta)) {
      expect(game.hidden, `${game.id} est en bêta mais masqué`).toBeFalsy()
      expect(game.onlineReady, `${game.id} devrait être jouable en ligne`).toBe(true)
    }
  })

  it('Tabou Vocal est publié en bêta, sans complément par bots', () => {
    const tabou = getGameById('tabou')
    expect(tabou?.hidden).toBeFalsy()
    expect(tabou?.beta).toBe(true)
    expect(tabou?.botsFillable).toBeFalsy()
  })
})

describe('langues du contenu (contentLangs)', () => {
  it('absent : le contenu existe dans toutes les langues du site', () => {
    const loupGarou = getGameById('loup-garou')!
    expect(loupGarou.contentLangs).toBeUndefined()
    for (const locale of locales) expect(hasContentIn(loupGarou, locale), locale).toBe(true)
  })

  it('Sans Filtre et Dilemmes : cartes en français seulement', () => {
    for (const id of ['sans-filtre', 'dilemmes']) {
      const game = getGameById(id)!
      expect(game.contentLangs, id).toEqual(['fr'])
      expect(hasContentIn(game, 'fr'), `${id} en fr`).toBe(true)
      for (const locale of ['en', 'es', 'it']) expect(hasContentIn(game, locale), `${id} en ${locale}`).toBe(false)
    }
  })

  it('une langue absente vaut le français (table ouverte sans cookie de langue)', () => {
    const sansFiltre = getGameById('sans-filtre')!
    expect(hasContentIn(sansFiltre, undefined)).toBe(true)
    expect(hasContentIn(sansFiltre, null)).toBe(true)
    expect(hasContentIn(sansFiltre, '')).toBe(true)
  })

  it('ne déclare que des langues du site, jamais une liste vide', () => {
    for (const game of GAMES.filter((g) => g.contentLangs)) {
      expect(game.contentLangs!.length, game.id).toBeGreaterThan(0)
      for (const lang of game.contentLangs!) expect(locales as readonly string[], game.id).toContain(lang)
    }
  })

  it('la rangée « incontournables » garde au moins un jeu dans chaque langue', () => {
    // Hors fr, les phares dont les cartes n'existent qu'en français sortent
    // de la rangée (GamesGrid) : elle ne doit pas se vider pour autant.
    for (const locale of locales) {
      const featured = GAMES.filter((g) => g.featured && hasContentIn(g, locale))
      expect(featured.length, locale).toBeGreaterThan(0)
    }
  })
})

describe('tenue en solo (soloFit)', () => {
  // Figée à la main : reclasser un jeu change ce que voit un visiteur seul
  // (rangée « Parfaits en solo », encart « entre potes »). Un jeu qui gagne
  // des bots doit être classé ici, en connaissance de cause.
  const EXPECTED: Record<string, 'great' | 'group'> = {
    quiz: 'great',
    president: 'great',
    'loup-garou': 'great',
    'petit-buveur': 'great',
    purple: 'great',
    '1220': 'great',
    dilemmes: 'group',
    'sans-filtre': 'group',
    crobard: 'group',
    bluff: 'group',
    espion: 'group',
    imposteur: 'group',
    // Mesuré : quitté en 1 à 2 min seul contre des bots (07/10/2026).
    menteur: 'group',
  }

  it('classe chaque jeu complétable par des bots, et lui seul', () => {
    const classified = Object.fromEntries(GAMES.filter((g) => g.soloFit).map((g) => [g.id, g.soloFit]))
    expect(classified).toEqual(EXPECTED)
  })

  it("n'existe que sur des jeux botsFillable — et tout jeu botsFillable en a un", () => {
    for (const game of GAMES) {
      if (game.soloFit) expect(game.botsFillable, `${game.id} classé sans bots`).toBe(true)
      if (game.botsFillable) expect(game.soloFit, `${game.id} complétable mais non classé`).toBeTruthy()
    }
  })

  it('Toucher-Coulé, sans complément par bots au lobby, reste hors classement', () => {
    expect(getGameById('toucher-coule')?.soloFit).toBeUndefined()
  })
})

describe('splitBySoloFit', () => {
  it('met les « parfaits en solo » devant, garde tous les autres dans leur ordre', () => {
    const games = [
      { id: 'a', soloFit: 'group' as const },
      { id: 'b', soloFit: 'great' as const },
      { id: 'c' },
      { id: 'd', soloFit: 'great' as const },
    ]
    const { great, others } = splitBySoloFit(games)
    expect(great.map((g) => g.id)).toEqual(['b', 'd'])
    expect(others.map((g) => g.id)).toEqual(['a', 'c'])
  })
})

describe('soloAlternativeFor', () => {
  const groupGames = GAMES.filter((g) => g.soloFit === 'group')

  it('propose toujours un jeu parfait en solo, ouvrable avec des bots dans chaque langue', () => {
    for (const locale of locales) {
      for (const soft of [false, true]) {
        for (const game of groupGames) {
          const alt = soloAlternativeFor(game.id, { locale, soft })
          expect(alt, `${game.id} (${locale}, soft=${soft})`).not.toBeNull()
          expect(alt!.soloFit).toBe('great')
          expect(alt!.botsFillable).toBe(true)
          expect(alt!.onlineReady).toBe(true)
          expect(alt!.hidden).toBeFalsy()
          expect(hasContentIn(alt!, locale)).toBe(true)
          if (soft) expect(alt!.softModeReady, `${alt!.id} en Sans alcool`).toBe(true)
        }
      }
    }
  })

  it('rôles cachés → Loup-Garou ; le reste → le Quiz', () => {
    expect(soloAlternativeFor('espion', { locale: 'fr' })?.id).toBe('loup-garou')
    expect(soloAlternativeFor('imposteur', { locale: 'fr' })?.id).toBe('loup-garou')
    expect(soloAlternativeFor('menteur', { locale: 'fr' })?.id).toBe('loup-garou')
    for (const id of ['dilemmes', 'sans-filtre', 'crobard', 'bluff']) {
      expect(soloAlternativeFor(id, { locale: 'fr' })?.id, id).toBe('quiz')
    }
  })

  it('ne se propose jamais lui-même et écarte un candidat hors langue ou hors Sans alcool', () => {
    const base = { title: 't', description: 'd', emoji: '', gradient: '', fallbackColor: '' }
    const fake: GameMeta[] = [
      { ...base, id: 'groupe', path: '/games/groupe', suit: 'heart', botsFillable: true, onlineReady: true, soloFit: 'group' },
      { ...base, id: 'fr-seul', path: '/games/fr-seul', suit: 'heart', featured: true, botsFillable: true, onlineReady: true, softModeReady: true, soloFit: 'great', contentLangs: ['fr'] },
      { ...base, id: 'gorgees', path: '/games/gorgees', suit: 'club', botsFillable: true, onlineReady: true, soloFit: 'great' },
    ]
    expect(soloAlternativeFor('fr-seul', { locale: 'fr', games: fake })?.id).toBe('gorgees')
    expect(soloAlternativeFor('groupe', { locale: 'fr', games: fake })?.id).toBe('fr-seul')
    expect(soloAlternativeFor('groupe', { locale: 'en', games: fake })?.id).toBe('gorgees')
    expect(soloAlternativeFor('groupe', { locale: 'en', soft: true, games: fake })).toBeNull()
  })
})
