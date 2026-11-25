import { describe, expect, it } from 'vitest'
import { STAFF_TOGGLEABLE_GAME_IDS } from '@/lib/game-catalog'
import {
  canAddCategory,
  filterGameIds,
  nameInputsOf,
  namesFromInputs,
  parseAdminGameCategories,
} from './game-categories-panel'

const [first, second, third] = STAFF_TOGGLEABLE_GAME_IDS
const category = (over: Record<string, unknown> = {}) => ({
  id: 'soiree-chaude',
  names: { fr: 'Soirée chaude', en: 'Hot night' },
  gameIds: [first, second],
  ...over,
})
const body = (over: Record<string, unknown> = {}) => ({ canEdit: true, categories: [category()], ...over })

describe('parseAdminGameCategories', () => {
  it('lit une réponse complète', () => {
    expect(parseAdminGameCategories(body())).toEqual(body())
  })

  it('accepte une liste vide', () => {
    expect(parseAdminGameCategories(body({ categories: [] }))?.categories).toEqual([])
  })

  it.each([null, undefined, 'x', 3, [], {}])('refuse %j', (value) => {
    expect(parseAdminGameCategories(value)).toBeNull()
  })

  it('refuse un champ de tête manquant ou mal typé', () => {
    expect(parseAdminGameCategories(body({ canEdit: 'oui' }))).toBeNull()
    expect(parseAdminGameCategories(body({ categories: {} }))).toBeNull()
  })

  it('refuse toute la réponse si une catégorie est abîmée', () => {
    expect(parseAdminGameCategories(body({ categories: [category(), category({ id: 'Pas Valide' })] }))).toBeNull()
    expect(parseAdminGameCategories(body({ categories: [category({ names: { en: 'x' } })] }))).toBeNull()
    expect(parseAdminGameCategories(body({ categories: [category({ names: null })] }))).toBeNull()
    expect(parseAdminGameCategories(body({ categories: [category({ gameIds: 'pmu' })] }))).toBeNull()
    expect(parseAdminGameCategories(body({ categories: [null] }))).toBeNull()
  })

  it('écarte les jeux inconnus et remet les jeux dans l’ordre du catalogue', () => {
    const parsed = parseAdminGameCategories(body({ categories: [category({ gameIds: [second, 'inconnu', first, first] })] }))
    expect(parsed?.categories[0].gameIds).toEqual([first, second])
  })

  it('ne garde que les champs du contrat', () => {
    const parsed = parseAdminGameCategories(body({ categories: [category({ extra: 1 })], other: true }))
    expect(parsed).toEqual(body())
  })
})

describe('namesFromInputs', () => {
  const inputs = { fr: '  Soirée   chaude ', en: '', es: '', it: '' }

  it('exige un nom français et le nettoie', () => {
    expect(namesFromInputs(inputs)).toEqual({ fr: 'Soirée chaude' })
    expect(namesFromInputs({ ...inputs, fr: '   ' })).toBeNull()
  })

  it('refuse un nom français de plus de 40 caractères', () => {
    expect(namesFromInputs({ ...inputs, fr: 'a'.repeat(40) })).toEqual({ fr: 'a'.repeat(40) })
    expect(namesFromInputs({ ...inputs, fr: 'a'.repeat(41) })).toBeNull()
  })

  it('garde les langues remplies, omet les vides, refuse une trop longue', () => {
    expect(namesFromInputs({ ...inputs, en: ' Hot  night ', es: ' ' })).toEqual({ fr: 'Soirée chaude', en: 'Hot night' })
    expect(namesFromInputs({ ...inputs, it: 'a'.repeat(41) })).toBeNull()
  })

  it('relit les noms rangés dans les champs', () => {
    expect(nameInputsOf({ fr: 'A', es: 'B' })).toEqual({ fr: 'A', en: '', es: 'B', it: '' })
  })
})

describe('canAddCategory', () => {
  it('s’arrête à 24 catégories', () => {
    expect(canAddCategory(23)).toBe(true)
    expect(canAddCategory(24)).toBe(false)
  })
})

describe('filterGameIds', () => {
  const titles: Record<string, string> = { [first]: 'Écarté', [second]: 'Pile ou face', [third]: 'Autre' }
  const titleOf = (id: string) => titles[id]

  it('renvoie tout sans recherche', () => {
    expect(filterGameIds([first, second], '  ', titleOf)).toEqual([first, second])
  })

  it('ignore accents et casse', () => {
    expect(filterGameIds([first, second, third], 'ecarte', titleOf)).toEqual([first])
    expect(filterGameIds([first, second, third], 'PILE', titleOf)).toEqual([second])
    expect(filterGameIds([first, second, third], 'zzz', titleOf)).toEqual([])
  })
})
