import { describe, expect, it } from 'vitest'
import { SOIREE_GAME_IDS } from '@/lib/soiree/catalog'
import { BADGE_CREAM, BADGE_INK, BADGE_MIN_CONTRAST, badgeBackground, badgeInkFor, contrastRatio } from './badge-contrast'

describe('contrastRatio', () => {
  it('vaut 21 entre noir et blanc, 1 entre deux couleurs identiques', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5)
  })

  it('lit aussi les couleurs courtes', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5)
  })
})

describe('badgeInkFor', () => {
  it('ne renvoie que le crème ou l’encre', () => {
    for (const id of SOIREE_GAME_IDS) {
      expect([BADGE_CREAM, BADGE_INK]).toContain(badgeInkFor(id).color)
    }
  })

  it.each(SOIREE_GAME_IDS.map((id) => [id]))('%s : contraste minimal d’au moins 3:1', (id) => {
    expect(badgeInkFor(id).contrast).toBeGreaterThanOrEqual(BADGE_MIN_CONTRAST)
  })

  // Voile seulement quand ni le crème ni l'encre ne suffisent : dégradés à la fois sombres et clairs.
  // Liste figée pour qu'un changement de couleur qui assombrit une pastille ne passe pas inaperçu.
  it('voile réservé aux dégradés sombre → clair, jamais plus de 45 %', () => {
    const veiled = SOIREE_GAME_IDS.filter((id) => badgeInkFor(id).veil > 0)
    expect([...veiled].sort()).toEqual(['1220', 'blackjack', 'coupe-du-roi', 'monsieur-3'])
    for (const id of veiled) {
      expect(badgeInkFor(id).color).toBe(BADGE_CREAM)
      expect(badgeInkFor(id).veil).toBeLessThanOrEqual(0.45)
    }
  })

  it('le fond n’ajoute un voile que s’il y en a un', () => {
    expect(badgeBackground('linear-gradient(red, blue)', 0)).toBe('linear-gradient(red, blue)')
    expect(badgeBackground('linear-gradient(red, blue)', 0.3)).toBe(
      'linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), linear-gradient(red, blue)'
    )
  })

  it('passe à l’encre sur un dégradé clair', () => {
    const inks = SOIREE_GAME_IDS.map((id) => badgeInkFor(id).color)
    expect(inks).toContain(BADGE_INK)
    expect(inks).toContain(BADGE_CREAM)
  })
})
