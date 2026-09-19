import { describe, expect, it } from 'vitest'
import { gameActionErrorCode, serverViewFromActionResponse } from './useGameAction'

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

/**
 * La vue d'une action ne remplace le sondage que si elle est EXACTEMENT ce
 * que GET /state aurait rendu : la chaîne `viewJson` ET le joueur au tour.
 * Un morceau manquant, et on laisse le sondage faire — jamais d'état à moitié
 * appliqué.
 */
describe('serverViewFromActionResponse', () => {
  const full = { ok: true, stateVersion: 6, viewJson: '{"v":6}', currentTurnUserId: 'u2' }

  it('reprend la vue complète, telle que GET /state la rendrait', () => {
    expect(serverViewFromActionResponse('r1', full)).toEqual({
      roomId: 'r1',
      stateVersion: 6,
      gameStateJson: '{"v":6}',
      currentTurnUserId: 'u2',
    })
  })

  it('accepte un tour vide (phase simultanée, partie finie)', () => {
    expect(serverViewFromActionResponse('r1', { ...full, currentTurnUserId: null })).toMatchObject({
      currentTurnUserId: null,
    })
  })

  it('refuse une réponse sans joueur au tour (la route ne le renvoie pas aujourd’hui)', () => {
    const { currentTurnUserId: _omitted, ...withoutTurn } = full
    expect(serverViewFromActionResponse('r1', withoutTurn)).toBeNull()
    expect(serverViewFromActionResponse('r1', { ...full, currentTurnUserId: 3 })).toBeNull()
  })

  it('refuse une réponse sans chaîne viewJson (objet `view` seul, ou viewJson non sérialisé)', () => {
    expect(serverViewFromActionResponse('r1', { ok: true, stateVersion: 6, view: { v: 6 }, currentTurnUserId: 'u2' })).toBeNull()
    expect(serverViewFromActionResponse('r1', { ...full, viewJson: { v: 6 } })).toBeNull()
  })

  it('refuse une réponse sans version exploitable', () => {
    const { stateVersion: _omitted, ...withoutVersion } = full
    expect(serverViewFromActionResponse('r1', withoutVersion)).toBeNull()
    expect(serverViewFromActionResponse('r1', { ...full, stateVersion: '6' })).toBeNull()
    expect(serverViewFromActionResponse('r1', { ...full, stateVersion: Number.NaN })).toBeNull()
  })

  it('refuse les corps d’erreur et les issues de jeu sans vue (GUESS_WRONG)', () => {
    expect(serverViewFromActionResponse('r1', { error: 'GUESS_WRONG' })).toBeNull()
    expect(serverViewFromActionResponse('r1', {})).toBeNull()
  })
})
