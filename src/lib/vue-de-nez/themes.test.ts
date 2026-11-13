import { describe, expect, it } from 'vitest'
import { VDN_DEFAULT_QUESTION_COUNT, VDN_QUESTION_COUNTS, normalizeVdnThemes } from './engine'
import {
  VDN_LOBBY_COUNTS,
  VDN_LOBBY_DEFAULT_COUNT,
  VDN_THEMES,
  readVdnCountSetting,
  readVdnRoomSettings,
  readVdnThemesSetting,
} from './themes'

describe('réglages de table d’À Vue de Nez', () => {
  it('mêmes choix et même défaut que le jeu local', () => {
    expect([...VDN_LOBBY_COUNTS]).toEqual([...VDN_QUESTION_COUNTS])
    expect(VDN_LOBBY_DEFAULT_COUNT).toBe(VDN_DEFAULT_QUESTION_COUNT)
  })

  it('thèmes : liste blanche, sans doublon, dans l’ordre canonique', () => {
    expect(readVdnThemesSetting(['sport', 'corps', 'sport'])).toEqual(['corps', 'sport'])
    expect(readVdnThemesSetting(['sport', 'corps'])).toEqual(normalizeVdnThemes(['sport', 'corps']))
    expect(readVdnThemesSetting([])).toEqual([])
    expect(readVdnThemesSetting([...VDN_THEMES])).toEqual([])
  })

  it('thèmes : toute valeur douteuse est refusée en bloc', () => {
    for (const value of [undefined, null, 'sport', { sport: true }, ['sport', 'cuisine'], ['sport', 3]]) {
      expect(readVdnThemesSetting(value)).toBeNull()
    }
  })

  it('nombre de questions : 5, 10 ou 15, sinon 10', () => {
    expect(readVdnCountSetting(15)).toBe(15)
    expect(readVdnCountSetting(7)).toBe(10)
    expect(readVdnCountSetting('5')).toBe(10)
  })

  it('lecture des réglages de la salle par le lanceur', () => {
    expect(readVdnRoomSettings({ difficulty: 'normal' })).toEqual({ questionCount: 10, themes: [] })
    expect(readVdnRoomSettings({ vdnCount: 5, vdnThemes: ['histoire', 'sport'] })).toEqual({
      questionCount: 5,
      themes: ['histoire', 'sport'],
    })
    expect(readVdnRoomSettings({ vdnCount: 99, vdnThemes: ['inconnu'] })).toEqual({ questionCount: 10, themes: [] })
  })
})
