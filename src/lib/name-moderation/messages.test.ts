import { describe, expect, it } from 'vitest'
import { getModerationErrorMessage } from './messages'

describe('getModerationErrorMessage', () => {
  it('retourne le message FR par défaut', () => {
    expect(getModerationErrorMessage('profanity', 'fr')).toBe(
      'Ce nom contient un langage inapproprié'
    )
  })

  it('localise en anglais', () => {
    expect(getModerationErrorMessage('empty', 'en')).toBe('Name required')
  })

  it('localise en espagnol', () => {
    expect(getModerationErrorMessage('too_long', 'es')).toBe('Nombre demasiado largo')
  })

  it('localise en italien pour les joueurs', () => {
    expect(getModerationErrorMessage('invalid_characters', 'it', 'player')).toBe(
      'Caratteri non consentiti'
    )
  })
})
