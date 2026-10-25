import { describe, expect, it } from 'vitest'
import {
  formatPlayerNameHtml,
  getPlayerFrameClass,
  getSpecialEffectClass,
  isSpecialPlayer,
} from './playerUtils'

/**
 * formatPlayerNameHtml part en HTML brut (dangerouslySetInnerHTML du Petit
 * Buveur local) : l'effet de pseudo, venu du stockage ou du nuage d'un autre
 * compte, y entrait tel quel dans l'attribut class.
 */

const PAYLOAD = 'fire"><img src=x onerror=alert(document.domain)>'

describe('formatPlayerNameHtml — effet hors catalogue', () => {
  it('la charge du constat ne produit plus aucune balise ni gestionnaire', () => {
    const html = formatPlayerNameHtml({ name: 'Marie', preferences: { specialEffect: PAYLOAD } })
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onerror')
    expect(html).toBe('<span class="player-name player-name-default font-semibold">Marie</span>')
  })

  it('un effet du catalogue garde exactement le HTML d’avant', () => {
    expect(formatPlayerNameHtml({ name: 'Marie', preferences: { specialEffect: 'fire' } })).toBe(
      '<span class="player-name player-name-special special-player-name-fire font-semibold">Marie</span>'
    )
    expect(formatPlayerNameHtml({ name: 'Léo' })).toBe(
      '<span class="player-name player-name-default font-semibold">Léo</span>'
    )
  })

  it('nom et compliment restent échappés', () => {
    const html = formatPlayerNameHtml({ name: '<b>x</b>' }, { compliment: '"><script>' })
    expect(html).not.toContain('<b>')
    expect(html).not.toContain('<script>')
  })
})

describe('getSpecialEffectClass / isSpecialPlayer', () => {
  it('n’acceptent que les identifiants de PLAYER_EFFECTS', () => {
    expect(getSpecialEffectClass({ name: 'Marie', preferences: { specialEffect: PAYLOAD } })).toBe('')
    expect(isSpecialPlayer({ name: 'Marie', preferences: { specialEffect: PAYLOAD } })).toBe(false)
    // Exclusif en ligne : aucune classe locale.
    expect(getSpecialEffectClass({ name: 'Marie', preferences: { specialEffect: 'toast' } })).toBe('')
    expect(getSpecialEffectClass({ name: 'Marie', preferences: { specialEffect: 'galaxy' } })).toBe(
      'special-player-name-galaxy'
    )
  })

  it('Sim et Riqui gardent leur effet par défaut', () => {
    expect(getSpecialEffectClass({ name: 'Sim', preferences: { specialEffect: PAYLOAD } })).toBe(
      'special-player-name-fire'
    )
    expect(isSpecialPlayer('riqui')).toBe(true)
  })
})

describe('getPlayerFrameClass', () => {
  it('n’accepte que les cadres de PLAYER_FRAMES', () => {
    expect(getPlayerFrameClass('gold')).toBe('player-icon-frame player-icon-frame-gold')
    expect(getPlayerFrameClass('gold x" onmouseover="alert(1)')).toBe('')
    expect(getPlayerFrameClass('alien')).toBe('')
    expect(getPlayerFrameClass(null)).toBe('')
  })
})
