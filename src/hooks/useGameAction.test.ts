import { describe, expect, it } from 'vitest'
import { gameActionErrorCode } from './useGameAction'

/**
 * Règle du retour d'action : on parle au joueur quand SON coup est refusé,
 * et on se tait sur les conflits de version — les ticks de service (bot,
 * advance, remplacement) en produisent en permanence et un message à chaque
 * fois transformerait la partie en pluie d'alertes.
 */

describe('gameActionErrorCode', () => {
  it('reste muet quand le coup est accepté', () => {
    expect(gameActionErrorCode(200, undefined)).toBeNull()
    expect(gameActionErrorCode(201, undefined)).toBeNull()
  })

  it('reste muet sur les issues normales du jeu (200 + code)', () => {
    // Crobard : une réponse fausse n'est pas un refus, le composant a son
    // propre retour visuel.
    expect(gameActionErrorCode(200, 'GUESS_WRONG')).toBeNull()
    expect(gameActionErrorCode(200, 'GUESS_CLOSE')).toBeNull()
  })

  it('reste muet sur les conflits de version (409)', () => {
    expect(gameActionErrorCode(409, 'version_conflict')).toBeNull()
    expect(gameActionErrorCode(409, 'PHASE_CHANGED')).toBeNull()
    expect(gameActionErrorCode(409, 'NOTHING_TO_REPLACE')).toBeNull()
  })

  it('traduit les codes stables des refus', () => {
    expect(gameActionErrorCode(403, 'not_your_turn')).toBe('not_your_turn')
    expect(gameActionErrorCode(400, 'invalid_action')).toBe('invalid_action')
    expect(gameActionErrorCode(403, 'replaced_by_bot')).toBe('replaced_by_bot')
  })

  it('accepte les codes majuscules historiques des moteurs', () => {
    expect(gameActionErrorCode(403, 'NOT_YOUR_TURN')).toBe('not_your_turn')
  })

  it('retombe sur le générique plutôt que d’afficher du brut', () => {
    expect(gameActionErrorCode(403, 'NOT_BOT_TURN')).toBe('action_failed')
    expect(gameActionErrorCode(400, 'Action invalide')).toBe('action_failed')
    expect(gameActionErrorCode(500, undefined)).toBe('action_failed')
  })
})
