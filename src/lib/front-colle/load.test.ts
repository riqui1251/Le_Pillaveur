import { describe, expect, it } from 'vitest'
import type { FcWord } from './data/types'
import { cleanFcWords, fcLangOf } from './load'

describe('fcLangOf', () => {
  it('langues du site telles quelles, le reste en français', () => {
    expect(fcLangOf('en')).toBe('en')
    expect(fcLangOf('es')).toBe('es')
    expect(fcLangOf('it')).toBe('it')
    expect(fcLangOf('de')).toBe('fr')
    expect(fcLangOf(undefined)).toBe('fr')
  })
})

describe('cleanFcWords', () => {
  it('écarte les doublons d’id, les mots vides et les thèmes inconnus ; « décris » toujours permis', () => {
    const raw = [
      { id: 'fr-objets-01', theme: 'objets', word: ' Parapluie ', modes: ['mime'] },
      { id: 'fr-objets-01', theme: 'objets', word: 'Doublon', modes: ['describe'] },
      { id: 'fr-objets-02', theme: 'objets', word: '   ', modes: ['describe'] },
      { id: 'fr-autre-01', theme: 'autre', word: 'Hors thème', modes: ['describe'] },
      { id: 'fr-musique-01', theme: 'musique', word: 'La Marseillaise', modes: ['hum', 'describe', 'chant'] },
    ] as unknown as FcWord[]
    expect(cleanFcWords(raw)).toEqual([
      { id: 'fr-objets-01', theme: 'objets', word: 'Parapluie', modes: ['describe', 'mime'] },
      { id: 'fr-musique-01', theme: 'musique', word: 'La Marseillaise', modes: ['describe', 'hum'] },
    ])
  })
})
