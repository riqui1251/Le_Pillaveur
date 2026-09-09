import { describe, expect, it } from 'vitest'
import { GAMES, getGameById } from './games'

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
