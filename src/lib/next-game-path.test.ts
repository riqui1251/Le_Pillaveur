import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { resolveNextGame, resolveNextGamePath } from '@/lib/next-game-path'

/**
 * Le `?next=` de /joueurs vient de l'URL, donc de n'importe qui. Promesses :
 *  - le chemin EXACT d'un jeu publié est rendu tel quel, pour chacun d'eux ;
 *  - tout le reste vaut null : vide, URL externe, protocole relatif, chemin
 *    hors catalogue, variante (slash final, requête, casse, préfixe de
 *    langue, remontée de dossier) ;
 *  - un jeu masqué n'est jamais une destination.
 */
describe('resolveNextGamePath', () => {
  const visible = GAMES.filter((game) => !game.hidden)
  const hidden = GAMES.filter((game) => game.hidden)

  it('rend le chemin exact de chaque jeu publié', () => {
    expect(visible.length).toBeGreaterThan(0)
    for (const game of visible) {
      expect(resolveNextGamePath(game.path)).toBe(game.path)
    }
  })

  it('refuse les jeux masqués', () => {
    expect(hidden.length).toBeGreaterThan(0)
    for (const game of hidden) {
      expect(resolveNextGamePath(game.path)).toBeNull()
    }
  })

  it('refuse l’absence de valeur', () => {
    expect(resolveNextGamePath(null)).toBeNull()
    expect(resolveNextGamePath(undefined)).toBeNull()
    expect(resolveNextGamePath('')).toBeNull()
  })

  it('refuse toute URL externe ou protocole relatif', () => {
    expect(resolveNextGamePath('https://exemple.test/games/hi-lo')).toBeNull()
    expect(resolveNextGamePath('//exemple.test/games/hi-lo')).toBeNull()
    expect(resolveNextGamePath('javascript:alert(1)')).toBeNull()
  })

  it('refuse un chemin hors catalogue', () => {
    expect(resolveNextGamePath('/jeux')).toBeNull()
    expect(resolveNextGamePath('/compte')).toBeNull()
    expect(resolveNextGamePath('/games/inconnu')).toBeNull()
    expect(resolveNextGamePath('/supervision')).toBeNull()
  })

  it('refuse les variantes d’un chemin valide', () => {
    const path = visible[0].path
    expect(resolveNextGamePath(`${path}/`)).toBeNull()
    expect(resolveNextGamePath(`${path}?x=1`)).toBeNull()
    expect(resolveNextGamePath(`${path}#lobby`)).toBeNull()
    expect(resolveNextGamePath(path.toUpperCase())).toBeNull()
    expect(resolveNextGamePath(`/fr${path}`)).toBeNull()
    expect(resolveNextGamePath(`${path}/../../compte`)).toBeNull()
    expect(resolveNextGamePath(` ${path}`)).toBeNull()
  })
})

describe('resolveNextGame', () => {
  it('rend la fiche du jeu pour un chemin valide, null sinon', () => {
    const game = GAMES.find((g) => !g.hidden)!
    expect(resolveNextGame(game.path)?.id).toBe(game.id)
    expect(resolveNextGame('/games/inconnu')).toBeNull()
  })
})
