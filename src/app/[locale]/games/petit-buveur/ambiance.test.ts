import { describe, expect, it } from 'vitest'

import {
  ALCOHOL_DEFI_INDEXES,
  ALCOHOL_WHEEL_CHALLENGE_INDEX,
  resolveAmbianceMode,
  withAmbiance,
} from './ambiance'
import type { PetitBuveurT } from './case-config'

type DefiItem = { text: string; drinks: number }

const MESSAGES: Record<string, unknown> = {
  'caseDescriptions.gorgée': 'Bois {count} gorgée(s) !',
  'soft.caseDescriptions.gorgée': 'Prends {count} gage(s) !',
  'caseDescriptions.recul': 'Recule de 1 case !',
  'soft.defiWheelChallenge': 'Tu prends 2 gages',
}

/** 36 défis factices : seuls ceux des index alcoolisés portent un texte reconnaissable. */
const DEFIS: DefiItem[] = Array.from({ length: 36 }, (_, i) => ({
  text: ALCOHOL_DEFI_INDEXES.includes(i) ? `alcool-${i}` : `defi-${i}`,
  drinks: 2,
}))

const WHEEL: string[] = Array.from({ length: 12 }, (_, i) => `roue-${i}`)

const SOFT_DEFIS: DefiItem[] = [{ text: 'soft-a', drinks: 2 }]

/**
 * `withSoftKeys: false` simule l'état réel du dépôt tant que les traductions
 * Soft ne sont pas encore en place : le mode Soft doit alors rester inoffensif.
 */
function makeT(withSoftKeys = true): PetitBuveurT {
  const messages = withSoftKeys
    ? MESSAGES
    : Object.fromEntries(Object.entries(MESSAGES).filter(([key]) => !key.startsWith('soft.')))
  const softRawKeys = withSoftKeys ? ['soft.defis'] : []

  const t = ((key: string, values?: Record<string, string | number>) => {
    const raw = messages[key]
    if (typeof raw !== 'string') return key
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? ''))
  }) as PetitBuveurT
  t.raw = (key: string) => {
    if (key === 'defis') return DEFIS
    if (key === 'defiWheelChallenges') return WHEEL
    if (key === 'soft.defis') return withSoftKeys ? SOFT_DEFIS : undefined
    return messages[key]
  }
  t.has = (key: string) =>
    key in messages || ['defis', 'defiWheelChallenges', ...softRawKeys].includes(key)
  return t
}

describe('resolveAmbianceMode', () => {
  it('ne retient « soft » que sur la valeur exacte', () => {
    expect(resolveAmbianceMode('soft')).toBe('soft')
    expect(resolveAmbianceMode('alcool')).toBe('alcool')
    expect(resolveAmbianceMode(undefined)).toBe('alcool')
    expect(resolveAmbianceMode(null)).toBe('alcool')
  })
})

describe('withAmbiance', () => {
  it('laisse le jeu intact en ambiance alcool', () => {
    const t = makeT()
    expect(withAmbiance(t, 'alcool')).toBe(t)
  })

  it('bascule sur la formulation Soft quand elle existe', () => {
    const t = withAmbiance(makeT(), 'soft')
    expect(t('caseDescriptions.gorgée', { count: 3 })).toBe('Prends 3 gage(s) !')
  })

  it('retombe sur la formulation d’origine quand aucune variante Soft n’existe', () => {
    const t = withAmbiance(makeT(), 'soft')
    expect(t('caseDescriptions.recul')).toBe('Recule de 1 case !')
  })

  it('remplace les défis alcoolisés au lieu de les faire disparaître', () => {
    const t = withAmbiance(makeT(), 'soft')
    const defis = t.raw('defis') as DefiItem[]
    expect(defis.some(d => d.text.startsWith('alcool-'))).toBe(false)
    expect(defis).toContainEqual({ text: 'soft-a', drinks: 2 })
    expect(defis).toHaveLength(DEFIS.length - ALCOHOL_DEFI_INDEXES.length + SOFT_DEFIS.length)
  })

  it('garde les défis alcoolisés tant qu’aucun remplaçant Soft n’est traduit', () => {
    // Sans cette garde, le mode Soft SUPPRIMAIT deux défis au lieu de les
    // reformuler : le jeu s'appauvrissait au lieu de changer de ton.
    const t = withAmbiance(makeT(false), 'soft')
    const defis = t.raw('defis') as DefiItem[]
    expect(defis).toHaveLength(DEFIS.length)
    for (const index of ALCOHOL_DEFI_INDEXES) {
      expect(defis[index]).toEqual(DEFIS[index])
    }
  })

  it('garde la roue intacte tant que la case Soft n’est pas traduite', () => {
    const t = withAmbiance(makeT(false), 'soft')
    const wheel = t.raw('defiWheelChallenges') as string[]
    expect(wheel).toEqual(WHEEL)
  })

  it('remplace la seule case alcoolisée de la roue des défis', () => {
    const t = withAmbiance(makeT(), 'soft')
    const wheel = t.raw('defiWheelChallenges') as string[]
    expect(wheel[ALCOHOL_WHEEL_CHALLENGE_INDEX]).toBe('Tu prends 2 gages')
    expect(wheel).toHaveLength(WHEEL.length)
    expect(wheel[0]).toBe('roue-0')
  })
})
