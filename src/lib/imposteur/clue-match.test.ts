import { describe, expect, it } from 'vitest'
import { clueKey, clueMatches } from './clue-match'

describe('clueMatches', () => {
  it('accents et majuscules : « Été » vaut « ete »', () => {
    expect(clueMatches('Été', ['ete'])).toBe(true)
    expect(clueMatches('ete', ['été'])).toBe(true)
  })

  it('pluriel et racine : vagues ↔ vague, nageuse ↔ nageurs', () => {
    expect(clueMatches('vagues', ['vague'])).toBe(true)
    expect(clueMatches('vague', ['vagues'])).toBe(true)
    expect(clueMatches('serviettes', ['serviette'])).toBe(true)
    expect(clueMatches('nageuse', ['nageurs'])).toBe(true)
  })

  it('apostrophe courbe, tirets et espaces', () => {
    expect(clueMatches("crème d'été", ['crème d’été'])).toBe(true)
    expect(clueMatches('maitre nageur', ['maître-nageur'])).toBe(true)
    expect(clueMatches('Maître-Nageur', ['maitre  nageur'])).toBe(true)
  })

  it('sous-chaîne longue dans les deux sens', () => {
    expect(clueMatches('sable', ['sable fin'])).toBe(true)
    expect(clueMatches('sable fin', ['sable'])).toBe(true)
  })

  it('refuse les petits mots : port ≠ sport, la ≠ plage, vin ≠ vinaigre', () => {
    expect(clueMatches('port', ['sport'])).toBe(false)
    expect(clueMatches('sport', ['port'])).toBe(false)
    expect(clueMatches('la', ['plage'])).toBe(false)
    expect(clueMatches('vin', ['vinaigre'])).toBe(false)
  })

  it('rien ne vaut rien : vide, « … », liste vide, indice étranger', () => {
    expect(clueMatches('', ['été'])).toBe(false)
    expect(clueMatches('…', ['été'])).toBe(false)
    expect(clueMatches('été', [])).toBe(false)
    expect(clueMatches('chlore', ['été', 'serviette', 'sable'])).toBe(false)
  })
})

describe('clueKey', () => {
  it('forme canonique : minuscules, sans accent, apostrophe droite, un seul espace', () => {
    expect(clueKey('  Maître-Nageur ')).toBe('maitre nageur')
    expect(clueKey('crème d’été')).toBe("creme d'ete")
    expect(clueKey('bonnet   de_bain')).toBe('bonnet de bain')
  })
})
