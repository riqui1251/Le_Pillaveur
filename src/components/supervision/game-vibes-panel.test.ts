import { describe, expect, it } from 'vitest'
import { isModifiedVibes, parseAdminGameVibes, soireeChange, soireeCounts, vibeCounts } from './game-vibes-panel'

const row = (over: Record<string, unknown> = {}) => ({
  id: 'purple',
  hidden: false,
  inSoiree: true,
  defaultInSoiree: true,
  drinkLevel: 2,
  vibes: ['apero', 'monte', 'grosse'],
  defaultVibes: ['apero', 'monte', 'grosse'],
  ...over,
})
const body = (games: unknown[] = [row()], over: Record<string, unknown> = {}) => ({ canEdit: true, games, ...over })

describe('parseAdminGameVibes', () => {
  it('lit une réponse complète', () => {
    expect(parseAdminGameVibes(body())).toEqual(body())
  })

  it('garde une liste d’ambiances vide', () => {
    expect(parseAdminGameVibes(body([row({ vibes: [] })]))?.games[0].vibes).toEqual([])
  })

  it('accepte une liste de jeux vide', () => {
    expect(parseAdminGameVibes(body([]))?.games).toEqual([])
  })

  it.each([null, undefined, 'x', 3, [], {}])('refuse %j', (value) => {
    expect(parseAdminGameVibes(value)).toBeNull()
  })

  it.each([
    ['canEdit manquant', { canEdit: undefined }],
    ['games absent', { games: undefined }],
    ['games non liste', { games: {} }],
  ])('refuse %s', (_label, over) => {
    expect(parseAdminGameVibes(body([row()], over))).toBeNull()
  })

  it.each([
    ['id numérique', { id: 3 }],
    ['hidden manquant', { hidden: undefined }],
    ['inSoiree manquant (serveur plus ancien)', { inSoiree: undefined }],
    ['inSoiree mal typé', { inSoiree: 'oui' }],
    ['defaultInSoiree manquant', { defaultInSoiree: undefined }],
    ['niveau hors barème', { drinkLevel: 4 }],
    ['ambiance inconnue', { vibes: ['apero', 'fete'] }],
    ['ambiance en double', { vibes: ['apero', 'apero'] }],
    ['vibes non liste', { vibes: 'apero' }],
    ['défaut manquant', { defaultVibes: undefined }],
  ])('refuse une ligne avec %s', (_label, over) => {
    expect(parseAdminGameVibes(body([row(), row(over)]))).toBeNull()
  })
})

describe('soireeChange', () => {
  it('suit le code : rien', () => {
    expect(soireeChange({ inSoiree: true, defaultInSoiree: true })).toBeNull()
    expect(soireeChange({ inSoiree: false, defaultInSoiree: false })).toBeNull()
  })

  it('ajouté ou retiré par rapport au code', () => {
    expect(soireeChange({ inSoiree: true, defaultInSoiree: false })).toBe('added')
    expect(soireeChange({ inSoiree: false, defaultInSoiree: true })).toBe('removed')
  })
})

describe('soireeCounts', () => {
  it('compte les jeux visibles du Mode Soirée et signale les jeux cachés qui y restent', () => {
    const games = [
      row(),
      row({ id: 'b', inSoiree: false }),
      row({ id: 'c', hidden: true }),
      row({ id: 'd', hidden: true, inSoiree: false }),
      row({ id: 'e' }),
    ]
    expect(soireeCounts(parseAdminGameVibes(body(games))!.games)).toEqual({ inSoiree: 2, hiddenInSoiree: 1 })
    expect(soireeCounts([])).toEqual({ inSoiree: 0, hiddenInSoiree: 0 })
  })
})

describe('isModifiedVibes', () => {
  it('égal au défaut : non modifié', () => {
    expect(isModifiedVibes(row() as never)).toBe(false)
  })

  it('une ambiance en moins, une liste vide ou un autre ensemble : modifié', () => {
    expect(isModifiedVibes(row({ vibes: ['apero', 'monte'] }) as never)).toBe(true)
    expect(isModifiedVibes(row({ vibes: [] }) as never)).toBe(true)
    expect(isModifiedVibes(row({ vibes: ['apero', 'grosse'], defaultVibes: ['apero', 'monte'] }) as never)).toBe(true)
  })
})

describe('vibeCounts', () => {
  it('ne compte pas un jeu hors du Mode Soirée, même avec des ambiances cochées', () => {
    const games = [row({ vibes: ['apero'] }), row({ id: 'b', inSoiree: false, vibes: ['apero', 'monte', 'grosse'] })]
    expect(vibeCounts(parseAdminGameVibes(body(games))!.games)).toEqual({ apero: 1, monte: 0, grosse: 0 })
  })

  it('compte les jeux par ambiance, jeux cachés exclus', () => {
    const games = [
      row({ vibes: ['apero', 'monte'] }),
      row({ id: 'b', vibes: ['monte', 'grosse'] }),
      row({ id: 'c', hidden: true, vibes: ['apero', 'monte', 'grosse'] }),
      row({ id: 'd', vibes: [] }),
    ]
    expect(vibeCounts(parseAdminGameVibes(body(games))!.games)).toEqual({ apero: 1, monte: 2, grosse: 1 })
  })
})
